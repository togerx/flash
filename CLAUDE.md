# Flash — mémoire projet (pour Claude Code)

Application web de **flashcards collaboratives** (texte + image) destinée à un
**groupe de travail**. Réviser à plusieurs à partir de paquets de cartes
recto/verso, partagés par code ou via des groupes-catalogues. Priorité forte :
**rester gratuit et sans serveur** (pas de Cloud Functions). Réponds et commente
**en français**.

---

## Stack

- **React 18 + Vite 5**, **Tailwind CSS 3** (classes utilitaires de base ;
  `darkMode: "class"`)
- **Firebase 10** : Firestore (données), Storage (images), Auth
  (anonyme + e-mail/mot de passe + Google), Hosting
- **PWA** : `vite-plugin-pwa` (service worker, installable, mode hors ligne)
- **browser-image-compression** (compression images), **lucide-react** (icônes)
- **fflate** (dézip .apkg), **fzstd** (zstd des .apkg récents),
  **sql.js** (lecture SQLite des .apkg) — tous chargés à la demande
- **firebase-admin** (devDependency, script d'administration uniquement)

## Environnement de dev

- OS **Windows 10**, terminal **PowerShell** (⚠️ pas cmd.exe)
- Chemin : `C:\Users\tioct\flash` · Node v25
- Le serveur de dev tape sur le **vrai** projet Firebase (pas d'émulateur)
- Projet Firebase **flash-25f97**, plan **Blaze**, région Europe

## ⚠️ État de déploiement (à faire / à configurer)

Beaucoup a été ajouté qui **n'est pas encore en ligne**. Avant que groupes, accès
publié et comptes ne fonctionnent :

1. **Activer les fournisseurs d'auth** dans la console Firebase → Authentication →
   Sign-in method : **E-mail/mot de passe** et **Google** (l'anonyme est déjà
   activé). Sans ça : `auth/operation-not-allowed`.
2. `npm run deploy:rules` — publie règles Firestore + **index composite `groups`**
   (attendre qu'il passe « Activé », 1-2 min) + règles Storage.
3. `npm run deploy` — build + mise en ligne du site.

**Non testé en conditions réelles** (nécessite les points ci-dessus) : inscription
e-mail, connexion Google, vérification e-mail, réinitialisation mot de passe, et
surtout la **migration de données** (compte anonyme → compte permanent). Tester la
migration avec un compte jetable AVANT de généraliser (priorité : ne pas perdre de
données).

## Modèle de données (Firestore)

```
decks/{deckId}
  name, owner (uid), ownerPseudo, members: [uid...], pseudos: {uid: pseudo},
  code, createdAt, cardCount, membersCanEdit (bool, défaut false),
  stats: {uid: {apprise, arevoir}},   # compteurs dénormalisés, par utilisateur
  groups: [groupId...]                 # groupes où le paquet est publié
  cards/{cardId}
    rectoText, versoText,
    rectoImgUrl, rectoImgPath, versoImgUrl, versoImgPath,
    order (tri), createdAt,
    learned: {uid: bool},              # true apprise, false à revoir, absent jamais vue
    srs: {uid: {etat, I, EF, due, step}}   # répétition espacée, par utilisateur

shareCodes/{CODE}        # code -> deckId (rejoindre un paquet)
  deckId, name

groups/{groupId}         # groupe = catalogue de paquets
  name, owner, ownerPseudo, members: [uid...], pseudos: {uid: pseudo},
  code, deckCount, lastPublishedAt, createdAt
  catalog/{deckId}       # entrée de vitrine (métadonnées, sans les cartes)
    deckId, name, ownerUid, ownerPseudo, cardCount, addedAt

groupCodes/{CODE}        # code -> groupId (rejoindre un groupe)
  groupId, name
```

- **Compteurs dénormalisés** (`cardCount`, `stats`) : évitent de lire toutes les
  cartes pour afficher la progression sur l'accueil (le doc paquet est déjà lu par
  `watchDecks`). Maintenus atomiquement à chaque écriture (writeBatch + `increment`),
  et **auto-réparés** à l'ouverture d'un paquet (`repairDeckStats`, jamais depuis le
  cache, uniquement la clé de l'utilisateur courant).

## Images (Storage) — adressées par contenu

- Chemin : `deck-images/shared/{sha256-du-contenu-compressé}.jpg`
- **Partagées** : deux images identiques = un seul fichier. Copier/exporter/fusionner
  un paquet **ne duplique rien** (réutilise le chemin). C'est aussi ce qui a rendu
  **CORS inutile** (plus de `fetch` du contenu ; les `<img>` n'y sont pas soumises).
- **Jamais supprimées automatiquement** (`deleteImageByPath` ignore `shared/`) :
  un fichier peut être référencé ailleurs. L'espace se récupère hors ligne avec
  `npm run purge:images` (script admin, nécessite `serviceAccount.json`).
- Plafond **50 Ko/image** (constantes dans `src/lib/image.js`).

## Authentification (`src/lib/auth.js`)

- Trois modes : **anonyme** (historique, session locale), **e-mail/mot de passe**
  (vérifié par LIEN Firebase), **Google**.
- **Liaison** (`link…`) : transforme un compte anonyme en permanent **sans changer
  l'uid** → données préservées, zéro migration. Chemin sûr par défaut.
- Si l'identifiant appartient déjà à un compte (autre appareil) : Firebase renvoie
  `…-already-in-use` → on se connecte, et l'app **fusionne en UNION** les données
  de CET APPAREIL vers le compte (`snapshotForMigration` avant, puis
  `applyMigration` après connexion) : paquets possédés recréés, et pour les
  paquets rejoints **communs** (mêmes docs partagés) l'avancement est **réuni sans
  rétrograder** (`unionProgress` dans `srs.js` : connu ∪ quoi que ce soit = connu).
  But : consolider plusieurs comptes en un sans rien perdre. Aucune réattribution,
  aucune donnée d'autrui touchée.
  - **Filet anti-perte** : le snapshot est persisté en localStorage
    (`flash.pendingMigration`) AVANT toute étape destructive ; `applyMigration`
    retire chaque paquet traité du registre, et une fusion interrompue est
    **reprise au prochain chargement** (effet dédié dans `App.jsx`).
  - **Limite connue** : un paquet **possédé** par le compte source ET déjà utilisé
    par le compte cible (cas rare : owner = source, membre = cible sur le même doc)
    est recréé à partir de la seule progression de la source ; l'avancement propre
    de la cible sur ce doc n'est pas réuni (les paquets communs visés sont les
    paquets **rejoints** de part et d'autre).
- Vérification e-mail = **lien** (natif Firebase), pas un code (un code exigerait un
  backend). Réinitialisation mot de passe = lien Firebase.
- Connexion par **e-mail uniquement** (Firebase ne connecte pas au pseudo). Le pseudo
  reste un nom d'affichage non unique ; pour un compte permanent il vient de
  `displayName` (fait autorité, mis à jour au renommage).

## Règles de sécurité (résumé — voir `firestore.rules`)

- **Paquets** : lecture réservée aux membres, **ou** — si le paquet est publié dans
  un groupe (`groups`) — aux **membres de ce groupe** (aperçu sans rejoindre). Ce
  n'est plus « tous les connectés » : la règle lit l'appartenance dans les docs de
  groupe (`readableViaGroup`, teste les 4 premiers groupes du paquet, `exists`-safe
  contre un groupe supprimé mais encore listé). Écriture réservée aux membres.
- Édition du contenu : propriétaire, ou membres si `membersCanEdit`. Suivi
  (`learned` + `srs`) : tout membre, mais **seulement sa propre clé** `uid`.
- **Personne ne retire un autre membre** (`othersUnchanged`) ; on rejoint/quitte
  seulement soi-même. `pseudos` : chacun n'écrit que sa clé.
- Publier/dépublier un paquet : le propriétaire ajuste `deck.groups` + écrit
  l'entrée `catalog` (membre du groupe requis).
- `shareCodes`/`groupCodes` : suppression permise seulement si la cible n'existe
  plus (nettoyage sans « dé-partager » un vivant).
- Storage : images < 100 Ko, type `image/*`.

## Structure des fichiers

```
src/
  firebase.js            init Firebase + cache Firestore persistant (hors ligne)
  lib/
    auth.js              comptes : anonyme/e-mail/google, liaison, vérif, reset
    decks.js             CRUD paquets/cartes, compteurs, copie, fusion, migration
    srs.js               répétition espacée (SM-2) — calcul pur, testable seul
    groups.js            groupes-catalogues + notifications (marqueur local)
    image.js             compression + upload adressé par contenu (sha256)
    import.js            parseur texte Anki/Quizlet + HTML→texte balisé
    anki.js              lecture .apkg (ZIP + SQLite, formats legacy et v3 zstd)
    listInput.js         continuation de listes à la saisie (Entrée)
    offline.js           paquets « disponibles hors ligne » (préchargement)
    online.js            hook état réseau (useOnline)
    theme.js             thème clair/sombre (useTheme)
    deckMeta.js          dates locales (ajout, dernière révision) pour le tri
  components/
    ui.jsx               primitives : Shell, Header, Modal (pile Échap/Entrée),
                         ConfirmModal, Logo/HomeLogo, Loading, Highlight, useEscapeClose,
                         useEnterAction
    AuthScreen.jsx       écran non connecté (login/signup/google/reset/anonyme)
    LinkAccountModal.jsx rattacher un compte à une session anonyme
    ProfileModal.jsx     pseudo, compte (connexion/déconnexion), reset, suppression
    DeckView.jsx         cartes d'un paquet : éditeur, recherche, sélection,
                         partage, publication en groupe, révision libre/guidée
    Review.jsx           révision libre (série paramétrée, clavier, animations)
    GuidedReview.jsx     révision guidée (répétition espacée)
    MultiReview.jsx      révision libre sur plusieurs paquets
    CropModal.jsx        recadrage image (overlay propre)
    TableModal.jsx       éditeur de tableau (grille)
    RichText.jsx         rendu tableaux / listes à puces / numérotées
    DeckProgress.jsx     barre apprises/à revoir/non vues (survol chiffré)
    ImportModal.jsx      import .apkg/.txt/.csv (fichier ou glisser-déposer)
    GroupView.jsx        vitrine d'un groupe (voir / rejoindre les paquets)
    GroupsModal.jsx      liste/création/jonction de groupes
  App.jsx                auth, routage des vues, accueil (tri, recherche, groupes,
                         sélection multiple, fusion, révision multi-paquets)
scripts/purge-images.mjs script admin (firebase-admin) : purge images orphelines
firestore.rules · storage.rules · firestore.indexes.json · firebase.json
cors.json                (optionnel — CORS Storage, désormais peu utile)
```

## Fonctionnalités implémentées

**Paquets & cartes**
- Créer / renommer / supprimer / copier / **fusionner** des paquets (temps réel)
- Rejoindre par code ; quitter ; droit d'édition réglable par le propriétaire
- Cartes recto/verso texte + image (recadrage pan/zoom + compression < 50 Ko)
- **Réordonner** par glisser-déposer (champ `order`)
- **Recherche** dans les cartes d'un paquet ; **sélection** de cartes (supprimer,
  exporter comme nouveau paquet) ; réinitialiser sa progression
- Éditeur riche : barre d'outils **listes à puces / numérotées / tableau**,
  continuation de liste à la saisie, aperçu ; rendu tableaux/listes en révision
- Import **Anki (.apkg** legacy + v3 zstd**) / Quizlet / texte** (fichier ou
  glisser-déposer ; pas d'attribut `accept` pour compatibilité iPad)

**Révision**
- **Libre** : série paramétrée (sens, ordre normal/inverse/aléatoire, plage, filtre
  jamais vues/à revoir/apprises, nombre) ; auto-éval ✓/✗ ; barre d'avancement ;
  animation de contour ; agrandissement image ; **clavier** (espace retourne,
  ← → naviguent, ↑ je sais / ↓ à revoir) ; écran de fin (recommencer / nouvelle
  série / terminer) + bilan
- **Guidée** (répétition espacée SM-2, `srs.js`) : file composée par échéance,
  paliers d'acquisition (1 min / 10 min) puis maintien (notes 1-4), animation
  « Encore » à chaque carte revue, répartition en direct. **Unifiée** avec la libre :
  auto-éval libre et notes guidées écrivent le même historique (`setCardProgress`)
- **Multi-paquets** : réviser librement plusieurs paquets à la fois (chaque carte
  garde son `deckId` pour écrire au bon endroit)
- Suivi d'apprentissage par utilisateur : 3 états (jamais vue / apprise / à revoir),
  barre de progression sur la vue paquet et sur l'accueil (compteurs dénormalisés)

**Accueil**
- **Tri** (date d'ajout / dernière révision / nom / créateur) avec sens
  croissant/décroissant ; **recherche** paquet + créateur avec **surlignage** du
  texte trouvé (insensible aux accents)
- Menu **« ⋮ »** par vignette (hors ligne, copier, renommer, supprimer/quitter)
- Raccourci « Réviser » (séance guidée recommandée), « Réviser plusieurs »

**Groupes (catalogues)** — voir « État de déploiement »
- Créer / rejoindre par code ; vitrine des paquets publiés ; **Voir** (aperçu sans
  rejoindre, grâce à `deck.groups` + règle de lecture) / **Rejoindre**
- Publier ses paquets depuis la modale de partage ; **notifications** « Nouveau »
  (comparaison `lastPublishedAt` à un marqueur `localStorage`, par appareil)

**Comptes** — voir « État de déploiement »
- Écran login/signup, Google, e-mail/mot de passe, mot de passe oublié, anonyme
- Liaison anonyme → permanent (uid préservé) ; migration par copie sinon
- Bannières « sécuriser le compte » (anonyme) et « vérifier l'e-mail »

**Transverse**
- **Thème sombre** (bascule sur l'accueil ; script anti-flash dans `index.html`)
- **Hors ligne** : PWA installable, cache Firestore persistant, paquets « disponibles
  hors ligne » (préchargement cartes + images), blocage clair des actions image
  (Storage n'a pas de file d'attente)
- **Clavier** : Échap ferme la modale du dessus (pile) et les barres de création ;
  **Entrée = bouton principal** de la modale (`data-primary`, ignoré dans les champs)
- Logo (`assets/icon.png`) partout : accueil, en-têtes (bouton retour accueil),
  favicon, icônes PWA ; animation de respiration pour les chargements

## Clés localStorage

`flash.pseudo` · `flash.theme` · `flash.offlineDecks` · `flash.deckMeta`
(dates ajout/révision) · `flash.groupSeen` (notifications groupes)

## Commandes

```powershell
npm run dev            # serveur de dev Vite
npm run build          # build de production (dist/)
npm run deploy         # build + firebase deploy (site en ligne)
npm run deploy:rules   # règles + index + storage (À FAIRE pour groupes/auth)
npm run purge:images   # admin : purge images orphelines (serviceAccount.json requis)
firebase login
```

## Pièges déjà rencontrés (ne pas refaire)

- ⚠️ **Encodage Windows** : ne PAS éditer via
  `(Get-Content f) -replace ... | Set-Content -Encoding utf8` (ajoute un BOM, casse
  `package.json`, double-encode les accents). Utiliser les outils d'édition, ou
  `[System.IO.File]::WriteAllText(path, texte, (New-Object System.Text.UTF8Encoding($false)))`.
- **Vite ne lit `.env` qu'au démarrage** : après modif, couper (Ctrl+C) et relancer.
- **Déployer règles + index AVANT de tester** (le dev server utilise le vrai Firestore).
  `failed-precondition ... index building` = attendre que l'index passe « Activé ».
- Erreurs `auth/*` = console Firebase (fournisseur non activé, domaines autorisés),
  pas `.env`. `auth/operation-not-allowed` = fournisseur pas activé.
- **`min-h-0` sur les enfants flex** : sans lui, un enfant flex ne rétrécit pas sous
  son contenu (cartes de révision qui débordent, pieds de modale poussés hors écran).
- **`StrictMode`** double-monte les effets en dev : ne pas s'appuyer sur un `setTimeout`
  nettoyé par un autre effet (le badge « Encore » a été cassé ainsi).
- **Compteurs dénormalisés** : toute mutation de carte doit ajuster `stats`/`cardCount`
  dans le MÊME writeBatch ; `repairDeckStats` rattrape, mais jamais depuis le cache.
- Un fichier ouvert non sauvegardé dans l'éditeur peut **écraser** mes modifications
  lors d'une sauvegarde (un bouton avait disparu ainsi).

## Reste à faire / pistes

- **Déployer** règles+index et **activer les fournisseurs d'auth** (voir plus haut)
- Tester migration, inscription, Google, vérification, reset (nécessite le déploiement)
- (option) CI GitHub Actions : secrets `VITE_*`, compte de service, `projectId`
- (option) Code-splitting du bundle (~968 Ko) : `import()` dynamique de Firebase
- (hors périmètre) Statistiques de réussite avancées
