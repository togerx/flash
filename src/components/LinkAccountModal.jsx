import { useState } from "react";
import { Mail, Lock, X, Loader2, ShieldCheck } from "lucide-react";
import { Modal } from "./ui";
import { authErrorMessage } from "../lib/auth";

/* Icône Google réduite. */
function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

const field = "w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

/*
 * Attache un compte à une session anonyme, de deux façons :
 *
 *   - « Créer un compte »        : nouvel e-mail (ou Google) → LIAISON. L'uid est
 *     conservé, aucune donnée n'est déplacée. Chemin sûr par défaut.
 *   - « J'ai déjà un compte »    : on se CONNECTE au compte existant et les
 *     paquets de cet appareil y sont FUSIONNÉS (copiés). Utile pour regrouper
 *     un appareil anonyme dans un compte déjà utilisé ailleurs.
 *
 * Google gère les deux cas d'un seul bouton (liaison, ou connexion + fusion si
 * le compte existe déjà).
 */
export default function LinkAccountModal({ onCreateEmail, onSignInEmail, onGoogle, onReset, onClose }) {
  const [mode, setMode] = useState("create");   // create | signin
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const run = async (kind, fn) => {
    setErr(""); setResetSent(false); setBusy(kind);
    try { await fn(); onClose(); }
    catch (e) { setErr(authErrorMessage(e.code)); setBusy(null); }
  };

  // Mot de passe oublié : envoie le lien de réinitialisation Firebase. Ne ferme
  // pas la fenêtre (l'utilisateur revient saisir son nouveau mot de passe).
  const forgot = async () => {
    if (!email.trim()) { setErr("Saisissez d'abord votre adresse e-mail."); return; }
    setErr(""); setBusy("reset");
    try { await onReset(email); setResetSent(true); }
    catch (e) { setErr(authErrorMessage(e.code)); }
    finally { setBusy(null); }
  };

  const canSubmit = email.trim() && password.length >= 6;
  const submitEmail = () => {
    if (!canSubmit) return;
    if (mode === "create") return run("email", () => onCreateEmail(email, password));
    return run("email", () => onSignInEmail(email, password));
  };

  return (
    <Modal onClose={onClose} persistent>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <ShieldCheck size={18} /> Ajouter un compte
        </h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      <div className="modal-body soft-scroll space-y-3 p-5">
        {/* Bascule créer / se connecter */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {[["create", "Créer un compte"], ["signin", "J'ai déjà un compte"]].map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setErr(""); }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === m
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          {mode === "create"
            ? "Créez un compte pour retrouver vos paquets sur tous vos appareils. Vos données actuelles sont conservées."
            : "Connectez-vous à votre compte existant : les paquets de cet appareil y seront ajoutés (fusion)."}
        </p>

        <button
          onClick={() => run("google", onGoogle)}
          disabled={!!busy}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
        >
          {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
          Continuer avec Google
        </button>

        <div className="flex items-center gap-3 py-0.5">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs text-slate-400 dark:text-slate-500">ou par e-mail</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" className={field} />
        </div>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEmail()} placeholder={mode === "create" ? "Mot de passe (6 caractères min.)" : "Mot de passe"} className={field} />
        </div>

        {/* Mot de passe oublié : seulement pertinent quand on se connecte à un
            compte existant (en création, il n'y a pas encore de mot de passe). */}
        {mode === "signin" && (
          <div className="text-right">
            <button
              type="button"
              onClick={forgot}
              disabled={busy === "reset"}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-800 disabled:opacity-50 dark:text-violet-300 dark:hover:text-violet-200"
            >
              {busy === "reset" && <Loader2 size={14} className="animate-spin" />}
              Mot de passe oublié ?
            </button>
          </div>
        )}

        {resetSent && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Lien de réinitialisation envoyé à {email.trim()}. Ouvrez-le, choisissez un nouveau mot de passe, puis revenez vous connecter.
          </p>
        )}
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <button onClick={onClose} className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Plus tard</button>
        <button
          onClick={submitEmail}
          disabled={!canSubmit || !!busy}
          data-primary
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
        >
          {busy === "email" && <Loader2 size={16} className="animate-spin" />}
          {mode === "create" ? "Créer le compte" : "Se connecter et fusionner"}
        </button>
      </div>
    </Modal>
  );
}
