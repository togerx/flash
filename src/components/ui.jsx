import { useEffect, useRef, useState } from "react";
import { WifiOff, Loader2 } from "lucide-react";
import { useOnline } from "../lib/online";

/* Logo de l'application. `size` est la HAUTEUR : le logo est au format paysage,
   l'enfermer dans un carré le réduirait de moitié. `pulse` l'anime en
   respiration pour les attentes. */
export function Logo({ size = 48, pulse, className = "" }) {
  return (
    <img
      src="/logo.png"
      alt=""
      style={{ height: size }}
      className={`w-auto shrink-0 ${pulse ? "logo-breathe" : ""} ${className}`}
    />
  );
}

/* Attente pleine zone, réutilisée partout où l'on charge des données. */
export function Loading({ label, size = 96 }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <Logo size={size} pulse />
      {label && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>}
    </div>
  );
}

/* Logo cliquable en haut à gauche : présent sur toutes les vues, il ramène
   toujours à la liste des paquets. */
export function HomeLogo({ onHome, size = 46, dark }) {
  if (!onHome) return <Logo size={size} />;
  return (
    <button
      onClick={onHome}
      aria-label="Revenir à mes paquets"
      title="Mes paquets"
      className={`-m-1 shrink-0 rounded-xl p-1 transition ${dark ? "hover:bg-white/10" : "hover:bg-slate-200/70 dark:hover:bg-white/10"}`}
    >
      <Logo size={size} />
    </button>
  );
}

/* Met en gras la portion de `text` correspondant à `query`. La recherche est
   insensible à la casse et aux accents, mais le surlignage porte sur le texte
   d'origine : on construit la forme normalisée en gardant, pour chaque
   caractère normalisé, l'index du caractère d'origine qui l'a produit. */
export function Highlight({ text = "", query }) {
  const q = (query || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!q || !text) return text;

  let norm = "";
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const nc = text[i].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const ch of nc) { norm += ch; map.push(i); }
  }

  const parts = [];
  let cursor = 0, from = 0, idx;
  while ((idx = norm.indexOf(q, from)) !== -1) {
    const startO = map[idx];
    const endO = map[idx + q.length - 1];
    if (startO > cursor) parts.push(text.slice(cursor, startO));
    parts.push(<strong key={idx} className="font-bold text-violet-700 dark:text-violet-300">{text.slice(startO, endO + 1)}</strong>);
    cursor = endO + 1;
    from = idx + q.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function Shell({ children, centered, dark, fit }) {
  const online = useOnline();
  const bg = dark ? "bg-slate-950" : "bg-slate-100 dark:bg-slate-950";
  return (
    // Fond de page plus profond que les surfaces (slate-900), pour que cartes
    // et modales restent détachées en mode sombre.
    // `fit` : la vue tient dans la hauteur RÉELLEMENT visible du navigateur
    // (`svh`), pas `100vh` (qui inclut la zone sous la barre d'adresse mobile et
    // forçait à scroller en révision). Le contenu se répartit dans cette hauteur.
    <div className={`${bg} ${fit ? "flex h-[100svh] flex-col" : "min-h-screen"}`}>
      {/* Les révisions et les modifications de texte continuent hors ligne : le
          bandeau informe sans alarmer, seules les images demandent le réseau. */}
      {!online && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-100 dark:bg-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-100">
          <WifiOff size={14} /> Hors ligne — vos modifications seront synchronisées au retour
        </div>
      )}
      <div className={`mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6 ${
        fit ? "min-h-0 flex-1 py-3 sm:py-6" : "min-h-screen py-6"
      } ${centered ? "items-center justify-center" : ""}`}>
        {children}
      </div>
    </div>
  );
}

export function Header({ title, subtitle, left, right, onHome, home }) {
  return (
    <div className="flex items-center gap-3">
      {home && <HomeLogo onHome={onHome} />}
      {left}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function IconBtn({ children, label, onClick, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-40 ${
        danger ? "text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400" : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

export function RoundBtn({ children, onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* Pile des fermetures Échap. Seule la modale du dessus se ferme, ce qui gère
   correctement les modales imbriquées (une confirmation par-dessus une autre). */
const escStack = [];
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && escStack.length) {
      e.stopPropagation();
      escStack[escStack.length - 1]?.();
    }
  }, true);
}

/* Enregistre une fermeture Échap tant que le composant est monté. */
export function useEscapeClose(onClose) {
  useEffect(() => {
    if (!onClose) return undefined;
    const fn = () => onClose();
    escStack.push(fn);
    return () => { const i = escStack.indexOf(fn); if (i >= 0) escStack.splice(i, 1); };
  }, [onClose]);
}

/* Pile Entrée = action principale. Entrée déclenche le bouton `data-primary` de
   la modale du dessus, sauf quand la frappe est destinée à un champ (texte,
   liste déroulante) : dans un champ, Entrée garde son rôle propre. */
const enterStack = [];
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || !enterStack.length) return;
    const el = document.activeElement;
    if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
    e.preventDefault();
    enterStack[enterStack.length - 1]?.();
  }, true);
}

/* Enregistre l'action Entrée du composant tant qu'il est monté. La plus
   récemment montée (modale du dessus) prime. */
