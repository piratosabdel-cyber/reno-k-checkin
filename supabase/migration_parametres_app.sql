-- ============================================================================
-- Reno-K — Ajout du "coupe-circuit" (désactivation de l'app en un clic)
-- À exécuter une fois dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================================

create table if not exists public.parametres_app (
  id integer primary key default 1 check (id = 1),
  app_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.parametres_app (id, app_active)
values (1, true)
on conflict (id) do nothing;

alter table public.parametres_app enable row level security;

-- Tout utilisateur connecté (admin ou ouvrier) doit pouvoir lire l'état,
-- pour savoir si l'app est active.
create policy "parametres_app: lecture pour tous les connectes" on public.parametres_app
  for select using (auth.uid() is not null);

-- Seul un admin peut basculer l'interrupteur.
create policy "parametres_app: admin modifie" on public.parametres_app
  for update using (public.is_admin());
