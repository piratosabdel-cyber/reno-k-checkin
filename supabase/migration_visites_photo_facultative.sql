-- La photo n'est plus obligatoire pour enregistrer une visite.
alter table public.visites alter column photo_path drop not null;
