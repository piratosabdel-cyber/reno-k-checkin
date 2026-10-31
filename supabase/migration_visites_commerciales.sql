-- ============================================================================
-- Adala — Module « Pointage des visites commerciales »
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
--
-- Ajoute le rôle « commercial », les tables commerces / visites /
-- visites_alertes, le stockage privé des photos et les contrôles anti-fraude.
-- Ne modifie rien au fonctionnement des pointages ouvriers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. SÉCURITÉ : le rôle n'est plus jamais pris dans les données d'inscription
--    envoyées par le navigateur (avant, n'importe qui pouvait s'inscrire
--    directement comme « admin » avec la clé publique de l'app).
--    Seul app_metadata (modifiable uniquement côté serveur, avec la clé
--    service_role) peut donner un rôle autre que « ouvrier », et jamais admin.
-- ----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'ouvrier', 'commercial'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_app_meta_data->>'role', 'ouvrier');
begin
  if v_role not in ('ouvrier', 'commercial') then
    v_role := 'ouvrier';
  end if;
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role,
    new.email
  );
  return new;
end;
$$;

-- Un utilisateur ne peut pas changer son propre rôle (seul l'admin modifie
-- les profils, policy existante) — rien à ajouter ici.

create or replace function public.is_commercial_actif()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'commercial' and active
  );
$$;

