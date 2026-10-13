-- ============================================================================
-- Migration : les ouvriers peuvent PROPOSER un nouveau chantier, l'admin
-- doit l'approuver avant qu'il n'apparaisse dans l'écran de pointage.
--
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================================

-- 1. Nouveaux statuts : 'en_attente' (proposé, pas encore approuvé) et 'refuse'.
alter table public.chantiers drop constraint if exists chantiers_statut_check;
alter table public.chantiers
  add constraint chantiers_statut_check
  check (statut in ('actif', 'termine', 'en_attente', 'refuse'));

-- 2. Qui a proposé le chantier, et quand l'admin a tranché.
alter table public.chantiers
  add column if not exists propose_par uuid references public.profiles(id) on delete set null,
  add column if not exists date_decision timestamptz;

-- 3. Un ouvrier actif peut créer un chantier UNIQUEMENT en statut 'en_attente'
--    et UNIQUEMENT en son propre nom. Il ne peut ni le modifier ni le supprimer
--    ensuite (seules les policies admin existantes le permettent).
drop policy if exists "chantiers: ouvrier propose" on public.chantiers;
create policy "chantiers: ouvrier propose" on public.chantiers
  for insert with check (
    propose_par = auth.uid()
    and statut = 'en_attente'
    and exists (select 1 from public.profiles where id = auth.uid() and active)
  );

-- 4. Temps réel sur la table chantiers (pour la notification admin instantanée).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chantiers'
  ) then
    alter publication supabase_realtime add table public.chantiers;
  end if;
end $$;
