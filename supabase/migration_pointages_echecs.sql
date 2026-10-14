-- ============================================================================
-- Reno-K — Journal des pointages refusés par le serveur
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
--
-- Quand la base refuse un pointage (règle de sécurité, contrainte...), le
-- téléphone le garde en file locale et le renvoie automatiquement. Cette
-- table permet en plus à l'admin de VOIR ces refus dans la vue du jour, au
-- lieu que le pointage reste invisible sur le téléphone de l'ouvrier.
-- ============================================================================

create table if not exists public.pointages_echecs (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  ouvrier_id uuid not null references public.profiles(id) on delete cascade,
  chantier_id uuid references public.chantiers(id) on delete set null,
  type text not null,
  heure_appareil timestamptz not null,
  erreur_code text,
  erreur_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pointages_echecs_heure_idx on public.pointages_echecs(heure_appareil desc);

alter table public.pointages_echecs enable row level security;

-- L'ouvrier peut signaler ses propres échecs, même si son compte est bloqué
-- (c'est justement un cas qu'on veut voir remonter).
create policy "echecs: ouvrier signale les siens" on public.pointages_echecs
  for insert with check (ouvrier_id = auth.uid());
create policy "echecs: ouvrier met a jour les siens" on public.pointages_echecs
  for update using (ouvrier_id = auth.uid());
create policy "echecs: ouvrier lit les siens" on public.pointages_echecs
  for select using (ouvrier_id = auth.uid());
create policy "echecs: admin lit tout" on public.pointages_echecs
  for select using (public.is_admin());

-- Temps réel : la vue du jour se met à jour dès qu'un refus est signalé.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pointages_echecs'
  ) then
    alter publication supabase_realtime add table public.pointages_echecs;
  end if;
end $$;
