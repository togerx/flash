import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X, CheckCircle2, Sparkles, Flame, Pencil } from "lucide-react";
import { Shell, HomeLogo, useBack } from "./ui";
import SwipeCard from "./SwipeCard";
import { Face } from "./Review";
import { setCardProgress } from "../lib/decks";
import {
  srsOf, etatCarte, repondreAcquisition, repondreMaintien, seance, learnedDepuisSrs,
} from "../lib/srs";

/*
 * Révision guidée : la file est composée par srs.js, et chaque réponse la
 * réordonne. Une carte ratée revient dans la même séance (échéance en minutes)
 * au lieu d'être renvoyée à demain — c'est tout l'intérêt des paliers courts.
 *
 * Les échéances des paliers ne sont pas attendues en temps réel : quand la file
 * ne contient plus que des cartes à venir, la plus proche est reproposée
 * immédiatement. Sinon une séance de dix cartes durerait dix minutes de montre.
 */
export default function GuidedReview({ deck, cards, uid, config, onExit, onHome, onEdit, editing }) {
  const [file, setFile] = useState(
    () => seance(cards, uid, { maxNouvelles: config.count }).slice(0, config.count).map((c) => ({ id: c.id, due: 0 })));
  const [flipped, setFlipped] = useState(false);
  const [editReady, setEditReady] = useState(false);   // crayon : carte retournée + flip terminé
  const [lightbox, setLightbox] = useState(null);
  // Balayage à deux doigts = quitter la séance ; l'image agrandie, si ouverte, se
  // referme d'abord (enregistrée par-dessus).
  useBack(onExit);
  useBack(lightbox ? () => setLightbox(null) : null);
  const [noAnim, setNoAnim] = useState(false);
  const [marking, setMarking] = useState(null);        // "ok" | "ko" pendant l'animation
  const [bilan, setBilan] = useState({ vues: 0, apprises: 0, oubliees: 0 });

  const debut = useRef(Date.now());
  const total = useRef(0);
  const seanceIds = useRef(null);
  const markTimer = useRef(null);
  useEffect(() => () => clearTimeout(markTimer.current), []);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  // Une carte supprimée par un autre membre disparaît de la file.
  const vivantes = useMemo(() => file.filter((f) => byId.has(f.id)), [file, byId]);
  if (total.current === 0 && vivantes.length) {
    total.current = vivantes.length;
    seanceIds.current = vivantes.map((v) => v.id);
  }

  const courante = vivantes[0];
  const card = courante ? byId.get(courante.id) : null;
  const srs = card ? srsOf(card, uid) : null;
  const etat = card ? etatCarte(card, uid) : null;
  const enMaintien = etat === "connue";
  const frontIsRecto = config.direction === "recto-verso";

  // Crayon d'édition : visible dès que la carte est statique (recto ou verso),
  // masqué pendant le retournement (~0,55 s) et les mouvements (via SwipeCard).
  useEffect(() => {
    setEditReady(false);
    const t = setTimeout(() => setEditReady(true), 560);
    return () => clearTimeout(t);
  }, [flipped, card?.id]);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /* Clavier : espace retourne la carte, ↑ « je sais » et ↓ « à revoir ».
     En maintien, ces deux touches valent les notes « Bien » et « Oubli » ;
     « Difficile » et « Facile » restent au clic, plus rares et plus nuancées. */
  const clavier = useRef({});
  useEffect(() => {
    const onKey = (e) => {
      const { flip: f, evaluer, pret, editing: edit } = clavier.current;
      // Éditeur ouvert par-dessus la séance : on laisse ses champs au clavier.
      if (edit || e.target.matches?.("input, textarea, [contenteditable]")) return;
      const gere = ["ArrowUp", "ArrowDown", "Enter"].includes(e.key) || e.code === "Space";
      if (!gere) return;
      // Voir Review.jsx : on retire le focus du bouton cliqué, sans quoi le
      // navigateur lui dessine son anneau dès la première touche.
      if (document.activeElement?.tagName === "BUTTON") document.activeElement.blur();
      e.preventDefault();

      if (e.code === "Space" || e.key === "Enter") { f(); return; }
      // Pas d'évaluation avant d'avoir vu la réponse.
      if (pret) evaluer(e.key === "ArrowUp");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Première carte déjà acquise de la séance : on souligne le passage de la
     découverte à la consolidation, qui est le moment où l'on a besoin d'être
     encouragé plutôt que félicité. */
  /* Encouragement à chaque carte déjà acquise qui se présente : ce sont les
     révisions de maintien, les moins gratifiantes, qui méritent le signal.
     Le suivi par identifiant évite de rejouer l'animation à chaque rendu. */
  const [encore, setEncore] = useState(false);
  const dernierePresentee = useRef(null);
  useEffect(() => {
    if (!card || card.id === dernierePresentee.current) return;
    dernierePresentee.current = card.id;
    if (etat !== "connue") return;
    setEncore(true);
    // Le retrait suit normalement la fin de l'animation (onAnimationEnd). Ce
    // filet couvre l'onglet en arrière-plan, où les animations ne progressent
    // pas : sans lui, le badge resterait figé au retour de l'utilisateur.
    // Volontairement non annulé — StrictMode le couperait au remontage.
    setTimeout(() => setEncore(false), 3000);
  }, [card?.id, etat]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Revenir au recto SANS animer : en changeant de carte depuis le verso,
     la rotation exposerait la réponse de la carte suivante. */
  const montrerRecto = () => {
    if (flipped) {
      setNoAnim(true);
      const back = () => setNoAnim(false);
      requestAnimationFrame(() => requestAnimationFrame(back));
      setTimeout(back, 80);
    }
    setFlipped(false);
  };

  /* Applique une réponse : écrit progression et statut manuel d'un seul tenant,
     puis replace ou retire la carte selon que son échéance tombe dans la séance. */
  const repondre = (res, positif) => {
    if (!card || marking) return;
    setCardProgress(deck.id, card, uid, { srs: res, learned: learnedDepuisSrs(res) })
      .catch((e) => console.error(e));

    setBilan((b) => ({
      vues: b.vues + 1,
      apprises: res.etat === "connue" ? b.apprises + 1 : b.apprises,
      oubliees: positif ? b.oubliees : b.oubliees + 1,
    }));
    setMarking(positif ? "ok" : "ko");

    markTimer.current = setTimeout(() => {
      setMarking(null);
      montrerRecto();
      const dansLaSeance = res.etat === "encours";
      setFile((f) => {
        const reste = f.slice(1);
        if (!dansLaSeance) return reste;
        const item = { id: card.id, due: res.due };
        const i = reste.findIndex((x) => x.due > item.due);
        return i === -1 ? [...reste, item] : [...reste.slice(0, i), item, ...reste.slice(i)];
      });
    }, 320);
  };

  const noter = (note) => repondre(repondreMaintien(srs, note, Date.now()), note > 1);
  const acquisition = (juste) => repondre(repondreAcquisition(srs, juste, Date.now()), juste);
  // « Je sais » / « À revoir » : note « Bien »/« Oubli » en maintien, sinon
  // réussite/échec d'acquisition. Partagé par le clavier et les balayages.
  const evaluer = (positif) => (enMaintien ? noter(positif ? 3 : 1) : acquisition(positif));
  const pret = !!card && flipped && !marking;

  clavier.current = {
    flip: () => setFlipped((f) => !f),
    evaluer,
    pret,
    editing,
  };

  const front = card && (frontIsRecto
    ? { text: card.rectoText, img: card.rectoImgUrl, label: "Recto" }
    : { text: card.versoText, img: card.versoImgUrl, label: "Verso" });
  const back = card && (frontIsRecto
    ? { text: card.versoText, img: card.versoImgUrl, label: "Verso" }
    : { text: card.rectoText, img: card.rectoImgUrl, label: "Recto" });

  const minutes = Math.round((Date.now() - debut.current) / 60000);
  // Une carte déjà vue dans cette séance : le signaler évite de croire à un bug.
  const reprise = !!courante?.due;

  /* Répartition des cartes de la séance par état, recalculée à chaque
     instantané : la barre suit donc l'apprentissage en direct. Elle porte sur
     la composition initiale, y compris les cartes déjà sorties de la file. */
  const rep = useMemo(() => {
    const r = { apprises: 0, encours: 0, nonvues: 0 };
    (seanceIds.current || []).forEach((id) => {
      const c = byId.get(id);
      if (!c) return;
      const e = etatCarte(c, uid);
      if (e === "connue") r.apprises++;
      else if (e === "encours") r.encours++;
      else r.nonvues++;
    });
    return r;
  }, [byId, uid, file]);

  const pct = (n) => (total.current ? (n / total.current) * 100 : 0);

  const enTete = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <HomeLogo onHome={onHome} dark />
          <button onClick={onExit} className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10">
            <ArrowLeft size={18} /> Quitter
          </button>
        </div>
        <span
          title="Une carte est acquise lorsqu'elle passe en révision espacée. Notée « Oubli » ou « À revoir », elle repasse dans cette séance."
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-slate-200"
        >
          <Sparkles size={14} /> {rep.apprises} / {total.current} acquises
        </span>
      </div>

      {/* Répartition des cartes de la séance, mise à jour à chaque réponse :
          acquises, vues mais pas encore acquises, pas encore présentées. */}
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct(rep.apprises)}%` }} />
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${pct(rep.encours)}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-400" /> {rep.apprises} apprise{rep.apprises > 1 ? "s" : ""}</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400" /> {rep.encours} en cours</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-white/25" /> {rep.nonvues} non vue{rep.nonvues > 1 ? "s" : ""}</span>
      </div>
    </>
  );

  if (!card) {
    return (
      <Shell dark fit>
        {enTete}
        <div className="mt-4 flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
            <CheckCircle2 size={34} className="text-emerald-500" />
            <div>
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100">Séance terminée</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {bilan.vues > 0
                  ? `${bilan.vues} révision${bilan.vues > 1 ? "s" : ""} en ${minutes || "<1"} min`
                  : "Aucune carte à réviser pour le moment."}
              </p>
            </div>
            {bilan.vues > 0 && (
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {bilan.apprises} acquise{bilan.apprises > 1 ? "s" : ""}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {bilan.oubliees} à revoir
                </span>
              </div>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Revenez demain : les cartes réapparaîtront à leur échéance.
            </p>
            <button onClick={onExit} className="mt-1 rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700">
              Terminer
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell dark fit>
      {enTete}

      <p className="mt-6 text-center text-sm text-slate-400">
        {reprise && <span className="text-violet-300">Reprise · </span>}
        {enMaintien ? "Révision" : etat === "encours" ? "Apprentissage en cours" : "Nouvelle carte"}
        {` · ${frontIsRecto ? "Recto → Verso" : "Verso → Recto"} · espace retourne · ↑ je sais · ↓ à revoir`}
      </p>

      {encore && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center px-4">
          {/* `key` sur l'identifiant de carte : sans remontage du nœud,
              l'animation ne rejouerait pas d'une carte à l'autre. Le retrait
              suit sa fin plutôt qu'un minuteur — même horloge que l'effet. */}
          <div
            key={card.id}
            onAnimationEnd={() => setEncore(false)}
            className="encore flex items-center gap-2 rounded-full bg-violet-600 px-3.5 py-1.5 text-white shadow-lg shadow-violet-900/40"
          >
            <Flame size={15} />
            <span className="text-sm font-semibold">Encore&nbsp;!</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-1 items-center justify-center">
        {/* SwipeCard : la carte suit le doigt. ↑ « je sais », ↓ « à revoir »
            (seulement une fois retournée, comme au clavier) ; pas de gauche/droite
            en guidée. fling=false : la carte revient et l'animation d'évaluation
            (halo + file) joue, comme au clavier. */}
        <SwipeCard
          onTap={() => setFlipped((f) => !f)}
          onUp={pret ? () => evaluer(true) : undefined}
          onDown={pret ? () => evaluer(false) : undefined}
          disabled={!!marking || editing}
          fling={false}
          corner={onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(card); }}
              aria-label="Modifier cette carte"
              title="Modifier cette carte"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/55 text-white transition hover:bg-slate-900/80"
            >
              <Pencil size={15} />
            </button>
          )}
          cornerShown={editReady}
          /* Format paysage (rectangle horizontal), ratio 3:2. */
          className="relative aspect-[3/2] max-h-full w-full max-w-md cursor-pointer focus-visible:outline-none"
        >
          {/* absolute inset-0 : remplit le SwipeCard sans dépendre d'une hauteur % */}
          <div className={`flip-card !absolute inset-0 ${marking === "ok" ? "mark-ok" : marking === "ko" ? "mark-ko" : ""}`}>
            <div className={`flip-inner ${flipped ? "flipped" : ""} ${noAnim ? "no-anim" : ""}`}>
              <Face side={front} accent={false} active={!flipped} onZoom={setLightbox} />
              <Face side={back} accent back active={flipped} onZoom={setLightbox} />
            </div>
          </div>
        </SwipeCard>
      </div>

      {/* Les boutons n'apparaissent qu'une fois la réponse vue : s'auto-évaluer
          avant d'avoir retourné la carte n'aurait aucun sens. */}
      <div className="mt-5 min-h-[92px]">
        {marking ? (
          // Rien pendant l'animation : la réponse vient d'être écrite, et le
          // rafraîchissement en temps réel ferait autrement basculer le groupe
          // de boutons sous le doigt de l'utilisateur.
          <p className="text-center text-sm text-slate-500">…</p>
        ) : !flipped ? (
          <p className="text-center text-sm text-slate-500">Retournez la carte pour vous évaluer.</p>
        ) : enMaintien ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["Oubli", "Difficile", "Bien", "Facile"].map((label, i) => (
              <NoteBtn
                key={label}
                onClick={() => noter(i + 1)}
                busy={!!marking}
                tone={["rose", "amber", "emerald", "sky"][i]}
                label={label}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NoteBtn onClick={() => acquisition(false)} busy={!!marking} tone="rose" label="À revoir" />
              <NoteBtn onClick={() => acquisition(true)} busy={!!marking} tone="emerald" label="Je sais" />
            </div>
            {/* Sans cette ligne, l'absence des quatre notes passe pour un défaut :
                elles n'arrivent qu'une fois la carte acquise, donc à la séance
                suivante au plus tôt. */}
            <p className="mt-2 text-center text-xs text-slate-500">
              Apprentissage : deux réussites pour acquérir la carte. Les quatre niveaux
              de difficulté apparaîtront à ses révisions suivantes.
            </p>
          </>
        )}
      </div>

      {lightbox && (
        <div className="lb-veil fixed inset-0 z-[70] flex items-center justify-center bg-neutral-800/80 p-6 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="lb-img max-h-[85vh] max-w-full cursor-zoom-out rounded-2xl shadow-2xl" />
          <button onClick={() => setLightbox(null)} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25" aria-label="Fermer"><X size={22} /></button>
        </div>
      )}
    </Shell>
  );
}

function NoteBtn({ onClick, busy, tone, label }) {
  const tons = {
    rose: "bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 ring-rose-500/30",
    amber: "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 ring-amber-500/30",
    emerald: "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 ring-emerald-500/30",
    sky: "bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 ring-sky-500/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition disabled:opacity-60 ${tons[tone]}`}
    >
      {label}
    </button>
  );
}
