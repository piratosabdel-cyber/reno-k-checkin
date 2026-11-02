-- ============================================================================
-- Visites Adala : quantités changées après signature = nouveau bon à signer.
-- Le client re-signe sur la tablette, ou reçoit le bon (WhatsApp / e-mail)
-- et renvoie une copie signée. La commerciale peut aussi ajouter ou changer
-- la photo et l'adresse du commerce ; GPS et heures restent la preuve.
-- À exécuter après migration_visites_bon_commande.sql. Ré-exécutable.
-- ============================================================================

alter table public.visites add column if not exists bon_version int not null default 1;
alter table public.visites add column if not exists bon_client_envoye_le timestamptz;
alter table public.visites add column if not exists bon_client_canal text;
alter table public.visites add column if not exists bon_client_pdf_path text;

create or replace function public.visites_proteger_bon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Quantités changées sur un bon signé (ou déjà envoyé au client) : la
  -- version suivante repart de zéro, sauf la signature posée dans la même
  -- modification (client resté sur place).
  if tg_op = 'UPDATE'
     and (old.bon_signe_le is not null or old.bon_client_envoye_le is not null)
     and (new.plateaux is distinct from old.plateaux or new.palettes is distinct from old.palettes) then
    new.bon_version := old.bon_version + 1;
    new.bon_pdf_path := null;
    new.bon_envoye_le := null;
    new.bon_erreur := null;
    new.bon_client_envoye_le := null;
    new.bon_client_canal := null;
    new.bon_client_pdf_path := null;
    if new.bon_signe_le is not distinct from old.bon_signe_le then
      new.bon_signature_path := null;
      new.bon_signataire := null;
      new.bon_signe_le := null;
    end if;
    return new;
  end if;

  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.bon_version := 1;
    new.bon_pdf_path := null;
    new.bon_envoye_le := null;
    new.bon_erreur := null;
    new.bon_client_envoye_le := null;
    new.bon_client_canal := null;
    new.bon_client_pdf_path := null;
    return new;
  end if;
  new.bon_version := old.bon_version;
  new.bon_pdf_path := old.bon_pdf_path;
  new.bon_envoye_le := old.bon_envoye_le;
  new.bon_erreur := old.bon_erreur;
  new.bon_client_envoye_le := old.bon_client_envoye_le;
  new.bon_client_canal := old.bon_client_canal;
  new.bon_client_pdf_path := old.bon_client_pdf_path;
  if old.bon_signe_le is not null then
    new.bon_signature_path := old.bon_signature_path;
    new.bon_signataire := old.bon_signataire;
    new.bon_signe_le := old.bon_signe_le;
  end if;
  return new;
end;
$$;

-- Photo : la commerciale peut en ajouter ou en changer une, prise dans son
-- propre dossier. GPS, heures et appareil restent figés.
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
  if new.photo_path is distinct from old.photo_path
     and (new.photo_path is null or new.photo_path not like old.commercial_id::text || '/%') then
    new.photo_path := old.photo_path;
    new.photo_prise_a := old.photo_prise_a;
  end if;
  new.synchro_differee := old.synchro_differee;
  new.appareil_id := old.appareil_id;
  new.modele_appareil := old.modele_appareil;
  new.drive_dossier_id := old.drive_dossier_id;
  new.drive_rapport_id := old.drive_rapport_id;
  new.modifiee_le := case when old.a_completer then old.modifiee_le else now() end;
  new.drive_archive_at := null;
  new.drive_erreur := old.drive_erreur;
  new.updated_at := now();
  return new;
end;
$$;

-- Commerce : nom, type et maintenant l'adresse, depuis une visite récente.
drop function if exists public.modifier_commerce_visite(uuid, text, text);
create or replace function public.modifier_commerce_visite(
  p_visite uuid, p_nom text, p_type text, p_adresse text default null, p_commune text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commerce uuid;
begin
  if not public.is_commercial_actif() and not public.is_admin() then
    raise exception 'Non autorisé';
  end if;

  select commerce_id into v_commerce
  from public.visites
  where id = p_visite
    and (public.is_admin()
         or (commercial_id = auth.uid() and heure_serveur > now() - interval '7 days'));
  if v_commerce is null then
    raise exception 'Cette visite ne peut plus être modifiée';
  end if;

  if coalesce(trim(p_nom), '') = '' then
    raise exception 'Le nom du commerce est obligatoire';
  end if;

  update public.commerces
  set nom = trim(p_nom),
      type = p_type,
      adresse = coalesce(nullif(trim(p_adresse), ''), adresse),
      commune = coalesce(nullif(trim(p_commune), ''), commune),
      updated_at = now()
  where id = v_commerce;
end;
$$;

revoke all on function public.modifier_commerce_visite(uuid, text, text, text, text) from public, anon;
grant execute on function public.modifier_commerce_visite(uuid, text, text, text, text) to authenticated;
