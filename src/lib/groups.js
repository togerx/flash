import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, where, orderBy, arrayUnion, arrayRemove, deleteField,
  serverTimestamp, writeBatch, increment,
} from "firebase/firestore";
import { db } from "../firebase";

/*
 * Groupes = catalogues de paquets.
 *
 * Un groupe est une vitrine : ses membres voient la liste des paquets qui y
 * sont publiés (nom, auteur, nombre de cartes) et rejoignent ceux qu'ils
 * veulent — rejoindre reprend exactement le self-join d'un paquet. Le groupe
 * n'ajoute qu'une couche d'annuaire : rien du partage par paquet ne change.
 *
 *   groups/{groupId}          name, owner, ownerPseudo, members[], pseudos,
 *                             code, deckCount, lastPublishedAt, createdAt
 *     catalog/{deckId}        deckId, name, ownerUid, ownerPseudo, cardCount, addedAt
 *   groupCodes/{CODE}         groupId, name          (pour rejoindre)
 *
 * Les notifications « un paquet a été ajouté » sont détectées côté client :
 * `lastPublishedAt` du groupe est comparé à un marqueur local (voir groupSeen).
 */

const groupsCol = collection(db, "groups");
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export function watchGroups(uid, cb) {
  const q = query(groupsCol, where("members", "array-contains", uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { if (e?.code !== "permission-denied") console.error("Écoute des groupes", e); cb([]); },
  );
}

export async function createGroup(name, uid, pseudo) {
  const code = genCode();
  const ref = await addDoc(groupsCol, {
    name,
    owner: uid,
    ownerPseudo: pseudo,
    members: [uid],
    pseudos: { [uid]: pseudo },
    code,
    deckCount: 0,
    lastPublishedAt: null,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "groupCodes", code), { groupId: ref.id, name });
  return ref.id;
}

export function renameGroup(id, name) {
  return updateDoc(doc(db, "groups", id), { name });
}

export async function joinGroupByCode(code, uid, pseudo) {
  const snap = await getDoc(doc(db, "groupCodes", code.trim().toUpperCase()));
  if (!snap.exists()) throw new Error("Aucun groupe ne correspond à ce code.");
  const { groupId } = snap.data();
  await updateDoc(doc(db, "groups", groupId), {
    members: arrayUnion(uid),
    [`pseudos.${uid}`]: pseudo,
  });
  return groupId;
}

export function leaveGroup(groupId, uid) {
  return updateDoc(doc(db, "groups", groupId), {
    members: arrayRemove(uid),
    [`pseudos.${uid}`]: deleteField(),
  });
}

export async function deleteGroup(group) {
  // Vide le catalogue (le groupe supprimé, ses entrées deviennent orphelines).
  const entries = await getDocs(collection(db, "groups", group.id, "catalog"));
  const batch = writeBatch(db);
  entries.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "groups", group.id));
  await batch.commit();
  if (group.code) await deleteDoc(doc(db, "groupCodes", group.code)).catch(() => {});
}

/* --- Catalogue -------------------------------------------------------- */

export function watchCatalog(groupId, cb) {
  const q = query(collection(db, "groups", groupId, "catalog"), orderBy("addedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => { if (e?.code !== "permission-denied") console.error("Écoute du catalogue", e); cb([]); },
  );
}

/* Ids des paquets déjà publiés dans un groupe (lecture ponctuelle, pour cocher
   l'état dans la modale de partage). */
export async function publishedDeckIds(groupId) {
  const snap = await getDocs(collection(db, "groups", groupId, "catalog"));
  return new Set(snap.docs.map((d) => d.id));
}

/* Publie un paquet dans un groupe. Le paquet reçoit le groupe dans son champ
   `groups` (ce qui le rend lisible sans rejoindre), et `lastPublishedAt`
   alimente les notifications. */
export function publishDeck(groupId, deck, uid) {
  const batch = writeBatch(db);
  batch.set(doc(db, "groups", groupId, "catalog", deck.id), {
    deckId: deck.id,
    name: deck.name,
    ownerUid: uid,
    ownerPseudo: deck.pseudos?.[deck.owner] || deck.ownerPseudo || "",
    cardCount: deck.cardCount || 0,
    addedAt: serverTimestamp(),
  });
  batch.update(doc(db, "groups", groupId), {
    deckCount: increment(1),
    lastPublishedAt: serverTimestamp(),
  });
  batch.update(doc(db, "decks", deck.id), { groups: arrayUnion(groupId) });
  return batch.commit();
}

export function unpublishDeck(groupId, deckId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "groups", groupId, "catalog", deckId));
  batch.update(doc(db, "groups", groupId), { deckCount: increment(-1) });
  batch.update(doc(db, "decks", deckId), { groups: arrayRemove(groupId) });
  return batch.commit();
}

/* --- Notifications (marqueur local, par appareil) --------------------- */

const SEEN_KEY = "flash.groupSeen";

function seenMap() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); }
  catch { return {}; }
}

/* Instant de la dernière consultation du catalogue d'un groupe. */
export const groupSeenAt = (groupId) => seenMap()[groupId] || 0;

export function markGroupSeen(groupId) {
  const m = seenMap();
  m[groupId] = Date.now();
  localStorage.setItem(SEEN_KEY, JSON.stringify(m));
}

const publishedMs = (group) => group?.lastPublishedAt?.toMillis?.() ?? 0;

/* Un paquet a-t-il été publié depuis la dernière visite ? */
export const groupHasNews = (group) => publishedMs(group) > groupSeenAt(group.id);
