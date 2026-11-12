import {
  doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase";

/*
 * Dossiers personnels (étiquettes) — rangement PRIVÉ de la liste d'accueil.
 *
 * À ne pas confondre avec les groupes (catalogues partagés). Ici chacun range
 * SES paquets comme il veut, et un paquet peut porter plusieurs étiquettes.
 * Tout tient dans un seul document par utilisateur : un seul écouteur, une seule
 * source de vérité, et le cache Firestore persistant le rend disponible hors
 * ligne comme le reste.
 *
 *   users/{uid}
 *     folders:  [ { id, name } ]           # l'ordre du tableau = l'ordre affiché
 *     deckTags: { deckId: [folderId, …] }  # étiquettes de CE paquet, pour MOI
 *
 * Un paquet supprimé ou quitté laisse une clé obsolète dans `deckTags` : elle
 * est filtrée à l'affichage (on ne garde que les paquets réellement présents),
 * jamais nettoyée activement — même principe que le reste de l'app.
 *
 * Comme l'uid est PRÉSERVÉ lors de la liaison d'un compte anonyme (anonyme →
 * permanent), les dossiers suivent automatiquement dans ce cas. Seule la
 * migration par copie (connexion à un autre compte, uid différent) demanderait
 * de les réunir explicitement — à traiter avec le reste de la fusion.
 */

const userRef = (uid) => doc(db, "users", uid);
const genId = () => Math.random().toString(36).slice(2, 10);

const EMPTY = { folders: [], deckTags: {} };

/* Écoute le document de préférences. Renvoie toujours une forme complète, même
   quand le document n'existe pas encore (nouvel utilisateur). */
export function watchUserPrefs(uid, cb) {
  return onSnapshot(
    userRef(uid),
    (snap) => {
      const d = snap.data() || {};
      cb({ folders: d.folders || [], deckTags: d.deckTags || {} });
    },
    (e) => { if (e?.code !== "permission-denied") console.error("Écoute des préférences", e); cb(EMPTY); },
  );
}

/* Crée un dossier. setDoc(merge) crée le document au premier usage sans écraser
   ce qui existe ; arrayUnion ajoute sans risque de doublon. */
export async function createFolder(uid, name) {
  const folder = { id: genId(), name: name.trim() };
  await setDoc(userRef(uid), { folders: arrayUnion(folder) }, { merge: true });
  return folder.id;
}

/* Renommer, réordonner et supprimer réécrivent le tableau `folders` en entier
   (arrayUnion/Remove ne savent apparier que des valeurs exactes) : le composant
   passe la liste courante, déjà à jour via watchUserPrefs. updateDoc suppose le
   document présent — c'est toujours le cas dès qu'un dossier existe. */
export function renameFolder(uid, folders, id, name) {
  const next = folders.map((f) => (f.id === id ? { ...f, name: name.trim() } : f));
  return updateDoc(userRef(uid), { folders: next });
}

export function reorderFolders(uid, orderedFolders) {
  return updateDoc(userRef(uid), { folders: orderedFolders });
}

/* Supprime un dossier ET retire son id de toutes les étiquettes. On réécrit
   `deckTags` en entier (le merge ne saurait pas vider une clé), en laissant
   tomber les paquets qui n'ont plus d'étiquette. */
export function deleteFolder(uid, folders, deckTags, id) {
  const nextFolders = folders.filter((f) => f.id !== id);
  const nextTags = {};
  for (const [deckId, ids] of Object.entries(deckTags)) {
    const kept = ids.filter((x) => x !== id);
    if (kept.length) nextTags[deckId] = kept;
  }
  return updateDoc(userRef(uid), { folders: nextFolders, deckTags: nextTags });
}

/* Ajoute ou retire une étiquette sur un paquet. setDoc(merge) + arrayUnion/Remove
   sur le chemin imbriqué `deckTags.<deckId>` crée le document si besoin. */
export function toggleDeckFolder(uid, deckId, folderId, on) {
  return setDoc(
    userRef(uid),
    { deckTags: { [deckId]: on ? arrayUnion(folderId) : arrayRemove(folderId) } },
    { merge: true },
  );
}

/* Étiquettes d'un paquet (tableau d'ids), tolérant à l'absence de clé. */
export const tagsOf = (deckTags, deckId) => deckTags?.[deckId] || [];
