import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { checkForUpdate } from "../lib/appUpdate";

// Libellé affiché après une recherche (idle = rien).
const STATES = {
  idle: "",
  checking: "Recherche…",
  "up-to-date": "À jour",
  available: "Disponible",
  offline: "Hors connexion",
  unavailable: "Indisponible",
  failed: "Échec",
};

/* Section « Application » de « Mon compte » : cherche une nouvelle version ;
   si elle existe, le bandeau UpdatePrompt propose de l'installer. Affiche aussi
   la date du build, pour savoir quelle version tourne sur un appareil. */
export default function AppUpdateRow() {
  const [state, setState] = useState("idle");
  const running = useRef(false);

  const check = async () => {
    if (running.current) return;
    running.current = true;
    setState("checking");
    setState(await checkForUpdate(Date.now()));
    running.current = false;
  };

  return (
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Application</span>
      <button
        onClick={check}
        disabled={state === "checking"}
        className="mt-1.5 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium text-slate-800 ring-1 ring-slate-200 transition hover:ring-slate-300 disabled:opacity-70 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:ring-slate-600"
      >
        <RefreshCw size={16} className={`shrink-0 ${state === "checking" ? "animate-spin" : ""}`} aria-hidden="true" />
        <span className="flex-1 text-left">Rechercher une mise à jour</span>
        {STATES[state] && (
          <span className={`text-sm ${state === "available" ? "font-semibold text-violet-700 dark:text-violet-300" : state === "failed" ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
            {STATES[state]}
          </span>
        )}
      </button>
      {/* Résultat annoncé aux lecteurs d'écran. */}
      <span role="status" className="sr-only">{STATES[state]}</span>
      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Version {__APP_BUILD__}</p>
    </div>
  );
}
