# Flash — flashcards collaboratives

Application de révision par flashcards (texte + image) pour un groupe de travail.
Stack : **React + Vite**, **Tailwind CSS**, **Firebase** (Firestore, Storage, Auth anonyme),
hébergement **Firebase Hosting** avec déploiement automatique via **GitHub Actions**.

Fonctions couvertes (MVP) : pseudo (sans compte), création/renommage/suppression de
paquets, cartes recto/verso avec image recadrée et compressée, révision recto→verso ou
verso→recto (retournement, mélange, agrandissement de l'image), partage d'un paquet par code.

---

## 1. Prérequis

- Node.js 18 ou 20
- Un projet Firebase (plan gratuit Spark suffit)
- Firebase CLI : `npm install -g firebase-tools`

## 2. Configurer Firebase

Dans la console Firebase :

1. **Créer un projet**, puis ajouter une **application Web** ; copiez la configuration SDK.
2. **Authentication** → activer le fournisseur **Anonyme**.
3. **Firestore Database** → créer la base (mode production).
4. **Storage** → activer.

Copiez `.env.example` en `.env` et renseignez les valeurs :

```bash
cp .env.example .env
# éditez .env avec vos valeurs VITE_FIREBASE_*
```

Copiez aussi `.firebaserc.example` en `.firebaserc` et indiquez votre `projectId`.

## 3. Lancer en local

```bash
npm install
npm run dev
```

## 4. Déployer les règles et l'index

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

> L'index composite (`members` array-contains + `createdAt` desc) est nécessaire à la liste
> des paquets. S'il manque, la console affichera un lien de création directe.

## 5. Déployer le site

Manuellement :

```bash
npm run deploy        # build + firebase deploy
```

Automatiquement (GitHub Actions) : à chaque push sur `main`, le workflow
`.github/workflows/deploy.yml` build et déploie l'hébergement. Configurez au préalable, dans
**Settings → Secrets and variables → Actions** du dépôt :

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
- `FIREBASE_SERVICE_ACCOUNT` : le JSON d'un compte de service Firebase
- remplacez `REMPLACEZ_PAR_VOTRE_PROJECT_ID` dans le workflow

Les règles Firestore/Storage ne sont pas déployées par ce workflow ; lancez la commande
de l'étape 4 (ou ajoutez une étape `firebase deploy --only ...`).

---

## Modèle de données

```
decks/{deckId}
  name, owner (uid), ownerPseudo, members: [uid...], code, createdAt
  cards/{cardId}
    rectoText, versoText,
    rectoImgUrl, rectoImgPath, versoImgUrl, versoImgPath, createdAt

shareCodes/{CODE}          # correspondance code -> deckId pour rejoindre
  deckId, name
```

Les images vont dans **Storage** (`deck-images/{deckId}/{cardId}/{recto|verso}.jpg`) ;
seule l'URL est stockée dans Firestore. Le poids est plafonné à **50 Ko / image**
(voir `src/lib/image.js`), ce qui laisse ~100 000 images dans les 5 Gio gratuits.

## Sécurité

- Lecture/écriture d'un paquet réservées à ses `members`.
- Suppression réservée au `owner`.
- Un non-membre peut seulement **s'ajouter lui-même** via un code (règle « self-join »).

Ces règles conviennent à un groupe de confiance. Pour un usage plus large, envisagez un
contrôle d'accès Storage par Cloud Functions et une validation renforcée des champs.

## Structure

```
src/
  firebase.js            init Firebase (lit les variables VITE_*)
  lib/decks.js           auth anonyme + CRUD/temps réel Firestore
  lib/image.js           compression (browser-image-compression) + upload Storage
  components/
    ui.jsx               primitives (Shell, Header, Modal, boutons…)
    CropModal.jsx        recadrage (Libre/Paysage/Carré/Portrait) -> Blob
    DeckView.jsx         cartes d'un paquet + éditeur + partage
    Review.jsx           mode révision + agrandissement image
  App.jsx                pseudo, accueil, rejoindre par code, routage
```

## V2 (prévu)

Répétition espacée et statistiques de réussite — volontairement hors MVP.
