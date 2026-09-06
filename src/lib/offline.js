import { getCards } from "./decks";

/*
 * Paquets marqués « disponibles hors ligne ».
 *
 * Le cache de Firestore garde de lui-même ce qui a transité, mais sans aucune
 * garantie : il évince les données anciennes quand il sature, et surtout il
 * ignore les images, qui vivent dans Storage et ne sont mises en cache que
 * lorsqu'elles ont été affichées à l'écran. Réviser un paquet illustré dans le
 * métro échouerait donc sur les cartes jamais ouvertes.
 *
 * Marquer un paquet déclenche un préchargement explicite : toutes ses cartes et
 * toutes ses images. Le choix est propre à l'appareil, d'où localStorage plutôt
 * que Firestore — un paquet gardé sur le téléphone n'a pas à l'être sur le
 * poste de travail.
 */

const KEY = "flash.offlineDecks";
const IMG_CACHE = "images-cartes";        // doit correspondre à vite.config.js

export function offlineDecks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export const isOfflineDeck = (id) => offlineDecks().has(id);

function setFlag(id, on) {
  const set = offlineDecks();
  if (on) set.add(id); else set.delete(id);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

const imageUrls = (cards) =>
  cards.flatMap((c) => [c.rectoImgUrl, c.versoImgUrl]).filter(Boolean);

/* Charge toutes les cartes et toutes les images du paquet.
   Les images passent par une balise Image plutôt que fetch : la requête est
   alors identique à celle d'un affichage normal, donc interceptée et mise en
   cache par le service worker, sans se heurter à CORS. */
export async function prefetchDeck(deckId, onProgress) {
  const cards = await getCards(deckId);
  const urls = imageUrls(cards);

  let done = 0;
  for (const url of urls) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = url;
    });
    onProgress?.(++done, urls.length);
  }

  setFlag(deckId, true);
  return { cards: cards.length, images: urls.length };
}

/* Retire le marqueur et libère les images du cache. Les documents, eux, restent
   dans le cache de Firestore, qui les évincera de lui-même. */
export async function forgetDeck(deckId) {
  setFlag(deckId, false);
  try {
    const cards = await getCards(deckId);
    const cache = await caches.open(IMG_CACHE);
    await Promise.all(imageUrls(cards).map((url) => cache.delete(url)));
  } catch { /* pas de service worker (développement) ou lecture impossible */ }
}
