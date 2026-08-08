# Reno-K — Check-in chantier

Application web pour le pointage des ouvriers sur les chantiers Reno-K
(check-in / check-out avec géolocalisation) et un tableau de bord admin.

Stack : React + TypeScript (Vite) + Tailwind CSS + Supabase (auth, base de
données, temps réel) + déploiement Vercel.

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte si besoin, puis
   **New project**. Choisis une région proche (ex. Frankfurt/EU).
2. Une fois le projet créé, va dans **SQL Editor > New query**, colle tout le
   contenu de [`supabase/schema.sql`](supabase/schema.sql) et exécute-le
   (bouton **Run**). Ça crée les tables `profiles`, `chantiers`,
   `chantier_assignments`, `pointages`, ainsi que les policies RLS et le
   trigger qui crée automatiquement un profil "ouvrier" à chaque inscription.
3. Va dans **Authentication > Providers > Email** et **désactive "Confirm
   email"**. C'est une app interne : les comptes ouvriers sont créés par toi
   depuis l'admin, ils n'ont pas besoin de confirmer un email pour se
   connecter.
4. Va dans **Project Settings > API** et note :
   - **Project URL**
   - **anon public key** (jamais la `service_role` key — elle ne doit jamais
     être utilisée côté client)

## 2. Configurer le projet en local

```bash
npm install
cp .env.example .env.local
```

Remplis `.env.local` avec l'URL et la clé `anon` récupérées à l'étape
précédente :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

```bash
npm run dev
```

L'app est disponible sur http://localhost:5173.

## 3. Créer ton compte admin

Le premier compte doit être créé et promu manuellement (aucun utilisateur
n'est admin par défaut, et par sécurité seul un admin peut en créer un autre
depuis l'app) :

1. Dans le Dashboard Supabase, va dans **Authentication > Users > Add user >
   Create new user**. Renseigne ton email et un mot de passe, et coche
   **Auto confirm user**.
2. Va dans **SQL Editor** et exécute (remplace l'email) :
   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Ton nom'
   where id = (select id from auth.users where email = 'ton-email@reno-k.be');
   ```
3. Connecte-toi sur l'app avec cet email/mot de passe → tu arrives sur
   `/admin`.

Depuis l'admin, tu peux ensuite créer les chantiers (**Chantiers**) et les
comptes ouvriers (**Ouvriers > + Ajouter un ouvrier**) — un mot de passe
temporaire est généré, à transmettre à l'ouvrier par SMS/WhatsApp.

## 4. Déploiement sur Vercel

1. Pousse le projet sur un repo Git (GitHub/GitLab).
2. Sur [vercel.com](https://vercel.com), **Add New > Project**, importe le
   repo. Vercel détecte Vite automatiquement.
3. Dans **Settings > Environment Variables**, ajoute `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` (les mêmes que dans `.env.local`).
4. Deploy.

## Structure du projet

```
src/
  lib/
    supabase.ts        Client Supabase principal (session persistée)
    adminAuthClient.ts  Client secondaire (sans session) pour créer des comptes ouvriers depuis l'admin
    geo.ts              Calcul de distance GPS + capture de position
  context/
    AuthContext.tsx      Session + profil (rôle admin/ouvrier)
  components/
    ProtectedRoute.tsx   Garde de route par rôle
  pages/
    LoginPage.tsx
    ouvrier/CheckInPage.tsx        Écran mobile check-in/check-out
    admin/AdminLayout.tsx
    admin/AdminDashboardPage.tsx    Vue du jour, alertes, export CSV
    admin/AdminChantiersPage.tsx    CRUD chantiers + assignation ouvriers
    admin/AdminOuvriersPage.tsx     Liste/création ouvriers, historique
supabase/
  schema.sql            Schéma complet (tables, RLS, triggers)
```

## Notes de sécurité

- La clé `service_role` de Supabase n'est utilisée nulle part dans ce projet
  — tout passe par la clé `anon` + Row Level Security. Ne l'ajoute jamais côté
  client.
- La géolocalisation au check-in est indicative (elle sert d'alerte si
  l'ouvrier semble loin du chantier) et n'est pas bloquante : un GPS refusé ou
  imprécis n'empêche pas de pointer.

## Prochaines étapes possibles (phase 2)

- Notifications automatiques (rappel si pas de check-in à l'heure prévue,
  résumé quotidien par email) — non implémenté, à discuter selon le canal
  souhaité (email, WhatsApp, SMS).
- Édition manuelle d'un pointage par l'admin (correction d'une heure oubliée).
