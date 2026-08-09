-- ============================================================================
-- Reno-K — Rendre l'email visible dans l'admin (colonne "Ouvriers")
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================================

alter table public.profiles add column if not exists email text;

-- Remplit l'email pour les comptes déjà créés avant cette migration.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Les nouveaux comptes auront désormais leur email copié automatiquement.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'ouvrier'),
    new.email
  );
  return new;
end;
$$;
