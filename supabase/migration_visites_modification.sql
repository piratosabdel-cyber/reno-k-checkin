-- ============================================================================
-- La commerciale peut modifier ses visites des 7 derniers jours (oubli,
-- batterie à plat…). GPS, heures et photo restent figés par visites_proteger ;
-- l'admin voit la date de la dernière modification.
-- À exécuter après migration_visites_commerciales.sql. Ré-exécutable.
-- ============================================================================

alter table public.visites add column if not exists modifiee_le timestamptz;

create or replace function public.visites_proteger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.heure_serveur := now();
    new.modifiee_le := null;
    new.drive_dossier_id := null;
    new.drive_rapport_id := null;
    new.drive_archive_at := null;
    new.drive_erreur := null;
    return new;
  end if;

  if public.is_admin() or auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;

  new.client_uuid := old.client_uuid;
  new.commercial_id := old.commercial_id;
  new.commerce_id := old.commerce_id;
  new.lat_ouverture := old.lat_ouverture;
  new.lng_ouverture := old.lng_ouverture;
  new.precision_ouverture_m := old.precision_ouverture_m;
  new.lat_envoi := old.lat_envoi;
  new.lng_envoi := old.lng_envoi;
  new.precision_envoi_m := old.precision_envoi_m;
  new.adresse_gps := old.adresse_gps;
  new.heure_ouverture := old.heure_ouverture;
  new.heure_appareil := old.heure_appareil;
  new.heure_serveur := old.heure_serveur;
  new.photo_path := old.photo_path;
  new.photo_prise_a := old.photo_prise_a;
  new.synchro_differee := old.synchro_differee;
  new.appareil_id := old.appareil_id;
  new.modele_appareil := old.modele_appareil;
  new.drive_dossier_id := old.drive_dossier_id;
  new.drive_rapport_id := old.drive_rapport_id;
  -- Compléter une visite « à compléter » est prévu ; toute autre retouche
  -- est datée pour l'admin.
  new.modifiee_le := case when old.a_completer then old.modifiee_le else now() end;
  -- Il faudra mettre à jour le rapport dans Drive.
  new.drive_archive_at := null;
  new.drive_erreur := old.drive_erreur;
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists "visites: completer" on public.visites;
drop policy if exists "visites: modifier" on public.visites;
create policy "visites: modifier" on public.visites
  for update using (
    public.is_admin()
    or (commercial_id = auth.uid() and public.is_commercial_actif()
        and heure_serveur > now() - interval '7 days')
  );
