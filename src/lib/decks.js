import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, arrayUnion, arrayRemove, serverTimestamp, writeBatch,
  deleteField, increment,
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { reauthenticate, deleteCurrentUser } from "./auth";
import { deleteImageByPath, uploadImage } from "./image";
import { srsOf, etatCarte, depuisAutoEval, unionProgress } from "./srs";

/* --- Authentification anonyme : chaque appareil reçoit un uid stable --- */
// Renvoie la fonction de désabonnement (utilisée comme cleanup du useEffect).
export function initAuth(onReady) {
  return onAuthStateChanged(auth, (user) => {
    if (user) onReady(user.uid);
    else signInAnonymously(auth).catch((e) => console.error("Auth anonyme échouée", e));
  });
}

const decksCol = collection(db, "decks");
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/* ------------------------------ Paquets ------------------------------ */

// Temps réel : tous les paquets dont l'utilisateur est membre.
/* Les écoutes reçoivent un gestionnaire d'erreur : quitter un paquet, se faire
   supprimer le sien ou effacer son compte coupe les droits en cours de route,
   ce que Firestore signalerait sinon par une erreur non capturée. */
const onWatchError = (quoi) => (e) => {
  if (e?.code !== "permission-denied") console.error(`Écoute ${quoi} interrompue`, e);
};

