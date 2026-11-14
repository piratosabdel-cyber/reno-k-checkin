-- ============================================================================
-- Véhicules + GPS PAJ : km par jour et contrôle mensuel des incohérences.
-- Les données sont écrites par la fonction serveur /api/paj-sync (clé
-- service_role). Seul l'admin peut les lire et modifier la fiche véhicule.
-- ============================================================================

-- Un véhicule = un traceur PAJ. Créé automatiquement à la première synchro,
-- l'admin complète ensuite plaque, chauffeur et carte Lukoil.
create table if not exists public.vehicules (
  id uuid primary key default gen_random_uuid(),
  paj_device_id bigint not null unique,
  paj_imei text,
  nom text not null,
  plaque text,
  ouvrier_id uuid references public.profiles(id) on delete set null,
  carte_lukoil text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Kilomètres par véhicule et par jour (heure de Bruxelles).
create table if not exists public.vehicules_km_jour (
  vehicule_id uuid not null references public.vehicules(id) on delete cascade,
  jour date not null,
  km numeric(7,1) not null default 0,
  km_paj numeric(7,1),
  points integer not null default 0,
  premier_mouvement text,
  dernier_mouvement text,
  depart_lat double precision,
  depart_lng double precision,
  arrivee_lat double precision,
  arrivee_lng double precision,
  maj_le timestamptz not null default now(),
  primary key (vehicule_id, jour)
);

-- Incohérences détectées pour un mois (recalculées à chaque contrôle).
create table if not exists public.vehicules_controles (
  id uuid primary key default gen_random_uuid(),
  mois date not null,
  vehicule_id uuid not null references public.vehicules(id) on delete cascade,
  jour date,
  type text not null,
  gravite text not null check (gravite in ('info', 'attention', 'alerte')),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists vehicules_controles_mois_idx on public.vehicules_controles (mois);

-- Journal des synchronisations (manuelles ou automatiques).
create table if not exists public.vehicules_synchros (
  id uuid primary key default gen_random_uuid(),
  mois date not null,
  origine text not null check (origine in ('manuel', 'automatique')),
  lance_par uuid references public.profiles(id) on delete set null,
  debut timestamptz not null default now(),
  fin timestamptz,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'ok', 'erreur')),
  message text
);

alter table public.vehicules enable row level security;
alter table public.vehicules_km_jour enable row level security;
alter table public.vehicules_controles enable row level security;
alter table public.vehicules_synchros enable row level security;

drop policy if exists "vehicules: admin lit" on public.vehicules;
create policy "vehicules: admin lit" on public.vehicules for select using (public.is_admin());
drop policy if exists "vehicules: admin modifie" on public.vehicules;
create policy "vehicules: admin modifie" on public.vehicules for update using (public.is_admin());

drop policy if exists "km: admin lit" on public.vehicules_km_jour;
create policy "km: admin lit" on public.vehicules_km_jour for select using (public.is_admin());

drop policy if exists "controles: admin lit" on public.vehicules_controles;
create policy "controles: admin lit" on public.vehicules_controles for select using (public.is_admin());

drop policy if exists "synchros: admin lit" on public.vehicules_synchros;
create policy "synchros: admin lit" on public.vehicules_synchros for select using (public.is_admin());
