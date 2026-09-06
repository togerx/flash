import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Shuffle, RotateCcw, X, Maximize2, CheckCircle2, XCircle, Pencil,
} from "lucide-react";
import { Shell, RoundBtn, HomeLogo, useBack } from "./ui";
import SwipeCard from "./SwipeCard";
import RichText, { hasStructure } from "./RichText";
import { setCardLearned, isLearned, isToReview, learnState, matchesFilter } from "../lib/decks";

/* Mélange de Fisher-Yates ([].sort(() => Math.random() - .5) est biaisé). */
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Construit la série : sélection éventuelle, plage, filtre, ordre, puis nombre. */
export function buildSeries(cards, uid, { from, to, order, count, filter, ids: only }) {
  // `only` vient du mode sélection : la série ne part que de ces cartes-là,
  // dans l'ordre du paquet.
  const base = only ? only.map((id) => cards.find((c) => c.id === id)).filter(Boolean) : cards;
  let ids = base.slice(from - 1, to).filter((c) => matchesFilter(c, uid, filter)).map((c) => c.id);
  if (order === "inverse") ids = [...ids].reverse();
  else if (order === "aleatoire") ids = shuffled(ids);
  return ids.slice(0, count);
}

export default function Review({ deck, cards, uid, config, onExit, onHome, onNewSeries, onEdit, editing }) {
  const [series, setSeries] = useState(() => buildSeries(cards, uid, config));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [editReady, setEditReady] = useState(false);   // crayon visible : carte retournée + flip terminé
  const [lightbox, setLightbox] = useState(null);
  // Balayage à deux doigts = quitter la série ; mais si l'image agrandie est
  // ouverte, la refermer d'abord (elle est enregistrée par-dessus).
  useBack(onExit);
  useBack(lightbox ? () => setLightbox(null) : null);
  const [noAnim, setNoAnim] = useState(false);
  const [marking, setMarking] = useState(null);   // "ok" | "ko" pendant l'animation
  const markTimer = useRef(null);
  useEffect(() => () => clearTimeout(markTimer.current), []);

  // État des cartes au démarrage : sert de référence pour le bilan de fin de série.
  const snapshot = () => new Map(cards.map((c) => [c.id, learnState(c, uid)]));
  const [baseline, setBaseline] = useState(snapshot);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  // Tout est dérivé : si un autre membre supprime une carte pendant la révision,
  // elle sort de la série sans que la position ne parte hors bornes.
  const live = useMemo(() => series.filter((id) => byId.has(id)), [series, byId]);

  const total = live.length;
  const at = Math.min(pos, total);        // la position `total` est l'écran de fin
  const done = at >= total;
  const card = byId.get(live[at]);
  const frontIsRecto = config.direction === "recto-verso";

  // Le crayon d'édition apparaît dès que la carte est STATIQUE (recto ou verso),
  // et se masque pendant l'animation de retournement (~0,55 s) et les mouvements
  // (gérés par SwipeCard). Chaque flip / changement de carte relance le délai.
  useEffect(() => {
    setEditReady(false);
    const t = setTimeout(() => setEditReady(true), 560);
    return () => clearTimeout(t);
  }, [flipped, card?.id]);

  // Revenir au recto SANS animer la rotation : en changeant de carte depuis le
  // verso, l'animation ferait défiler la réponse de la carte suivante sous les
  // yeux de l'utilisateur. Les deux rAF laissent le navigateur peindre l'état
  // sans transition avant de la réactiver pour les retournements manuels.
  const showFrontInstantly = () => {
    if (flipped) {
      setNoAnim(true);
      const back = () => setNoAnim(false);
      requestAnimationFrame(() => requestAnimationFrame(back));
      // Filet : onglet en arrière-plan, les rAF ne s'exécutent pas et
      // l'animation resterait désactivée pour les retournements suivants.
      setTimeout(back, 80);
    }
    setFlipped(false);
  };

  const go = (delta) => { showFrontInstantly(); setPos(Math.min(Math.max(at + delta, 0), total)); };
  const flip = () => setFlipped((f) => !f);
  // Repartir pour un tour remet aussi le bilan à zéro.
  const restart = () => { setBaseline(snapshot()); setPos(0); showFrontInstantly(); };
  const shuffle = () => { setBaseline(snapshot()); setSeries(shuffled(live)); setPos(0); showFrontInstantly(); };

  // Auto-évaluation : on enregistre aussitôt, mais on laisse l'animation se
  // jouer avant d'enchaîner — sinon le halo s'afficherait sur la carte suivante.
  const mark = (learned) => {
    if (!card || marking) return;
    // `card.deckId` prime : en révision multi-paquets, chaque carte doit être
    // écrite dans le sien.
    setCardLearned(card.deckId || deck.id, card, uid, learned).catch(() => {});
    setMarking(learned ? "ok" : "ko");
    markTimer.current = setTimeout(() => { setMarking(null); go(1); }, 320);
  };

  // Bilan de la série : ce qui a changé depuis `baseline`.
  const bilan = live.reduce((a, id) => {
    const was = baseline.get(id) ?? "nonvue";
    const now = learnState(byId.get(id), uid);
    if (was === "nonvue" && now !== "nonvue") a.vues++;
    if (was !== "apprise" && now === "apprise") a.apprises++;
    return a;
  }, { vues: 0, apprises: 0 });

  // Échap ferme l'image agrandie.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /* Clavier : espace retourne la carte, les flèches changent de carte.
     Les gestionnaires passent par une référence pour que l'écouteur reste
     installé une seule fois tout en voyant l'état courant. */
  const clavier = useRef({});
  clavier.current = { flip, go, mark, lightbox, done, editing };
  useEffect(() => {
    const onKey = (e) => {
      const { flip: f, go: g, mark: m, lightbox: lb, done: fin, editing: edit } = clavier.current;
      // Éditeur ouvert par-dessus : ses champs captent le clavier, la révision
      // ne doit pas réagir en dessous.
      if (edit || lb || e.target.matches?.("input, textarea, [contenteditable]")) return;
      // Un bouton cliqué garde le focus ; à la première touche, le navigateur
      // passe en mode clavier et lui dessine son anneau. On le lui retire,
      // puisque l'action ne le concerne pas.
      if (document.activeElement?.tagName === "BUTTON") document.activeElement.blur();
      // preventDefault couvre aussi le défilement par les flèches et la barre
      // d'espace, et l'activation d'un bouton resté focalisé après un clic.
      if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); f(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); g(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); g(-1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (!fin) m(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (!fin) m(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Actions des balayages tactiles (mêmes effets que les flèches). Écrire la
     progression puis avancer, comme ArrowUp / ArrowDown, sans le halo — l'envol
     de la carte tient lieu de retour visuel. */
  const swipeMark = (learned) => {
    if (card) setCardLearned(card.deckId || deck.id, card, uid, learned).catch(() => {});
    go(1);
  };

  const frontOf = (c) => (frontIsRecto
    ? { text: c.rectoText, img: c.rectoImgUrl, label: "Recto" }
    : { text: c.versoText, img: c.versoImgUrl, label: "Verso" });
  const front = card && frontOf(card);
  const back = card && (frontIsRecto
    ? { text: card.versoText, img: card.versoImgUrl, label: "Verso" }
    : { text: card.rectoText, img: card.rectoImgUrl, label: "Recto" });

  // Cartes voisines pour l'effet de PILE : la suivante (`behind`) émerge de
  // derrière (balayage gauche), la précédente (`front`) revient par-devant
  // (balayage droite). On n'en montre que le recto tant qu'elles ne sont pas au
  // centre.
  const prevCard = at > 0 ? byId.get(live[at - 1]) : null;
  const nextCard = at + 1 < total ? byId.get(live[at + 1]) : null;
  const peekFace = (c) => (c ? <Face side={frontOf(c)} accent={false} active={false} /> : null);

  return (
    <Shell dark fit>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <HomeLogo onHome={onHome} dark />
          <button onClick={onExit} className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10">
            <ArrowLeft size={18} /> Quitter
          </button>
        </div>
        {/* Mélanger tient sa place ici : c'est un réglage de la série, pas une
            action de navigation comme les boutons du bas. */}
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-slate-200">{Math.min(at + 1, total)} / {total}</span>
          <button
            onClick={shuffle}
            disabled={!total}
            aria-label="Mélanger la série"
            title="Mélanger la série"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            <Shuffle size={15} />
          </button>
        </div>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${total ? (Math.min(at + 1, total) / total) * 100 : 0}%` }} />
      </div>

      <p className="mt-6 text-center text-sm text-slate-400">
        {done
          ? "Fin de la série"
          : `Sens : ${frontIsRecto ? "Recto → Verso" : "Verso → Recto"} · espace retourne · ← → naviguent · ↑ je sais · ↓ à revoir`}
      </p>

      {/* overflow-hidden : fenêtre du « carrousel » — les cartes voisines
          (rendues hors-champ de part et d'autre) sont masquées jusqu'à ce qu'on
          les fasse glisser, et ne créent pas de débordement horizontal. */}
      <div className="mt-4 flex flex-1 items-center justify-center overflow-hidden">
        {done ? (
          <div className="flex h-full max-h-[460px] min-h-[240px] w-full max-w-md flex-col items-center justify-center gap-3 rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-800">
            <CheckCircle2 size={30} className="text-emerald-500" />
            <div>
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100">Série terminée</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{total} carte{total > 1 ? "s" : ""} révisée{total > 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                +{bilan.vues} nouvelle{bilan.vues > 1 ? "s" : ""} vue{bilan.vues > 1 ? "s" : ""}
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                +{bilan.apprises} nouvelle{bilan.apprises > 1 ? "s" : ""} apprise{bilan.apprises > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <button onClick={restart} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"><RotateCcw size={15} /> Recommencer</button>
              <button onClick={onNewSeries} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700">Nouvelle série</button>
              <button onClick={onExit} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Terminer</button>
            </div>
          </div>
        ) : (
          /* SwipeCard : la carte suit le doigt et rejoue l'action de la flèche
             au balayage (→ suivant, ← précédent, ↑ je sais, ↓ à revoir). Le
             toucher simple (onTap) et le clic souris retournent la carte. */
          <SwipeCard
            onTap={flip}
            /* Convention « paquet de cartes » : on tire la carte vers la droite
               pour revenir en arrière (précédent), vers la gauche pour avancer
               (suivant) — la voisine glisse au centre pendant le geste. */
            onLeft={() => go(1)}
            onRight={() => go(-1)}
            onUp={() => swipeMark(true)}
            onDown={() => swipeMark(false)}
            behind={peekFace(nextCard)}
            front={peekFace(prevCard)}
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
            disabled={editing || !!marking}
            /* Carte au format paysage (rectangle horizontal), ratio 3:2 : la
               hauteur découle de la largeur, la carte reste centrée avec de la
               marge et tient sans scroll. */
            className="relative aspect-[3/2] max-h-full w-full max-w-md cursor-pointer focus-visible:outline-none"
          >
            {/* Pas de onKeyDown ici : l'écouteur global gère espace et entrée.
                absolute inset-0 : remplit le SwipeCard sans dépendre d'une hauteur
                en % (qui s'effondrerait dans ce conteneur imbriqué). */}
            <div className={`flip-card !absolute inset-0 ${marking === "ok" ? "mark-ok" : marking === "ko" ? "mark-ko" : ""}`}>
              <div className={`flip-inner ${flipped ? "flipped" : ""} ${noAnim ? "no-anim" : ""}`}>
                <Face side={front} accent={false} active={!flipped} onZoom={setLightbox} />
                <Face side={back} accent back active={flipped} onZoom={setLightbox} />
              </div>
            </div>
          </SwipeCard>
        )}
      </div>

      {!done && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <EvalBtn onClick={() => mark(false)} on={isToReview(card, uid)} busy={!!marking} tone="rose" icon={<XCircle size={17} />} label="À revoir" />
          <EvalBtn onClick={() => mark(true)} on={isLearned(card, uid)} busy={!!marking} tone="emerald" icon={<CheckCircle2 size={17} />} label="Je sais" />
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-2 pb-2">
        <RoundBtn onClick={() => go(-1)} disabled={at === 0} label="Précédente"><ChevronLeft size={22} /></RoundBtn>
        <RoundBtn onClick={restart} disabled={!total} label="Recommencer"><RotateCcw size={20} /></RoundBtn>
        <RoundBtn onClick={() => go(1)} disabled={done} label="Suivante"><ChevronRight size={22} /></RoundBtn>
      </div>

      {lightbox && (
        /* Sortie de l'agrandissement : clic n'importe où (image comprise), croix, ou Échap. */
        <div className="lb-veil fixed inset-0 z-[70] flex items-center justify-center bg-neutral-800/80 p-6 backdrop-blur-sm" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="lb-img max-h-[85vh] max-w-full cursor-zoom-out rounded-2xl shadow-2xl" />
          <button onClick={() => setLightbox(null)} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25" aria-label="Fermer"><X size={22} /></button>
        </div>
      )}
    </Shell>
  );
}

// Bouton d'auto-évaluation ; `on` = état déjà enregistré pour cette carte.
function EvalBtn({ onClick, on, busy, tone, icon, label }) {
  const active = tone === "emerald" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
        on ? active : "bg-white/10 text-slate-200 hover:bg-white/20"
      }`}
    >
      {icon} {label}
    </button>
  );
}

/* Taille de police selon la quantité de texte : une définition d'une ligne
   reste imposante, un tableau de quinze lignes reste lisible. */
function textSize(len, hasImg) {
  const n = len + (hasImg ? 400 : 0);
  if (n > 900) return "text-[11px] leading-snug sm:text-xs";
  if (n > 620) return "text-[13px] leading-snug sm:text-sm";
  if (n > 380) return "text-sm leading-snug sm:text-base";
  if (n > 180) return "text-base leading-snug sm:text-lg";
  return "text-lg leading-snug sm:text-xl";
}

export function Face({ side, accent, back, active, onZoom }) {
  const text = side?.text || "";
  const hasText = text.trim().length > 0;
  const hasImg = !!side?.img;
  const structured = hasStructure(text);

  return (
    // En mode sombre la face claire passe en ardoise : un blanc pur en pleine
    // page noire est éblouissant lors d'une révision nocturne.
    <div className={`flip-face flex flex-col items-center overflow-hidden rounded-3xl p-5 shadow-2xl ${back ? "flip-back" : ""} ${accent ? "bg-violet-600 text-white" : "bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}>
      <span className={`shrink-0 pb-2 text-xs font-semibold uppercase tracking-widest ${accent ? "text-violet-200" : "text-slate-400"}`}>{side?.label}</span>

      {/* Image et texte sont deux zones flex INDÉPENDANTES et bornées (et non un
          seul conteneur défilant partagé). L'image est ainsi montrée EN ENTIER
          dans sa zone (object-contain borné par `flex-1 min-h-0`) — jamais
          coupée, jamais de scroll — tout en étant agrandie au maximum. Le texte
          garde sa propre zone défilable s'il est long. */}
      {hasImg && (
        // Un clic ailleurs sur l'image retourne la carte ; seul le bouton agrandit.
        // Le bouton se tient dans le coin du CADRE (pas collé à l'image), pour ne
        // jamais recouvrir une image devenue petite.
        <div className="relative flex w-full min-h-0 flex-1 items-center justify-center">
          <img src={side.img} alt="" className="h-full w-full rounded-xl object-contain" />
          {active && (
            <button
              onClick={(e) => { e.stopPropagation(); onZoom(side.img); }}
              aria-label="Agrandir l'image"
              title="Agrandir l'image"
              className="absolute right-1.5 top-1.5 rounded-lg bg-slate-900/55 p-1.5 text-white shadow transition hover:bg-slate-900/80"
            >
              <Maximize2 size={15} />
            </button>
          )}
        </div>
      )}

      {/* min-h-0 : sans lui, un enfant flex refuse de rétrécir sous son contenu
          et le texte déborde de la carte au lieu de défiler. */}
      {hasText && (
        <div className={`soft-scroll w-full min-h-0 flex-1 overflow-y-auto overscroll-contain ${hasImg ? "pt-3" : ""} ${accent ? "on-dark" : ""}`}>
          <div className={`flex min-h-full flex-col items-center justify-center gap-3 font-medium ${structured ? "text-left" : "text-center"} ${textSize(text.length, hasImg)}`}>
            <RichText text={text} accent={accent} />
          </div>
        </div>
      )}

      {/* Carte sans contenu (rare) : garde la hauteur pour ne pas s'effondrer. */}
      {!hasImg && !hasText && <div className="flex-1" />}
    </div>
  );
}
