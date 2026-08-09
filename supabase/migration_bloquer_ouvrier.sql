-- ============================================================================
-- Reno-K — Blocage réel d'un ouvrier désactivé
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
--
-- Le champ profiles.active existait déjà (bouton "Archiver") mais ne
-- bloquait rien de concret : un ouvrier désactivé pouvait quand même
-- pointer. Cette policy l'empêche réellement au niveau de la base.
-- ============================================================================

drop policy if exists "pointages: ouvrier cree pour lui-meme" on public.pointages;

create policy "pointages: ouvrier actif cree pour lui-meme" on public.pointages
  for insert with check (
    ouvrier_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and active)
  );
