import { useEffect, useState } from "react";
import { RefreshCw, X, WifiOff } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  trackRegistration, watchForegroundUpdates, isReviewing, onReviewingChange,
  OFFLINE_READY_TOAST_MS,
} from "../lib/appUpdate";

/*
 * Service worker (PWA) : annonce que l'app fonctionne hors connexion, et
 * propose les mises à jour (repris de Pilot Maths Trainer).
 *
 * Jamais affiché pendant une révision ; la mise à jour n'est appliquée qu'à la
 * demande de l'utilisateur (« Mettre à jour » recharge l'app sur la nouvelle
 * version). Une nouvelle version est aussi recherchée au retour dans l'app et
 * depuis « Mon compte » (lib/appUpdate.js).
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => trackRegistration(registration, () => setNeedRefresh(true), Date.now()),
  });
  const [reviewing, setReviewing] = useState(isReviewing);
  const [updating, setUpdating] = useState(false);

  useEffect(() => watchForegroundUpdates(), []);
  useEffect(() => onReviewingChange(setReviewing), []);

  useEffect(() => {
    if (!offlineReady) return undefined;
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_READY_TOAST_MS);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (reviewing || (!needRefresh && !offlineReady)) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4 text-white shadow-lg ring-1 ring-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-200">
        {!needRefresh && <WifiOff size={18} className="shrink-0 opacity-70" aria-hidden="true" />}
        <p className="min-w-0 flex-1 text-sm">
          {needRefresh ? "Une nouvelle version est disponible." : "L'app est prête à fonctionner hors connexion."}
        </p>
        {needRefresh && (
          <button
            onClick={() => { setUpdating(true); updateServiceWorker(true); }}
            disabled={updating}
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={updating ? "animate-spin" : ""} aria-hidden="true" /> Mettre à jour
          </button>
        )}
        <button
          onClick={() => { setNeedRefresh(false); setOfflineReady(false); }}
          aria-label="Fermer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-current transition hover:bg-white/10 dark:hover:bg-black/10"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
