-- ============================================================================
-- Visites Adala : bon de commande signé par le client sur la tablette.
-- Le serveur en fait un PDF et l'envoie aussitôt à order@adalacola.com.
-- À exécuter après migration_visites_numero_entreprise.sql. Ré-exécutable.
-- ============================================================================

alter table public.visites add column if not exists bon_signature_path text;
alter table public.visites add column if not exists bon_signataire text;
alter table public.visites add column if not exists bon_signe_le timestamptz;
alter table public.visites add column if not exists bon_pdf_path text;
alter table public.visites add column if not exists bon_envoye_le timestamptz;
alter table public.visites add column if not exists bon_erreur text;

create index if not exists visites_bon_a_envoyer_idx on public.visites(bon_signe_le)
  where bon_signe_le is not null and bon_envoye_le is null;

-- Une signature posée ne se change plus, et seul le serveur marque le bon
-- comme envoyé (la commerciale ne peut pas le faire depuis la tablette).
create or replace function public.visites_proteger_bon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.bon_pdf_path := null;
    new.bon_envoye_le := null;
    new.bon_erreur := null;
    return new;
  end if;
  new.bon_pdf_path := old.bon_pdf_path;
  new.bon_envoye_le := old.bon_envoye_le;
  new.bon_erreur := old.bon_erreur;
  if old.bon_signe_le is not null then
    new.bon_signature_path := old.bon_signature_path;
    new.bon_signataire := old.bon_signataire;
    new.bon_signe_le := old.bon_signe_le;
  end if;
  return new;
end;
$$;

drop trigger if exists visites_proteger_bon_trg on public.visites;
create trigger visites_proteger_bon_trg
  before insert or update on public.visites
  for each row execute function public.visites_proteger_bon();