-- Distance en mètres entre deux points GPS (Haversine).
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ----------------------------------------------------------------------------
-- 1. COMMERCES (clients et prospects)
--    L'id est généré sur la tablette : un commerce créé hors connexion garde
--    le même id une fois synchronisé (anti-doublon).
-- ----------------------------------------------------------------------------
create table if not exists public.commerces (
  id uuid primary key,
  nom text not null,
  adresse text,
  commune text,
  type text not null default 'autre' check (type in (
    'epicerie', 'superette', 'night_shop', 'snack', 'boucherie', 'restaurant',
    'cafe_chicha', 'catering', 'grossiste', 'supermarche', 'autre'
  )),
  -- Position de référence = celle de la première visite (remplie par trigger).
  latitude double precision,
  longitude double precision,
  contact_nom text,
  contact_fonction text,
  contact_telephone text,
  contact_email text,
  statut text not null default 'prospect' check (statut in ('prospect', 'client', 'refus')),
  cree_par uuid references public.profiles(id) on delete set null,
  -- Archivage Google Drive (rempli par la fonction serveur)
  drive_dossier_id text,
  drive_visites_dossier_id text,
  drive_fiche_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commerces_nom_idx on public.commerces(lower(nom));

-- ----------------------------------------------------------------------------
-- 2. VISITES
-- ----------------------------------------------------------------------------
create table if not exists public.visites (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  commercial_id uuid not null references public.profiles(id) on delete restrict,
  commerce_id uuid not null references public.commerces(id) on delete restrict,

  type_commerce text,
  contact_nom text,
  contact_fonction text,
  contact_telephone text,
  contact_email text,
  resultat text not null check (resultat in (
    'interesse', 'precommande', 'echantillon', 'a_revoir', 'refus', 'absent'
  )),
  plateaux integer check (plateaux is null or plateaux >= 0),
  palettes integer check (palettes is null or palettes >= 0),
  date_relance date,
  remarques text[] not null default '{}',
  commentaire text,
  -- Enregistrée en vitesse (photo + résultat), le reste à compléter plus tard.
  a_completer boolean not null default false,

  -- GPS à l'ouverture du formulaire et à l'envoi
  lat_ouverture double precision,
  lng_ouverture double precision,
  precision_ouverture_m double precision,
  lat_envoi double precision,
  lng_envoi double precision,
  precision_envoi_m double precision,
  adresse_gps text,

  -- Heures : ouverture et envoi selon la tablette, réception selon le
  -- serveur (c'est l'heure serveur qui fait foi).
  heure_ouverture timestamptz,
  heure_appareil timestamptz not null,
  heure_serveur timestamptz not null default now(),

  photo_path text not null,
  photo_prise_a timestamptz,

  synchro_differee boolean not null default false,
  appareil_id text,
  modele_appareil text,

  -- Archivage Google Drive
  drive_dossier_id text,
  drive_rapport_id text,
  drive_archive_at timestamptz,
  drive_erreur text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visites_commercial_idx on public.visites(commercial_id, heure_appareil desc);
create index if not exists visites_commerce_idx on public.visites(commerce_id, heure_appareil desc);
create index if not exists visites_heure_idx on public.visites(heure_serveur desc);

-- ----------------------------------------------------------------------------
-- 3. ALERTES (lisibles par l'admin uniquement)
-- ----------------------------------------------------------------------------
create table if not exists public.visites_alertes (
  id uuid primary key default gen_random_uuid(),
  visite_id uuid not null references public.visites(id) on delete cascade,
  code text not null,
  detail text not null,
  created_at timestamptz not null default now(),
  unique (visite_id, code)
);

-- ----------------------------------------------------------------------------
-- 4. RÉGLAGES DES INTÉGRATIONS (Google Drive...) — accessibles uniquement
--    côté serveur (clé service_role) : aucune policy.
-- ----------------------------------------------------------------------------
create table if not exists public.integrations (
  cle text primary key,
  valeur text not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS
-- ----------------------------------------------------------------------------

-- Heure serveur imposée, et une commerciale ne peut compléter qu'une visite
-- marquée « à compléter » et seulement les champs commerciaux : GPS, heures,
-- photo et commerce sont figés.
create or replace function public.visites_proteger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.heure_serveur := now();
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
  -- Complétée : il faudra mettre à jour le rapport dans Drive.
  new.drive_archive_at := null;
  new.drive_erreur := old.drive_erreur;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists visites_proteger_trg on public.visites;
create trigger visites_proteger_trg
  before insert or update on public.visites
  for each row execute function public.visites_proteger();

-- Après chaque visite : position de référence du commerce, statut,
-- contact, et contrôles anti-fraude.
create or replace function public.visites_apres_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.commerces%rowtype;
  v_lat double precision := coalesce(new.lat_envoi, new.lat_ouverture);
  v_lng double precision := coalesce(new.lng_envoi, new.lng_ouverture);
  v_prec double precision := greatest(coalesce(new.precision_envoi_m, 0), coalesce(new.precision_ouverture_m, 0));
  v_dist double precision;
  prev record;
begin
  select * into c from public.commerces where id = new.commerce_id;

  -- Contrôles anti-fraude --------------------------------------------------
  if v_lat is null then
    insert into public.visites_alertes (visite_id, code, detail)
    values (new.id, 'sans_gps', 'Aucune position GPS enregistrée')
    on conflict do nothing;
  end if;

  if v_prec > 100 then
    insert into public.visites_alertes (visite_id, code, detail)
    values (new.id, 'precision_gps', format('Précision GPS faible : ±%s m', round(v_prec)))
    on conflict do nothing;
  end if;

  if v_lat is not null and c.latitude is not null then
    v_dist := public.distance_m(v_lat, v_lng, c.latitude, c.longitude);
    if v_dist > 300 then
      insert into public.visites_alertes (visite_id, code, detail)
      values (new.id, 'loin_commerce', format('À %s m de la position habituelle du commerce', round(v_dist)))
      on conflict do nothing;
    end if;
  end if;

  if new.lat_ouverture is not null and new.lat_envoi is not null then
    v_dist := public.distance_m(new.lat_ouverture, new.lng_ouverture, new.lat_envoi, new.lng_envoi);
    if v_dist > 300 then
      insert into public.visites_alertes (visite_id, code, detail)
      values (new.id, 'deplacement_saisie', format('%s m parcourus entre l''ouverture et l''envoi du formulaire', round(v_dist)))
      on conflict do nothing;
    end if;
  end if;

  for prev in
    select v.id, coalesce(v.lat_envoi, v.lat_ouverture) as lat, coalesce(v.lng_envoi, v.lng_ouverture) as lng,
           abs(extract(epoch from (v.heure_appareil - new.heure_appareil))) as ecart_s
    from public.visites v
    where v.commercial_id = new.commercial_id
      and v.id <> new.id
      and v.heure_appareil between new.heure_appareil - interval '5 minutes'
                               and new.heure_appareil + interval '5 minutes'
  loop
    if prev.lat is not null and v_lat is not null
       and public.distance_m(prev.lat, prev.lng, v_lat, v_lng) > 500 then
      insert into public.visites_alertes (visite_id, code, detail)
      values (new.id, 'visites_rapprochees',
              format('Autre visite %s min plus tôt/tard à %s m d''ici',
                     round(prev.ecart_s / 60.0), round(public.distance_m(prev.lat, prev.lng, v_lat, v_lng))))
      on conflict do nothing;
    end if;
  end loop;

  -- Pour une visite envoyée en différé, l'écart d'horloge est normal.
  if not new.synchro_differee
     and abs(extract(epoch from (new.heure_serveur - new.heure_appareil))) > 600 then
    insert into public.visites_alertes (visite_id, code, detail)
    values (new.id, 'horloge',
            format('Heure de la tablette décalée de %s min par rapport au serveur',
                   round(abs(extract(epoch from (new.heure_serveur - new.heure_appareil))) / 60.0)))
    on conflict do nothing;
  end if;

  -- Mise à jour du commerce ---------------------------------------------------
  update public.commerces set
    latitude = coalesce(latitude, v_lat),
    longitude = coalesce(longitude, v_lng),
    type = coalesce(new.type_commerce, type),
    contact_nom = coalesce(nullif(new.contact_nom, ''), contact_nom),
    contact_fonction = coalesce(nullif(new.contact_fonction, ''), contact_fonction),
    contact_telephone = coalesce(nullif(new.contact_telephone, ''), contact_telephone),
    contact_email = coalesce(nullif(new.contact_email, ''), contact_email),
    statut = case
      when new.resultat = 'precommande' then 'client'
      when new.resultat = 'refus' and statut <> 'client' then 'refus'
      when new.resultat in ('interesse', 'echantillon') and statut = 'refus' then 'prospect'
      else statut
    end,
    updated_at = now()
  where id = new.commerce_id;

  return null;
end;
$$;

drop trigger if exists visites_apres_insert_trg on public.visites;
create trigger visites_apres_insert_trg
  after insert on public.visites
  for each row execute function public.visites_apres_insert();

-- Quand une visite est complétée, on reporte aussi le contact / la
-- précommande sur la fiche du commerce.
create or replace function public.visites_apres_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commerces set
    contact_nom = coalesce(nullif(new.contact_nom, ''), contact_nom),
    contact_fonction = coalesce(nullif(new.contact_fonction, ''), contact_fonction),
    contact_telephone = coalesce(nullif(new.contact_telephone, ''), contact_telephone),
    contact_email = coalesce(nullif(new.contact_email, ''), contact_email),
    statut = case when new.resultat = 'precommande' then 'client' else statut end,
    updated_at = now()
  where id = new.commerce_id;
  return null;
end;
$$;

drop trigger if exists visites_apres_update_trg on public.visites;
create trigger visites_apres_update_trg
  after update of contact_nom, contact_fonction, contact_telephone, contact_email, resultat on public.visites
  for each row execute function public.visites_apres_update();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.commerces enable row level security;
alter table public.visites enable row level security;
alter table public.visites_alertes enable row level security;
alter table public.integrations enable row level security;

-- COMMERCES : la commerciale voit tous les commerces (autocomplétion) et peut
-- en créer ; seule la base (triggers) et l'admin les modifient.
drop policy if exists "commerces: lecture commerciale et admin" on public.commerces;
create policy "commerces: lecture commerciale et admin" on public.commerces
  for select using (public.is_commercial_actif() or public.is_admin());
drop policy if exists "commerces: commerciale cree" on public.commerces;
create policy "commerces: commerciale cree" on public.commerces
  for insert with check (
    (public.is_commercial_actif() and cree_par = auth.uid()) or public.is_admin()
  );
drop policy if exists "commerces: admin modifie" on public.commerces;
create policy "commerces: admin modifie" on public.commerces
  for update using (public.is_admin());

-- VISITES : la commerciale voit et crée les siennes ; elle ne peut modifier
-- qu'une visite « à compléter » du jour même. Aucune suppression via l'API.
drop policy if exists "visites: lecture" on public.visites;
create policy "visites: lecture" on public.visites
  for select using (commercial_id = auth.uid() or public.is_admin());
drop policy if exists "visites: commerciale cree pour elle-meme" on public.visites;
create policy "visites: commerciale cree pour elle-meme" on public.visites
  for insert with check (commercial_id = auth.uid() and public.is_commercial_actif());
drop policy if exists "visites: completer" on public.visites;
create policy "visites: completer" on public.visites
  for update using (
    public.is_admin()
    or (commercial_id = auth.uid() and a_completer and public.is_commercial_actif()
        and heure_serveur > now() - interval '2 days')
  );

-- ALERTES : admin uniquement. Écriture par trigger seulement.
drop policy if exists "alertes: admin lit" on public.visites_alertes;
create policy "alertes: admin lit" on public.visites_alertes
  for select using (public.is_admin());

-- ============================================================================
-- STOCKAGE DES PHOTOS (privé, accès par lien signé uniquement)
-- Chemin : <id commerciale>/<client_uuid de la visite>.jpg
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('visites-photos', 'visites-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "photos visites: commerciale envoie" on storage.objects;
create policy "photos visites: commerciale envoie" on storage.objects
  for insert with check (
    bucket_id = 'visites-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_commercial_actif()
  );
drop policy if exists "photos visites: lecture" on storage.objects;
create policy "photos visites: lecture" on storage.objects
  for select using (
    bucket_id = 'visites-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