export function useEnterAction(handler) {
  useEffect(() => {
    if (!handler) return undefined;
    enterStack.push(handler);
    return () => { const i = enterStack.indexOf(handler); if (i >= 0) enterStack.splice(i, 1); };
  }, [handler]);
}

/* --- « Retour » par balayage horizontal à deux doigts (trackpad) -----------
   Écrans et modales enregistrent leur action de retour dans cette pile (le plus
   récemment monté prime : une modale par-dessus un écran se ferme d'abord). Un
   balayage horizontal franc appelle le sommet de la pile. Un seul écouteur, posé
   une fois. */
const backStack = [];

/* Largeur de la bande, au bord GAUCHE de l'écran, d'où part le geste tactile de
   retour (équivalent du balayage trackpad à deux doigts). Partagée avec SwipeCard
   pour qu'un balayage démarré dans cette bande soit un « retour », et non un
   balayage de carte. */
export const EDGE_ZONE = 24;

export function useBack(onBack) {
  useEffect(() => {
    if (!onBack) return undefined;
    const fn = () => onBack();
    backStack.push(fn);
    return () => { const i = backStack.indexOf(fn); if (i >= 0) backStack.splice(i, 1); };
  }, [onBack]);
}

if (typeof window !== "undefined") {
  const NOUVEAU_GESTE_MS = 300;   // au-delà, on considère un nouveau geste
  const SEUIL = 110;              // distance horizontale cumulée pour déclencher
  let accX = 0, accY = 0, dernier = 0, armé = true;

  // Un vrai défilement horizontal (tableau large, bloc de code) ne doit pas être
  // volé : si un conteneur sous le curseur peut encore défiler vers la gauche, on
  // laisse le navigateur faire.
  const peutDefilerGauche = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.scrollLeft > 0 && n.scrollWidth > n.clientWidth) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
    }
    return false;
  };

  window.addEventListener("wheel", (e) => {
    const now = Date.now();
    if (now - dernier > NOUVEAU_GESTE_MS) { accX = 0; accY = 0; armé = true; }
    dernier = now;
    accX += e.deltaX;
    accY += Math.abs(e.deltaY);

    if (!armé || !backStack.length) return;
    // Balayage franchement horizontal vers la DROITE (les doigts vont à droite,
    // le contenu recule → « précédent »), au-delà du seuil, sans défilement
    // horizontal légitime en dessous. accX négatif = doigts vers la droite
    // (défilement naturel). armé : un seul « retour » par geste.
    if (accX <= -SEUIL && accY < 50 && !peutDefilerGauche(e.target)) {
      armé = false;
      backStack[backStack.length - 1]?.();
    }
  }, { passive: true });

  /* Équivalent tactile : un balayage vers la droite qui PART du bord gauche de
     l'écran (comme le « retour » d'iOS). Démarré dans la bande de bord, il ne se
     confond pas avec un balayage de carte, qui part de la carte (SwipeCard ignore
     les gestes nés dans cette bande). */
  const SEUIL_BORD = 65;
  let bord = null;
  window.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { bord = null; return; }
    const t = e.touches[0];
    bord = t.clientX <= EDGE_ZONE ? { x0: t.clientX, y0: t.clientY, fait: false } : null;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (!bord || bord.fait || !backStack.length) return;
    const t = e.touches[0];
    if (t.clientX - bord.x0 > SEUIL_BORD && Math.abs(t.clientY - bord.y0) < 45) {
      bord.fait = true;
      backStack[backStack.length - 1]?.();
    }
  }, { passive: true });
  const finBord = () => { bord = null; };
  window.addEventListener("touchend", finBord, { passive: true });
  window.addEventListener("touchcancel", finBord, { passive: true });
}

/* `persistent` : un clic sur le fond ne ferme PAS la fenêtre. Réservé aux
   formulaires où une fermeture accidentelle ferait perdre une saisie (ajout de
   compte). Échap et les boutons ferment toujours. */
export function Modal({ children, onClose, wide, persistent }) {
  useEscapeClose(onClose);
  useBack(onClose);   // balayage à deux doigts = fermer (comme Échap)
  const content = useRef(null);
  useEnterAction(() => content.current?.querySelector("[data-primary]:not([disabled])")?.click());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-4" onClick={persistent ? undefined : onClose}>
      {/* Colonne bornée en hauteur : l'en-tête et le pied restent visibles, seul
          le corps défile (voir la classe `modal-body` posée par les contenus). */}
      <div
        ref={content}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden ${wide ? "max-w-2xl" : "max-w-md"} rounded-3xl bg-white dark:bg-slate-900 shadow-2xl sm:max-h-[85dvh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/* `onConfirm` peut être asynchrone : la fenêtre reste alors ouverte, le bouton
   affiche une roue et rien ne se referme tant que l'opération n'a pas abouti.
   Supprimer un paquet et ses images prend plusieurs secondes ; disparaître
   aussitôt laisserait croire à un échec ou à une action terminée. */
export function ConfirmModal({ title, body, confirmLabel, busyLabel, onCancel, onConfirm, children, error, disabled }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      console.error(e);
      setBusy(false);      // l'échec rend la main : la fenêtre reste utilisable
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onCancel}>
      <div className="p-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1.5 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">{body}</p>
        {children}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Annuler
          </button>
          <button
            onClick={run}
            disabled={busy || disabled}
            data-primary
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:opacity-70"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? (busyLabel || "Suppression…") : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
