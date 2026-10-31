# Mise en place du module Adala Visites — étapes pour l'administrateur

Ordre conseillé. Compte environ 45 minutes en tout.

## 1. Base de données (Supabase) — 5 min
1. Supabase → **SQL Editor → New query**, colle tout le fichier [`supabase/migration_visites_commerciales.sql`](../supabase/migration_visites_commerciales.sql), puis **Run**.
2. **Authentication → Sign In / Providers** (ou *Settings*) → **désactive « Allow new users to sign up »**.
   Les comptes (ouvriers et commerciaux) sont désormais créés par le serveur, depuis l'admin. Personne ne peut plus se créer un compte tout seul.

## 2. Variables Vercel — 5 min
Vercel → projet → **Settings → Environment Variables** :

| Nom | Valeur |
|-----|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | déjà présente (sert aux mots de passe) |
| `CRON_SECRET` | une longue phrase aléatoire, au moins 32 caractères, **à garder secrète** |
| `SMTP_USER` | `order@adalacola.com` |
| `SMTP_PASS` | le mot de passe de la boîte mail order@ chez Combell |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | voir étape 4 |

Puis **Deployments → ⋯ → Redeploy**.

## 3. Sous-domaine visites.adalacola.com — 10 min
1. Vercel → projet → **Settings → Domains → Add** → `visites.adalacola.com`. Vercel affiche une valeur **CNAME**, en général `cname.vercel-dns.com`.
2. Combell → **adalacola.com → DNS** → ajoute un enregistrement **CNAME** :
   - nom : `visites`
   - valeur : celle donnée par Vercel
3. Attends que Vercel affiche **Valid Configuration** (de quelques minutes à 1 h).

Résultat :
- l'adresse Reno-K actuelle ne change pas (chantiers, ouvriers) ;
- **visites.adalacola.com** affiche le logo et le nom Adala, et c'est elle qui s'installe sur la tablette.

## 4. Google Drive de order@adalacola.com — 15 min
Connecte-toi partout avec **order@adalacola.com**.
1. Va sur https://console.cloud.google.com → **Nouveau projet** → nom « Adala Visites ».
2. **API et services → Bibliothèque** → cherche **Google Drive API** → **Activer**.
3. **Google Auth Platform** (ou « Écran de consentement OAuth ») :
   - type **Externe** ;
   - nom de l'app « Adala Visites », e-mail d'assistance order@adalacola.com ;
   - **Accès aux données** → ajoute la portée `.../auth/drive.file` ;
   - **Audience → Publier l'application** (statut **En production**). Sans cette étape, la connexion expire au bout de 7 jours. La portée `drive.file` ne demande aucune vérification de Google.
4. **Clients → Créer un client** → type **Application Web** → **URI de redirection autorisé** : `https://visites.adalacola.com/api/google-auth`. Copie l'**ID client** et le **Code secret** dans Vercel (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), puis **Redeploy**.
5. Ouvre ce lien une seule fois : `https://visites.adalacola.com/api/google-auth?cle=` suivi de ton `CRON_SECRET`.
   Choisis order@adalacola.com et accepte. Le message **« Google Drive connecté ✓ »** doit s'afficher.
   Si Google affiche « application non validée », clique **Paramètres avancés → Accéder à Adala Visites**. C'est normal : c'est ta propre app.

L'app n'a accès **qu'aux dossiers qu'elle crée elle-même** dans ce Drive. Elle ne voit pas le reste.

Classement automatique :
```
Adala — Commerces/
  Night shop/
    Night Shop Lemonnier — Anderlecht/
      Fiche commerce — Night Shop Lemonnier   (mise à jour à chaque visite)
      Visites/
        2026-10-31 14h05 — Précommande/
          Rapport de visite                     (avec la photo intégrée)
          photo.jpg
```

## 5. Créer le compte de la commerciale — 2 min
App → **Admin → Visites Adala → Équipe → + Ajouter**. Transmets-lui l'e-mail, le mot de passe et l'adresse **visites.adalacola.com**, avec les documents :
- [Mode d'emploi](Adala_Mode_emploi_commerciale.md)
- [Réglages Android](Adala_Reglages_Android.md)
- [Information RGPD](Adala_Information_RGPD_employee.md), à lui faire signer

## 6. Vérifications
- Admin → Visites Adala → **Statistiques** et **Carte du jour** s'affichent.
- Fais une visite test avec son compte. Elle apparaît dans l'admin, sur la carte, puis dans le Drive (dossier créé en quelques secondes).
- Teste l'**e-mail du soir** sans attendre : Admin → Visites Adala → **Équipe → Lancer maintenant**. Le résultat (Drive + e-mail) s'affiche juste à côté. Sinon, il part tout seul chaque jour vers 19 h (20 h en heure d'été).
- Si un dossier Drive manque, la fiche de la visite dans l'admin affiche l'erreur. La tâche du soir réessaie toute seule.
