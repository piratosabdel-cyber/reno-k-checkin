-- ============================================================================
-- La commerciale peut corriger le nom et le type d'un commerce depuis une de
-- ses visites des 7 derniers jours. L'adresse reste figée.
-- À exécuter après migration_visites_modification.sql. Ré-exécutable.
-- ============================================================================

create or replace function public.modifier_commerce_visite(p_visite uuid, p_nom text, p_type text)
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
      updated_at = now()
  where id = v_commerce;
end;
$$;

revoke all on function public.modifier_commerce_visite(uuid, text, text) from public, anon;
grant execute on function public.modifier_commerce_visite(uuid, text, text) to authenticated;
