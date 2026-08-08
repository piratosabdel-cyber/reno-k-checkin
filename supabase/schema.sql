-- ============================================================================
-- Reno-K — Check-in chantier (MVP v2)
-- Schéma de base de données Supabase (Postgres + RLS)
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- (ou via `supabase db push` si tu utilises la CLI Supabase)
--
-- Ce fichier crée TOUT depuis zéro. Si un projet Supabase existe déjà avec
-- l'ancien schéma, ne lance pas ce fichier tel quel — demande d'abord un
-- script de migration pour ne pas perdre de données.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES (utilisateurs applicatifs, 1:1 avec auth.users)
--    role = 'admin' | 'ouvrier'  (le rôle "responsable de chantier" arrive en V2)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'ouvrier' check (role in ('admin', 'ouvrier')),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Un profil par utilisateur (admin ou ouvrier), lié à auth.users';

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'ouvrier')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. CHANTIERS
-- ----------------------------------------------------------------------------
create table if not exists public.chantiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  adresse text not null,
  client text,
  latitude double precision,
  longitude double precision,
  rayon_metres integer not null default 200,
  -- Que faire si un ouvrier pointe hors du rayon autorisé ?
  --  'bloquer'   : le pointage est refusé, l'ouvrier ne peut pas continuer
  --  'justifier' : le pointage est accepté mais l'ouvrier doit écrire un motif
  mode_hors_zone text not null default 'justifier' check (mode_hors_zone in ('bloquer', 'justifier')),
  date_debut date,
  date_fin date,
  statut text not null default 'actif' check (statut in ('actif', 'termine')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. ASSIGNATIONS (quel ouvrier est prévu sur quel chantier)
-- ----------------------------------------------------------------------------
create table if not exists public.chantier_assignments (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  ouvrier_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (chantier_id, ouvrier_id)
);

-- ----------------------------------------------------------------------------
-- 4. POINTAGES
--    Un pointage = UN évènement (arrivée, début de pause, fin de pause, départ).
--    Une journée d'un ouvrier sur un chantier = plusieurs lignes liées par
--    ouvrier_id + chantier_id + la date.
-- ----------------------------------------------------------------------------
create table if not exists public.pointages (
  id uuid primary key default gen_random_uuid(),

  -- Généré sur le téléphone AU MOMENT du pointage (avant même d'avoir du
  -- réseau). Sert de clé anti-doublon : si le même pointage est envoyé deux
  -- fois pendant la synchro hors-ligne, la deuxième tentative est ignorée.
  client_uuid uuid not null unique,

  ouvrier_id uuid not null references public.profiles(id) on delete cascade,
  chantier_id uuid not null references public.chantiers(id) on delete restrict,

  type text not null check (type in ('arrivee', 'pause_debut', 'pause_fin', 'depart')),

  -- Heure du téléphone au moment du pointage (peut être hors-ligne, donc
  -- antérieure à l'heure d'arrivée en base) et heure du serveur à la
  -- réception. Comparer les deux aide à détecter une horloge de téléphone
  -- trafiquée.
  heure_appareil timestamptz not null,
  heure_serveur timestamptz not null default now(),

  latitude double precision,
  longitude double precision,
  precision_gps_m double precision,
  distance_chantier_m integer,

  hors_zone boolean not null default false,
  justification text,
  statut text not null default 'accepte' check (statut in ('accepte', 'hors_zone', 'corrige', 'en_attente')),

  modele_telephone text,
  cree_hors_ligne boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists pointages_ouvrier_idx on public.pointages(ouvrier_id, heure_appareil desc);
create index if not exists pointages_chantier_idx on public.pointages(chantier_id, heure_appareil desc);

-- ----------------------------------------------------------------------------
-- 5. CORRECTIONS_AUDIT
--    Un ouvrier ne peut JAMAIS modifier un pointage depuis son écran (voir
--    policies RLS plus bas). Seul un admin peut corriger, et chaque
--    correction est tracée automatiquement ici (avant/après/qui/quand).
-- ----------------------------------------------------------------------------
create table if not exists public.corrections_audit (
  id uuid primary key default gen_random_uuid(),
  pointage_id uuid not null references public.pointages(id) on delete cascade,
  ancien_contenu jsonb not null,
  nouveau_contenu jsonb not null,
  modifie_par uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Capture automatiquement chaque UPDATE sur pointages (peu importe qui/quoi
-- fait la modification côté app) — impossible d'oublier de tracer.
create or replace function public.log_pointage_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.corrections_audit (pointage_id, ancien_contenu, nouveau_contenu, modifie_par)
  values (old.id, to_jsonb(old), to_jsonb(new), auth.uid());
  return new;
end;
$$;

drop trigger if exists on_pointage_updated on public.pointages;
create trigger on_pointage_updated
  after update on public.pointages
  for each row execute function public.log_pointage_correction();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.chantiers enable row level security;
alter table public.chantier_assignments enable row level security;
alter table public.pointages enable row level security;
alter table public.corrections_audit enable row level security;

-- PROFILES
create policy "profiles: lecture de son propre profil" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: admin lit tout" on public.profiles
  for select using (public.is_admin());
create policy "profiles: admin modifie tout" on public.profiles
  for update using (public.is_admin());
create policy "profiles: admin insere" on public.profiles
  for insert with check (public.is_admin());
create policy "profiles: admin supprime" on public.profiles
  for delete using (public.is_admin());

-- CHANTIERS
create policy "chantiers: tout utilisateur connecte peut lire" on public.chantiers
  for select using (auth.uid() is not null);
create policy "chantiers: admin ecrit" on public.chantiers
  for insert with check (public.is_admin());
create policy "chantiers: admin modifie" on public.chantiers
  for update using (public.is_admin());
create policy "chantiers: admin supprime" on public.chantiers
  for delete using (public.is_admin());

-- ASSIGNATIONS
create policy "assignations: ouvrier lit les siennes" on public.chantier_assignments
  for select using (ouvrier_id = auth.uid() or public.is_admin());
create policy "assignations: admin ecrit" on public.chantier_assignments
  for insert with check (public.is_admin());
create policy "assignations: admin supprime" on public.chantier_assignments
  for delete using (public.is_admin());

-- POINTAGES
-- Lecture : l'ouvrier voit uniquement les siens, l'admin voit tout.
create policy "pointages: ouvrier lit les siens" on public.pointages
  for select using (ouvrier_id = auth.uid() or public.is_admin());
-- Création : un ouvrier ne peut créer un pointage que pour lui-même.
create policy "pointages: ouvrier cree pour lui-meme" on public.pointages
  for insert with check (ouvrier_id = auth.uid());
-- Modification : réservée à l'admin. Un ouvrier ne peut PAS modifier un
-- pointage existant, même le sien (anti-fraude, voir corrections_audit).
create policy "pointages: admin modifie" on public.pointages
  for update using (public.is_admin());
-- Aucune policy DELETE : personne ne peut supprimer un pointage via l'API.

-- CORRECTIONS_AUDIT
create policy "audit: admin lit tout" on public.corrections_audit
  for select using (public.is_admin());
-- Pas de policy insert/update/delete : seul le trigger (security definer)
-- peut écrire dans cette table.

-- ============================================================================
-- DONNÉES DE DÉPART (optionnel — décommente et adapte selon besoin)
-- ============================================================================
-- insert into public.chantiers (nom, adresse, client) values
--   ('Hagebeuk 22', 'Hagebeuk 22, Merchtem', null),
--   ('Londerzeel', 'Rozenstraat 22, Londerzeel', null),
--   ('Stockel église', 'Stockel, Woluwe-Saint-Pierre', null),
--   ('Overnelleweg', 'Overnelleweg, Ternat', null),
--   ('Witteramsdal 93', 'Witteramsdal 93, Asse', null),
--   ('Rosedale', 'Rosedale', null);
