import { useEffect, useState } from "react";
import { Shell, Loading, useBack } from "./ui";
import { SessionModal } from "./DeckView";
import Review from "./Review";
import { getCards } from "../lib/decks";
import { markReviewed } from "../lib/deckMeta";

/*
 * Révision libre portant sur plusieurs paquets à la fois.
 *
 * Les cartes sont rassemblées une bonne fois au démarrage — l'écoute en temps
 * réel de N paquets coûterait cher pour une séance ponctuelle — et chacune
 * garde son `deckId`, sans quoi une évaluation s'écrirait dans le mauvais
 * paquet. L'ordre suit celui des paquets choisis, puis celui des cartes.
 */
export default function MultiReview({ decks, uid, onExit }) {
  const [cards, setCards] = useState(null);
  const [erreur, setErreur] = useState("");
  const [config, setConfig] = useState(null);

  useBack(onExit);   // balayage à deux doigts = quitter la révision multi-paquets

  useEffect(() => {
    decks.forEach((d) => markReviewed(d.id));
    let vivant = true;
    (async () => {
      try {
        const lots = await Promise.all(decks.map(async (d) =>
          (await getCards(d.id)).map((c) => ({ ...c, deckId: d.id, deckName: d.name }))));
        if (vivant) setCards(lots.flat());
      } catch (e) {
        console.error(e);
        if (vivant) setErreur("Chargement des cartes impossible. Vérifiez la connexion.");
      }
    })();
    return () => { vivant = false; };
  }, [decks]);

  if (erreur) {
    return (
      <Shell centered>
        <p className="text-sm text-red-600 dark:text-red-400">{erreur}</p>
        <button onClick={onExit} className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700">
          Retour
        </button>
      </Shell>
    );
  }

  if (!cards) {
    return (
      <Shell centered>
        <Loading label={`Chargement de ${decks.length} paquet${decks.length > 1 ? "s" : ""}…`} />
      </Shell>
    );
  }

  if (!config) {
    const titre = `${decks.length} paquets`;
    return (
      <>
        <Shell centered><Loading label="Préparation de la série…" /></Shell>
        <SessionModal
          cards={cards}
          uid={uid}
          onClose={onExit}
          onStart={(cfg) => setConfig(cfg)}
        />
      </>
    );
  }

  return (
    <Review
      deck={{ id: null, name: `${decks.length} paquets` }}
      cards={cards}
      uid={uid}
      config={config}
      onExit={onExit}
      onHome={onExit}
      onNewSeries={() => setConfig(null)}
    />
  );
}