export function watchDecks(uid, cb) {
  const q = query(decksCol, where("members", "array-contains", uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => {
    onWatchError("des paquets")(e);
    cb([]);
  });
}

export async function createDeck(name, uid, pseudo) {
  const code = genCode();
  const ref = await addDoc(decksCol, {
    name,
    owner: uid,
    ownerPseudo: pseudo,
    members: [uid],
    pseudos: { [uid]: pseudo },   // uid -> pseudo, pour afficher qui est dans le paquet
    cardCount: 0,
    stats: {},                    // uid -> { apprise, arevoir } (voir « Compteurs »)
    membersCanEdit: false,        // par défaut, seuls le propriétaire édite le contenu
    code,
    createdAt: serverTimestamp(),
  });
  // Table code -> deckId pour permettre à d'autres de rejoindre.
  await setDoc(doc(db, "shareCodes", code), { deckId: ref.id, name });
  return ref.id;
}

export function renameDeck(id, name) {
  return updateDoc(doc(db, "decks", id), { name });
}

/* Lecture ponctuelle d'un paquet (aperçu depuis un groupe, sans le rejoindre). */
export async function getDeck(id) {
  const snap = await getDoc(doc(db, "decks", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Droit d'édition du contenu : le propriétaire, et les membres si celui-ci les
   a autorisés. Le suivi de progression, lui, reste ouvert à tout membre. */
export const canEditDeck = (deck, uid) => deck?.owner === uid || deck?.membersCanEdit === true;

export function setMembersCanEdit(deckId, allow) {
  return updateDoc(doc(db, "decks", deckId), { membersCanEdit: allow });
}

export async function deleteDeck(id, code) {
  // Supprime les cartes et leurs images, puis le paquet.
  const cards = await getDocs(collection(db, "decks", id, "cards"));
  await Promise.all(cards.docs.map(async (c) => {
    const d = c.data();
    await deleteImageByPath(d.rectoImgPath);
    await deleteImageByPath(d.versoImgPath);
    await deleteDoc(c.ref);
  }));
  await deleteDoc(doc(db, "decks", id));
  // Puis le code de partage, sinon il pointerait vers un paquet inexistant.
  // (Les règles n'autorisent cette suppression qu'une fois le paquet disparu.)
  if (code) await deleteDoc(doc(db, "shareCodes", code)).catch(() => {});
}

/* Quitte un paquet partagé : on sort de `members`, le paquet reste intact pour
   les autres. Les évaluations posées sur les cartes ne sont pas effacées — elles
   seront retrouvées telles quelles si l'on rejoint à nouveau avec le code. */
export function leaveDeck(deckId, uid) {
  return updateDoc(doc(db, "decks", deckId), {
    members: arrayRemove(uid),
    [`pseudos.${uid}`]: deleteField(),
  });
}

/* Crée un paquet à partir de cartes importées :
   [{ recto, verso, rectoImg?: Blob, versoImg?: Blob }].
   Les images sont compressées et téléversées avant l'écriture des documents,
   qui part par lots de 400 (limite Firestore : 500 opérations par batch).
   onProgress(faites, total) permet d'afficher l'avancement d'un gros import. */
/* Fusionne plusieurs paquets en un nouveau, dont l'utilisateur est propriétaire.
   Les cartes sont reprises dans l'ordre des paquets fournis, puis de leurs
   cartes. Les images sont référencées (adressées par leur contenu, partagées),
   jamais dupliquées — comme pour une copie. Renvoie l'id du nouveau paquet. */
export async function mergeDecks(sourceDecks, uid, pseudo, name) {
  const lots = await Promise.all(sourceDecks.map((d) => getCards(d.id)));
  const cards = lots.flat();

  const deckId = await createDeck(name, uid, pseudo);
  const col = collection(db, "decks", deckId, "cards");

  for (let start = 0; start < cards.length; start += 400) {
    const batch = writeBatch(db);
    cards.slice(start, start + 400).forEach((c, i) => {
      batch.set(doc(col, doc(col).id), {
        rectoText: c.rectoText || "",
        versoText: c.versoText || "",
        rectoImgUrl: c.rectoImgUrl ?? null, rectoImgPath: c.rectoImgPath ?? null,
        versoImgUrl: c.versoImgUrl ?? null, versoImgPath: c.versoImgPath ?? null,
        order: (start + i) * ORDER_STEP,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  await updateDoc(doc(db, "decks", deckId), { cardCount: cards.length });
  return deckId;
}

export async function createDeckFromCards(name, cards, uid, pseudo, onProgress) {
  const deckId = await createDeck(name, uid, pseudo);
  const col = collection(db, "decks", deckId, "cards");
  const prepared = cards.map((c) => ({ ...c, id: doc(col).id }));

  // Téléversements par groupes de 4 : assez pour ne pas traîner, assez peu
  // pour ne pas saturer la connexion d'un téléphone.
  let failed = 0;
  const withImages = prepared.filter((c) => c.rectoImg || c.versoImg);
  for (let i = 0; i < withImages.length; i += 4) {
    await Promise.all(withImages.slice(i, i + 4).map(async (c) => {
      // Une image qui échoue ne doit pas faire perdre la carte, mais l'erreur
      // est tracée : un échec silencieux masquerait un import sans images.
      const put = async (face, blob) => {
        try { return await uploadImage(blob); }
        catch (e) { console.error(`Image ${face} non importée`, e); failed++; return null; }
      };
      if (c.rectoImg) c.recto_ = await put("recto", c.rectoImg);
      if (c.versoImg) c.verso_ = await put("verso", c.versoImg);
    }));
    onProgress?.(Math.min(i + 4, withImages.length), withImages.length);
  }

  for (let start = 0; start < prepared.length; start += 400) {
    const batch = writeBatch(db);
    prepared.slice(start, start + 400).forEach((c, i) => {
      batch.set(doc(col, c.id), {
        rectoText: c.recto || "",
        versoText: c.verso || "",
        rectoImgUrl: c.recto_?.url ?? null, rectoImgPath: c.recto_?.path ?? null,
        versoImgUrl: c.verso_?.url ?? null, versoImgPath: c.verso_?.path ?? null,
        order: (start + i) * ORDER_STEP,
        createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  await updateDoc(doc(db, "decks", deckId), { cardCount: prepared.length });
  return { deckId, failedImages: failed };
}

/* --- Migration / fusion d'un compte vers un compte permanent -------------
   On CAPTURE d'abord les données pendant qu'on est encore l'utilisateur d'origine
   (snapshotForMigration), on se connecte au compte cible, puis on ÉCRIT
   (applyMigration). C'est une UNION, pensée pour consolider plusieurs comptes
   (souvent anonymes) sans rien perdre :
     - paquets POSSÉDÉS : recréés sous le compte cible (propriété transférée) ;
     - paquets REJOINTS (mêmes documents partagés) : la progression de la source
       est FUSIONNÉE avec celle déjà présente sur le compte cible, sans jamais
       rétrograder (voir unionProgress) — d'où « union des avancements » sur les
       paquets communs.
   Rien n'est réattribué : aucune donnée d'autrui n'est touchée.

   Filet anti-perte : le snapshot est persisté en localStorage AVANT toute étape
   destructive (voir savePendingMigration), et applyMigration retire chaque paquet
   traité de ce registre. Si l'écriture est interrompue, la reprise au prochain
   chargement termine le travail (voir resumePendingMigration dans App). */

// Registre local d'une migration en cours (survit à un rechargement / plantage).
const MIGRATION_KEY = "flash.pendingMigration";

export function savePendingMigration(snap, pseudo) {
  try { localStorage.setItem(MIGRATION_KEY, JSON.stringify({ owned: snap.owned || [], joined: snap.joined || [], pseudo })); }
  catch { /* quota / mode privé : la migration se poursuit sans filet de reprise */ }
}
export function loadPendingMigration() {
  try {
    const r = JSON.parse(localStorage.getItem(MIGRATION_KEY) || "null");
    return r && ((r.owned?.length || 0) + (r.joined?.length || 0) > 0) ? r : null;
  } catch { return null; }
}
export function clearPendingMigration() {
  try { localStorage.removeItem(MIGRATION_KEY); } catch { /* rien à nettoyer */ }
}

export async function snapshotForMigration(decks, anonUid) {
  const owned = [];
  const joined = [];
  for (const d of decks) {
    const cards = await getCards(d.id);
    if (d.owner === anonUid) {
      owned.push({
        name: d.name,
        membersCanEdit: !!d.membersCanEdit,
        cards: cards.map((c) => ({
          rectoText: c.rectoText || "", versoText: c.versoText || "",
          rectoImgUrl: c.rectoImgUrl ?? null, rectoImgPath: c.rectoImgPath ?? null,
          versoImgUrl: c.versoImgUrl ?? null, versoImgPath: c.versoImgPath ?? null,
          learned: c.learned?.[anonUid], srs: c.srs?.[anonUid],
        })),
      });
    } else {
      const progress = cards
        .filter((c) => c.learned?.[anonUid] !== undefined || c.srs?.[anonUid] !== undefined)
        .map((c) => ({ id: c.id, learned: c.learned?.[anonUid], srs: c.srs?.[anonUid] }));
      joined.push({ deckId: d.id, progress });
    }
  }
  return { owned, joined };
}

/* Recrée un paquet possédé sous le compte cible, avec ses cartes et la
   progression capturée (rangée sous la clé du nouvel uid). */
async function recreateOwnedDeck(deck, uid, pseudo) {
  const deckId = await createDeck(deck.name, uid, pseudo);
  if (deck.membersCanEdit) await updateDoc(doc(db, "decks", deckId), { membersCanEdit: true }).catch(() => {});
  const col = collection(db, "decks", deckId, "cards");
  const stats = { apprise: 0, arevoir: 0 };
  for (let s = 0; s < deck.cards.length; s += 400) {
    const batch = writeBatch(db);
    deck.cards.slice(s, s + 400).forEach((c, i) => {
      const data = {
        rectoText: c.rectoText, versoText: c.versoText,
        rectoImgUrl: c.rectoImgUrl, rectoImgPath: c.rectoImgPath,
        versoImgUrl: c.versoImgUrl, versoImgPath: c.versoImgPath,
        order: (s + i) * ORDER_STEP, createdAt: serverTimestamp(),
      };
      if (c.learned !== undefined) data.learned = { [uid]: c.learned };
      if (c.srs !== undefined) data.srs = { [uid]: c.srs };
      if (c.learned === true) stats.apprise++;
      else if (c.learned === false) stats.arevoir++;
      batch.set(doc(col, doc(col).id), data);
    });
    await batch.commit();
  }
  await updateDoc(doc(db, "decks", deckId), { cardCount: deck.cards.length, [`stats.${uid}`]: stats });
}

/* Fusionne la progression capturée dans un paquet REJOINT (même document partagé
   que le compte cible peut déjà connaître). Pour chaque carte, l'avancement de la
   source est réuni avec celui déjà présent sous l'uid cible, sans rétrograder.
   Les compteurs `stats` du paquet pour l'uid cible sont recalculés dans la foulée. */
async function mergeJoinedDeck(j, uid, pseudo) {
  await joinDeck(j.deckId, uid, pseudo).catch(() => {});   // idempotent si déjà membre
  const cards = await getCards(j.deckId);
  const entrant = new Map((j.progress || []).map((p) => [p.id, p]));

  const mine = { apprise: 0, arevoir: 0 };
  const patches = [];
  cards.forEach((c) => {
    const actuel = { learned: c.learned?.[uid], srs: c.srs?.[uid] };
    const p = entrant.get(c.id);
    const fusion = p ? unionProgress(actuel, { learned: p.learned, srs: p.srs }) : actuel;

    if (fusion.learned === true) mine.apprise++;
    else if (fusion.learned === false) mine.arevoir++;

    // On n'écrit que les cartes réellement concernées par un apport, et seulement
    // si la valeur change (évite des écritures inutiles).
    if (!p) return;
    const patch = {};
    if (fusion.learned !== actuel.learned) {
      patch[`learned.${uid}`] = fusion.learned === undefined ? deleteField() : fusion.learned;
    }
    if (JSON.stringify(fusion.srs ?? null) !== JSON.stringify(actuel.srs ?? null)) {
      patch[`srs.${uid}`] = fusion.srs === undefined ? deleteField() : fusion.srs;
    }
    if (Object.keys(patch).length) patches.push([c.id, patch]);
  });

  for (let s = 0; s < patches.length; s += 400) {
    const batch = writeBatch(db);
    patches.slice(s, s + 400).forEach(([id, patch]) => batch.update(doc(db, "decks", j.deckId, "cards", id), patch));
    await batch.commit();
  }
  await updateDoc(doc(db, "decks", j.deckId), { [`stats.${uid}`]: mine }).catch(() => {});
}

/* Applique la migration/fusion. Traite chaque paquet puis le RETIRE du registre
   persisté : une interruption laisse un registre qui ne contient plus que le
   reste à faire, repris tel quel au prochain chargement. Idempotent à la carte
   près pour les paquets rejoints (union) ; un paquet possédé interrompu en plein
   milieu peut être recréé en double à la reprise — compromis assumé : mieux vaut
   un doublon (fusionnable ensuite) qu'une perte. */
export async function applyMigration(snap, uid, pseudo) {
  const owned = [...(snap.owned || [])];
  const joined = [...(snap.joined || [])];
  const persist = () => savePendingMigration({ owned, joined }, pseudo);

  while (owned.length) {
    await recreateOwnedDeck(owned[0], uid, pseudo);
    owned.shift();
    persist();
  }
  while (joined.length) {
    try { await mergeJoinedDeck(joined[0], uid, pseudo); }
    catch (e) { console.error("Fusion paquet rejoint", joined[0]?.deckId, e); }
    joined.shift();
    persist();
  }
  clearPendingMigration();
}

/* Copie un paquet (le sien ou celui d'un autre membre) : la copie appartient à
   l'utilisateur, avec son propre code de partage et ses propres fichiers image.
   L'avancement n'est pas repris — la copie repart d'une progression vierge. */
export async function copyDeck(deck, uid, pseudo, opts = {}) {
  // Même tri que watchCards : sans orderBy, Firestore renvoie les cartes par
  // identifiant, et celles sans champ `order` (créées à la main plutôt
  // qu'importées) se retrouveraient mélangées dans la copie.
  const snap = await getDocs(query(collection(db, "decks", deck.id, "cards"), orderBy("createdAt", "asc")));
  let cards = sortCards(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

  // `opts.ids` restreint la copie à une sélection (export d'un sous-ensemble).
  if (opts.ids) {
    const garder = new Set(opts.ids);
    cards = cards.filter((c) => garder.has(c.id));
  }

  const name = opts.name?.trim() || `${deck.name} (copie)`;
  const code = genCode();
  const ref = await addDoc(decksCol, {
    name,
    owner: uid,
    ownerPseudo: pseudo,
    members: [uid],
    pseudos: { [uid]: pseudo },
    cardCount: cards.length,
    stats: {},
    membersCanEdit: false,
    code,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "shareCodes", code), { deckId: ref.id, name });

  // Les images étant rangées sous l'empreinte de leur contenu, la copie réutilise
  // les mêmes fichiers : rien à télécharger, rien à dupliquer, une seule écriture
  // groupée (writeBatch : 500 opérations maximum, soit 500 cartes).
  const batch = writeBatch(db);
  cards.forEach((c, i) => {
    const id = doc(collection(db, "decks", ref.id, "cards")).id;
    batch.set(doc(db, "decks", ref.id, "cards", id), {
      rectoText: c.rectoText || "",
      versoText: c.versoText || "",
      rectoImgUrl: c.rectoImgUrl ?? null, rectoImgPath: c.rectoImgPath ?? null,
      versoImgUrl: c.versoImgUrl ?? null, versoImgPath: c.versoImgPath ?? null,
      order: i * ORDER_STEP,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return ref.id;
}

// Rejoindre un paquet partagé à partir de son code.
/* Rejoindre un paquet dont on connaît l'id (catalogue d'un groupe) : même
   self-join que par code, sans passer par la table shareCodes. */
export function joinDeck(deckId, uid, pseudo) {
  return updateDoc(doc(db, "decks", deckId), {
    members: arrayUnion(uid),
    [`pseudos.${uid}`]: pseudo,
  });
}

export async function joinByCode(code, uid, pseudo) {
  const snap = await getDoc(doc(db, "shareCodes", code.trim().toUpperCase()));
  if (!snap.exists()) throw new Error("Aucun paquet ne correspond à ce code.");
  const { deckId } = snap.data();
  await joinDeck(deckId, uid, pseudo);
  return deckId;
}

/* ------------------------------- Cartes ------------------------------ */

/* Ordre d'affichage : `order` croissant. Les cartes sans `order` (créées avant le
   glisser-déposer, ou tout juste ajoutées) restent à la fin, par ancienneté — le
   tri est stable et la requête est déjà triée par createdAt. */
const ORDER_STEP = 1000;
const rank = (c) => (typeof c.order === "number" ? c.order : Number.MAX_SAFE_INTEGER);
export const sortCards = (cards) => [...cards].sort((a, b) => rank(a) - rank(b));

/* Lecture ponctuelle des cartes (préchargement hors ligne, export…). */
export async function getCards(deckId) {
  const q = query(collection(db, "decks", deckId, "cards"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return sortCards(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/* Le second argument indique si l'instantané vient du cache local : les données
   peuvent alors être incomplètes, ce dont dépend repairDeckStats. */
export function watchCards(deckId, cb) {
  const q = query(collection(db, "decks", deckId, "cards"), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => cb(sortCards(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), { fromCache: snap.metadata.fromCache }),
    (e) => { onWatchError("des cartes")(e); cb([], { fromCache: false }); },
  );
}

/* Enregistre le nouvel ordre : une seule écriture par carte réellement déplacée. */
export function reorderCards(deckId, orderedCards) {
  const batch = writeBatch(db);
  let changed = 0;
  orderedCards.forEach((c, i) => {
    const order = i * ORDER_STEP;
    if (c.order !== order) {
      batch.update(doc(db, "decks", deckId, "cards", c.id), { order });
      changed++;
    }
  });
  return changed ? batch.commit() : Promise.resolve();
}

// Génère un id de carte à l'avance (utile pour nommer le fichier image avant écriture).
export function newCardId(deckId) {
  return doc(collection(db, "decks", deckId, "cards")).id;
}

export function addCard(deckId, cardId, data) {
  const batch = writeBatch(db);
  batch.set(doc(db, "decks", deckId, "cards", cardId), { ...data, createdAt: serverTimestamp() });
  batch.update(doc(db, "decks", deckId), { cardCount: increment(1) });
  return batch.commit();
}

export function updateCard(deckId, cardId, data) {
  return updateDoc(doc(db, "decks", deckId, "cards", cardId), data);
}

/* ------------------------ Suivi d'apprentissage ---------------------- */
// Chaque carte porte une table `learned` : uid -> bool. Le suivi est donc propre
// à chaque membre, sans lecture supplémentaire (les cartes sont déjà écoutées).
// Trois états : true = apprise, false = à revoir, absent = pas encore évaluée.

export const learnState = (card, uid) => {
  const v = card?.learned?.[uid];
  return v === true ? "apprise" : v === false ? "arevoir" : "nonvue";
};
export const isLearned = (card, uid) => learnState(card, uid) === "apprise";
export const isToReview = (card, uid) => learnState(card, uid) === "arevoir";

/* --- Compteurs agrégés -----------------------------------------------------
   Le paquet porte `cardCount` et `stats: { uid: { apprise, arevoir } }`. Ils
   évitent de lire toutes les cartes juste pour afficher une progression : le
   document du paquet est déjà lu par watchDecks. Toute mutation d'une carte met
   les compteurs à jour dans le MÊME writeBatch, donc les deux ne peuvent pas
   diverger sur un échec ; repairDeckStats() rattrape le reste (paquets créés
   avant cette version, écriture faite par une version antérieure du code).      */

// Effet d'un changement d'état sur les compteurs d'un utilisateur.
function statsDelta(uid, from, to) {
  if (from === to) return {};
  const d = {};
  const bump = (k, n) => { if (k !== "nonvue") d[k] = (d[k] || 0) + n; };
  bump(from, -1);
  bump(to, 1);
  return Object.fromEntries(Object.entries(d).map(([k, n]) => [`stats.${uid}.${k}`, increment(n)]));
}

/* Écriture unifiée de la progression d'une carte.
   `learned` : true (apprise), false (à revoir), null (jamais vue → la clé est
   retirée plutôt que de laisser une valeur vide). `srs` suit la même règle.
   Les deux modes de révision passent par ici, ce qui garantit que le statut
   manuel, l'historique espacé et les compteurs du paquet restent cohérents. */
export function setCardProgress(deckId, card, uid, { learned, srs }) {
  const patch = {};
  if (learned !== undefined) patch[`learned.${uid}`] = learned === null ? deleteField() : learned;
  if (srs !== undefined) patch[`srs.${uid}`] = srs === null ? deleteField() : srs;

  const batch = writeBatch(db);
  batch.update(doc(db, "decks", deckId, "cards", card.id), patch);

  if (learned !== undefined) {
    const to = learned === true ? "apprise" : learned === false ? "arevoir" : "nonvue";
    const delta = statsDelta(uid, learnState(card, uid), to);
    if (Object.keys(delta).length) batch.update(doc(db, "decks", deckId), delta);
  }
  return batch.commit();
}

/* Auto-évaluation libre : met aussi à jour l'historique espacé, pour que les
   deux modes de révision ne se contredisent pas. */
export function setCardLearned(deckId, card, uid, learned) {
  const srs = learned === null
    ? null
    : depuisAutoEval(srsOf(card, uid), etatCarte(card, uid), learned);
  return setCardProgress(deckId, card, uid, { learned, srs });
}

/* Remet à « pas encore vue » toutes les cartes du paquet, pour cet utilisateur
   seulement : le suivi des autres membres n'est pas touché. */
export function resetProgress(deckId, cards, uid) {
  const batch = writeBatch(db);
  cards.forEach((c) => {
    if (learnState(c, uid) === "nonvue") return;
    batch.update(doc(db, "decks", deckId, "cards", c.id), { [`learned.${uid}`]: deleteField() });
  });
  batch.update(doc(db, "decks", deckId), { [`stats.${uid}`]: deleteField() });
  return batch.commit();
}

/* Propage un changement de pseudo à tous les paquets de l'utilisateur.
   Seule la clé `pseudos.{uid}` est écrite — c'est aussi elle qui sert à
   l'affichage, y compris pour le propriétaire, afin d'éviter de toucher
   `ownerPseudo` que les règles réservent à la création. */
export async function renamePseudo(decks, uid, pseudo) {
  await Promise.all(decks.map((d) =>
    updateDoc(doc(db, "decks", d.id), { [`pseudos.${uid}`]: pseudo })));
}

/* Nom affiché du propriétaire d'un paquet. */
export const ownerName = (deck) => deck?.pseudos?.[deck.owner] || deck?.ownerPseudo || "?";

/* Remet à zéro la progression de l'utilisateur sur TOUS ses paquets.
   Renvoie le nombre de paquets traités. */
export async function resetAllProgress(decks, uid) {
  for (const deck of decks) {
    const cards = await getCards(deck.id);
    await resetProgress(deck.id, cards, uid);
  }
  return decks.length;
}

/* Efface toute trace de l'utilisateur, puis supprime son compte anonyme.
   Les paquets qu'il possède sont supprimés (ils disparaissent pour tous les
   membres), ceux qu'il a rejoints sont simplement quittés. */
export async function deleteAccount(decks, uid, password) {
  // Réauthentifier D'ABORD : Firebase exige une connexion récente pour
  // supprimer un compte permanent (`requires-recent-login`). Si cette étape
  // échoue, on n'a encore rien détruit — les paquets sont intacts.
  await reauthenticate(password);
  for (const deck of decks) {
    if (deck.owner === uid) {
      await deleteDeck(deck.id, deck.code);
    } else {
      // Effacer la progression AVANT de quitter : une fois retiré des membres,
      // les règles refusent toute écriture sur le paquet.
      await resetProgress(deck.id, await getCards(deck.id), uid);
      await leaveDeck(deck.id, uid);
    }
  }
  await deleteCurrentUser();
}

/* Progression lue depuis les compteurs du paquet (accueil : aucune carte lue). */
export function deckProgress(deck, uid) {
  const total = deck?.cardCount || 0;
  const apprise = deck?.stats?.[uid]?.apprise || 0;
  const arevoir = deck?.stats?.[uid]?.arevoir || 0;
  return { total, apprise, arevoir, nonvue: Math.max(0, total - apprise - arevoir) };
}

/* Progression recalculée depuis les cartes (vue paquet : elles sont déjà là). */
export function statsFromCards(cards, uid) {
  const s = { total: cards.length, apprise: 0, arevoir: 0, nonvue: 0 };
  cards.forEach((c) => s[learnState(c, uid)]++);
  return s;
}

/* Recalcule les compteurs et n'écrit qu'en cas d'écart.
   Ne touche QUE l'entrée de l'utilisateur courant : réécrire `stats` en entier
   écraserait le suivi des autres membres avec des valeurs calculées ici, alors
   qu'ils réparent eux-mêmes le leur en ouvrant le paquet. */
export function repairDeckStats(deckId, deck, cards, uid) {
  const mine = { apprise: 0, arevoir: 0 };
  cards.forEach((c) => {
    const s = learnState(c, uid);
    if (s !== "nonvue") mine[s]++;
  });

  const cur = deck.stats?.[uid] || {};
  const same = deck.cardCount === cards.length
    && (cur.apprise || 0) === mine.apprise
    && (cur.arevoir || 0) === mine.arevoir;

  if (same) return Promise.resolve();
  return updateDoc(doc(db, "decks", deckId), {
    cardCount: cards.length,
    [`stats.${uid}`]: mine,
  });
}

/* Filtre d'une série :
     "toutes"   tout le paquet
     "jamais"   cartes encore jamais évaluées
     "arevoir"  tout sauf les apprises (donc les ✗ ET les jamais vues)
     "apprises" cartes marquées apprises */
export function matchesFilter(card, uid, filter) {
  if (filter === "jamais") return learnState(card, uid) === "nonvue";
  if (filter === "arevoir") return !isLearned(card, uid);
  if (filter === "apprises") return isLearned(card, uid);
  return true;
}

/* Suppression groupée. Les compteurs sont ajustés en une écriture plutôt qu'une
   par carte ; en cas d'interruption, repairDeckStats les remet d'aplomb à la
   prochaine ouverture du paquet. */
export async function deleteCards(deckId, cards) {
  if (!cards.length) return;

  await Promise.all(cards.flatMap((c) => [c.rectoImgPath, c.versoImgPath]).map(deleteImageByPath));

  for (let start = 0; start < cards.length; start += 400) {
    const batch = writeBatch(db);
    cards.slice(start, start + 400)
      .forEach((c) => batch.delete(doc(db, "decks", deckId, "cards", c.id)));
    await batch.commit();
  }

  // Les décomptes par membre sont cumulés avant d'être convertis en increment().
  const deltas = {};
  cards.forEach((c) => Object.entries(c.learned || {}).forEach(([uid, v]) => {
    const k = v === true ? "apprise" : v === false ? "arevoir" : null;
    if (k) deltas[`stats.${uid}.${k}`] = (deltas[`stats.${uid}.${k}`] || 0) - 1;
  }));
  const patch = { cardCount: increment(-cards.length) };
  Object.entries(deltas).forEach(([k, n]) => { patch[k] = increment(n); });
  await updateDoc(doc(db, "decks", deckId), patch);
}

export async function deleteCard(deckId, cardId, card) {
  await deleteImageByPath(card?.rectoImgPath);
  await deleteImageByPath(card?.versoImgPath);

  // La carte disparaît des compteurs de chaque membre qui l'avait évaluée.
  const deckPatch = { cardCount: increment(-1) };
  Object.entries(card?.learned || {}).forEach(([uid, v]) => {
    const k = v === true ? "apprise" : v === false ? "arevoir" : null;
    if (k) deckPatch[`stats.${uid}.${k}`] = increment(-1);
  });

  const batch = writeBatch(db);
  batch.delete(doc(db, "decks", deckId, "cards", cardId));
  batch.update(doc(db, "decks", deckId), deckPatch);
  return batch.commit();
}
