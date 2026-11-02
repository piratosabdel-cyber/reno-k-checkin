-- Lien court du bon à signer envoyé par WhatsApp : visites.adalacola.com/b/<code>.
alter table public.visites add column if not exists bon_client_code text;
create unique index if not exists visites_bon_client_code_idx on public.visites(bon_client_code);
