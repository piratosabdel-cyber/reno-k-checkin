-- ============================================================================
-- Visites Adala : numéro d'entreprise du client (à côté du n° de TVA)
-- À exécuter après migration_visites_infos_client.sql. Sans risque si relancé.
-- ============================================================================

alter table public.commerces add column if not exists numero_entreprise text;
alter table public.visites add column if not exists numero_entreprise text;

create or replace function public.visites_infos_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commerces set
    numero_entreprise = coalesce(nullif(new.numero_entreprise, ''), numero_entreprise),
    adresse_livraison = coalesce(nullif(new.adresse_livraison, ''), adresse_livraison),
    adresse_facturation = coalesce(nullif(new.adresse_facturation, ''), adresse_facturation),
    numero_tva = coalesce(nullif(new.numero_tva, ''), numero_tva),
    reseau_social = coalesce(nullif(new.reseau_social, ''), reseau_social),
    updated_at = now()
  where id = new.commerce_id;
  return null;
end;
$$;

drop trigger if exists visites_infos_client_trg on public.visites;
create trigger visites_infos_client_trg
  after insert or update of numero_entreprise, adresse_livraison, adresse_facturation, numero_tva, reseau_social on public.visites
  for each row execute function public.visites_infos_client();
