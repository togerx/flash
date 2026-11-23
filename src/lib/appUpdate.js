/*
 * Recherche d'une nouvelle version de l'app (repris de Pilot Maths Trainer).
 *
 * Le navigateur ne vérifie le service worker qu'à une ouverture complète : une
 * app installée qui revient de l'arrière-plan ne verrait donc jamais de mise à
 * jour. La version trouvée s'installe EN ATTENTE (jamais d'application forcée)
 * et le bandeau `UpdatePrompt` la propose.
 *
 * Résultats possibles d'une recherche demandée :
 *   "up-to-date" · "available" · "offline" · "unavailable" (pas de service
 *   worker : développement, navigateur ancien) · "failed"
 */

// Vérification au retour dans l'app : au plus une fois par quart d'heure.
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;
// Installation d'une version trouvée : abandon au-delà d'une minute.
export const UPDATE_INSTALL_TIMEOUT_MS = 60_000;
// Durée du message « prête à fonctionner hors connexion ».
export const OFFLINE_READY_TOAST_MS = 4_000;

let registration;
let reopenPrompt;
let lastCheckAt = 0;

const isOffline = () => navigator.onLine === false;

/* Service worker enregistré (UpdatePrompt) ; `showPrompt` rouvre le bandeau
   s'il a été fermé. */
export function trackRegistration(next, showPrompt, now) {
  registration = next;
  reopenPrompt = showPrompt;
  // Le navigateur vient de vérifier en enregistrant le service worker.
  lastCheckAt = now;
}

/* Attend la fin de l'installation : vrai si elle réussit, faux si elle échoue
   ou dépasse le délai. */
function waitForInstall(worker) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), UPDATE_INSTALL_TIMEOUT_MS);
    function finish(installed) {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onChange);
      resolve(installed);
    }
    function onChange() {
      if (worker.state === "installed" || worker.state === "activated") finish(true);
      else if (worker.state === "redundant") finish(false);
    }
    worker.addEventListener("statechange", onChange);
    onChange();
  });
}

/* Recherche demandée par l'utilisateur (bouton « Rechercher une mise à jour ») :
   le résultat s'affiche, et le bandeau rouvre si une version attend. */
export async function checkForUpdate(now) {
  if (!registration) return "unavailable";
  const found = () => { reopenPrompt?.(); return "available"; };
  if (registration.waiting) return found();
  if (isOffline()) return "offline";
  try {
    await registration.update();
  } catch {
    return isOffline() ? "offline" : "failed";
  }
  lastCheckAt = now;
  const { installing } = registration;
  if (installing && !(await waitForInstall(installing))) return "failed";
  return registration.waiting ? found() : "up-to-date";
}

/* Vérification au retour dans l'app, au plus une fois par intervalle.
   Silencieuse : une nouvelle version fait apparaître le bandeau d'elle-même ;
   un bandeau déjà fermé par l'utilisateur n'est pas rouvert. */
export function checkInBackground(now) {
  if (!registration || registration.waiting || isOffline()) return;
  if (now - lastCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
  lastCheckAt = now;
  registration.update().catch(() => undefined);
}

/* Lance la vérification à chaque retour dans l'app ; renvoie la fonction d'arrêt. */
export function watchForegroundUpdates() {
  const onChange = () => {
    if (document.visibilityState === "visible") checkInBackground(Date.now());
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/* --- Pas de bandeau pendant une révision -----------------------------------
   Une séance ne doit pas être interrompue : les écrans de révision se
   signalent (compteur, car une révision peut en monter une autre) et le
   bandeau attend qu'ils soient tous fermés. */

let reviewsOpen = 0;
const reviewListeners = new Set();

export const isReviewing = () => reviewsOpen > 0;

export function onReviewingChange(cb) {
  reviewListeners.add(cb);
  return () => reviewListeners.delete(cb);
}

/* À appeler à l'ouverture d'un écran de révision ; renvoie la fonction de
   fermeture (cleanup d'effet React). */
export function enterReview() {
  reviewsOpen += 1;
  reviewListeners.forEach((cb) => cb(true));
  return () => {
    reviewsOpen = Math.max(0, reviewsOpen - 1);
    reviewListeners.forEach((cb) => cb(reviewsOpen > 0));
  };
}
