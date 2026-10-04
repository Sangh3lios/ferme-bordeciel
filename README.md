# Ferme de Bordeciel — version en ligne

## 1. Créer le projet Supabase
Créer un projet sur Supabase puis ouvrir le SQL Editor.

## 2. Installer la base
Copier-coller `schema.sql` dans le SQL Editor et exécuter.

## 3. Créer les comptes
Dans Supabase > Authentication > Users, créer les comptes email/mot de passe.
Après création, leur profil est automatiquement créé comme `employee`.

Pour rendre TON compte administrateur, récupérer son UUID dans Authentication > Users puis exécuter :
```sql
update public.profiles
set role = 'admin'
where id = 'UUID-DU-COMPTE';
```

## 4. Configurer l'application
Dans `app.js`, remplacer :
- REMPlACER_PAR_VOTRE_URL_SUPABASE
- REMPLACER_PAR_VOTRE_CLE_PUBLISHABLE

Utiliser uniquement la clé **publishable** côté navigateur. Ne jamais mettre une secret/service_role key dans `app.js`.

## 5. Mettre en ligne
Le dossier peut être déployé sur Vercel, Netlify ou un hébergement statique.
`index.html` et `app.js` doivent rester dans le même dossier.

## Règles intégrées
- salaire = 50 % du tarif normal
- export = +10 % sur le prix et sur le salaire
- Garde de Solitude = gratuit pour le client mais salaire au tarif normal
- le calcul du salaire est effectué côté PostgreSQL via trigger
- RLS limite les employés à leurs propres récoltes
- l'administrateur peut consulter/modifier les données nécessaires


## Version : destination affectée par l'administration

L'employé saisit uniquement le produit et la quantité. La destination reste vide.
Dans le registre administrateur, une liste déroulante permet d'affecter Local,
Export ou Garde de Solitude. La base recalcule alors automatiquement la valeur
commerciale et le salaire.
