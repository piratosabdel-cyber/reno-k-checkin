-- ============================================================================
-- Reno-K — Check-in chantier
-- Schéma de base de données Supabase (Postgres + RLS)
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- (ou via `supabase db push` si tu utilises la CLI Supabase)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES (utilisateurs applicatifs, 1:1 avec auth.users)
--    role = 'admin' | 'ouvrier'
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

-- Fonction utilitaire : l'utilisateur courant est-il admin ?
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

-- Crée automatiquement un profil "ouvrier" à l'inscription d'un nouvel utilisateur
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
  latitude double precision,
  longitude double precision,
  rayon_metres integer not null default 200, -- tolérance géofence pour le check-in
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
-- 4. POINTAGES (check-in / check-out)
-- ----------------------------------------------------------------------------
create table if not exists public.pointages (
  id uuid primary key default gen_random_uuid(),
  ouvrier_id uuid not null references public.profiles(id) on delete cascade,
  chantier_id uuid not null references public.chantiers(id) on delete restrict,
  check_in_at timestamptz not null default now(),
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_distance_m integer, -- distance calculée entre position ouvrier et chantier
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  created_at timestamptz not null default now()
);

create index if not exists pointages_ouvrier_idx on public.pointages(ouvrier_id, check_in_at desc);
create index if not exists pointages_chantier_idx on public.pointages(chantier_id, check_in_at desc);
-- Un ouvrier ne peut avoir qu'un seul pointage "ouvert" (sans check-out) à la fois
create unique index if not exists pointages_one_open_per_ouvrier
  on public.pointages(ouvrier_id)
  where check_out_at is null;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.chantiers enable row level security;
alter table public.chantier_assignments enable row level security;
alter table public.pointages enable row level security;

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
create policy "pointages: ouvrier lit les siens" on public.pointages
  for select using (ouvrier_id = auth.uid() or public.is_admin());
create policy "pointages: ouvrier check-in pour lui-meme" on public.pointages
  for insert with check (ouvrier_id = auth.uid());
create policy "pointages: ouvrier check-out le sien" on public.pointages
  for update using (ouvrier_id = auth.uid() or public.is_admin());

-- ============================================================================
-- DONNÉES DE DÉPART (optionnel — commente/adapte selon besoin)
-- ============================================================================
-- insert into public.chantiers (nom, adresse) values
--   ('Hagebeuk 22', 'Hagebeuk 22, Merchtem'),
--   ('Londerzeel', 'Rozenstraat 22, Londerzeel'),
--   ('Stockel église', 'Stockel, Woluwe-Saint-Pierre'),
--   ('Overnelleweg', 'Overnelleweg, Ternat'),
--   ('Witteramsdal 93', 'Witteramsdal 93, Asse'),
--   ('Rosedale', 'Rosedale');
