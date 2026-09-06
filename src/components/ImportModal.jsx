import { useRef, useState } from "react";
import { Upload, X, FileText, Loader2, WifiOff } from "lucide-react";
import { Modal } from "./ui";
import { detectSeparator, parseCards, htmlToText, deckNameFromFile } from "../lib/import";
import { useOnline } from "../lib/online";

const SEPS = [
  { v: "auto", label: "Auto" },
  { v: "\t", label: "Tabulation" },
  { v: ";", label: "Point-virgule" },
  { v: ",", label: "Virgule" },
];

/* Import d'un paquet depuis un export texte d'Anki ou de Quizlet. */
export default function ImportModal({ onClose, onImport }) {
  const fileRef = useRef(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sep, setSep] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [apkg, setApkg] = useState(null);     // { cards, stats } d'un paquet Anki
  const [err, setErr] = useState("");
  const [step, setStep] = useState("");       // avancement (lecture, images…)
  const [over, setOver] = useState(false);    // fichier survolant la zone de dépôt

  const online = useOnline();
  const used = sep === "auto" ? detectSeparator(text) : sep;
  const cards = apkg ? apkg.cards : text.trim() ? parseCards(text, used) : [];
  // Storage n'a pas de file d'attente : un paquet illustré ne peut pas s'importer
  // hors ligne. Un paquet purement textuel, si.
  const nbImages = apkg?.stats.images || 0;
  const blocked = nbImages > 0 && !online;

  /* Un texte illisible trahit un fichier binaire ouvert par erreur : sans
     l'attribut accept (voir plus bas), tout fichier peut arriver ici. */
  const semblesBinaire = (s) => {
    const debut = s.slice(0, 4000);
    return /\u0000/.test(debut) || (debut.match(/\uFFFD/g) || []).length > 8;
  };

  const handleFile = async (file) => {
    if (!file) return;
    setErr(""); setApkg(null); setText("");
    if (!name) setName(deckNameFromFile(file.name));

    // .apkg : ZIP + base SQLite, lus par un module chargé à la demande.
    if (file.name.toLowerCase().endsWith(".apkg")) {
      setStep("Lecture du paquet Anki…");
      try {
        const { readApkg } = await import("../lib/anki");
        setApkg(await readApkg(file, htmlToText));
      } catch (e2) {
        console.error(e2);
        setErr(e2.message || "Fichier Anki illisible.");
      } finally { setStep(""); }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const contenu = String(reader.result || "");
      if (semblesBinaire(contenu)) {
        setErr(`« ${file.name} » n'est ni un paquet Anki (.apkg) ni un fichier texte. Depuis Anki : Fichier → Exporter.`);
        return;
      }
      setText(contenu);
    };
    reader.readAsText(file, "utf-8");
  };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    handleFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await onImport(name.trim() || "Paquet importé", cards, (done, total) =>
        setStep(total ? `Envoi des images ${done}/${total}…` : ""));
      if (res?.failedImages) alert(`${res.failedImages} image(s) n'ont pas pu être importées ; les cartes le sont.`);
    } catch (e) {
      console.error(e);
      setErr("Import impossible. Vérifiez la connexion et réessayez.");
      setBusy(false); setStep("");
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Importer un paquet</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer"><X size={20} /></button>
      </div>

      {/* Le dépôt est accepté partout dans la fenêtre, pas seulement sur le
          bouton : viser une cible précise avec un fichier au bout du curseur
          est inutilement exigeant. */}
      <div
        className="modal-body soft-scroll space-y-4 p-5"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop={onDrop}
      >
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 text-sm text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
          <p className="font-medium text-slate-800 dark:text-slate-200">Depuis Anki ou Quizlet</p>
          <p className="mt-1">
            Anki : le fichier <span className="text-slate-800 dark:text-slate-200">.apkg</span> directement (images comprises), ou un export en notes texte.<br />
            Quizlet : <span className="text-slate-800 dark:text-slate-200">⋯ → Exporter</span>, séparateur Tabulation.
          </p>
        </div>

        <div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!step}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-6 text-sm font-medium transition disabled:opacity-50 ${
              over
                ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                : "border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-400"
            }`}
          >
            {step ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
            <span>{step ? "Traitement en cours…" : over ? "Déposez le fichier ici" : "Glissez un fichier ici, ou cliquez pour le choisir"}</span>
            {!step && !over && (
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">.apkg, .txt, .csv</span>
            )}
          </button>
          {/* Pas d'attribut accept : iOS filtre par type système et « .apkg »
              n'en a aucun, ce qui grise le fichier dans le sélecteur de l'iPad.
              Le contrôle se fait donc à la lecture (voir semblesBinaire). */}
          <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
        </div>

        {/* L'animation est une transformation CSS : elle continue de tourner même
            pendant le décodage, qui fige le fil principal quelques secondes. */}
        {step && (
          <p className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
            <Loader2 size={16} className="animate-spin" /> {step}
          </p>
        )}

        {blocked && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-500/30">
            <WifiOff size={16} className="mt-0.5 shrink-0" />
            <span>
              Vous êtes hors ligne. Ce paquet contient {nbImages} image{nbImages > 1 ? "s" : ""},
              qui ne peuvent pas être envoyées sans connexion : l'import attendra votre retour en ligne.
            </span>
          </p>
        )}
        {err && <p className="rounded-xl bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300 ring-1 ring-red-100">{err}</p>}

        {apkg && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
            Paquet Anki lu : {apkg.cards.length} carte{apkg.cards.length > 1 ? "s" : ""}
            {apkg.stats.images > 0 && `, ${apkg.stats.images} image${apkg.stats.images > 1 ? "s" : ""}`}.
            {apkg.stats.cloze > 0 && ` ${apkg.stats.cloze} carte${apkg.stats.cloze > 1 ? "s" : ""} à trous ignorée${apkg.stats.cloze > 1 ? "s" : ""} (sans équivalent ici).`}
          </div>
        )}

        <div className={apkg ? "hidden" : ""}>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">…ou collez le contenu</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"Recto\tVerso\nRecto\tVerso"}
            className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus-visible:border-violet-500"
          />
        </div>

        <div className={`flex flex-wrap items-center gap-2 ${apkg ? "hidden" : ""}`}>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Séparateur</span>
          {SEPS.map((s) => (
            <button
              key={s.v}
              onClick={() => setSep(s.v)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                sep === s.v ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Nom du paquet</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Paquet importé"
            className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus-visible:border-violet-500"
          />
        </div>

        {/* Aperçu : voir ce qui sera créé avant d'écrire quoi que ce soit. */}
        {(text.trim() || apkg) && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {cards.length ? `${cards.length} carte${cards.length > 1 ? "s" : ""} détectée${cards.length > 1 ? "s" : ""}` : "Aucune carte détectée"}
            </div>
            {cards.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {cards.slice(0, 3).map((c, i) => (
                  <div key={i} className="flex gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{c.recto || "—"}</span>
                    <span className="text-slate-300 dark:text-slate-600">→</span>
                    <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">{c.verso || "—"}</span>
                  </div>
                ))}
                {cards.length > 3 && <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">…et {cards.length - 3} autres</p>}
              </div>
            ) : (
              <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Essayez un autre séparateur.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
        <button onClick={onClose} className="flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 sm:flex-none sm:py-2">Annuler</button>
        <button
          onClick={run}
          disabled={!cards.length || busy || blocked}
          data-primary
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40 sm:flex-none sm:py-2"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {busy ? "Import en cours…" : `Importer ${cards.length || ""}`}
        </button>
      </div>
    </Modal>
  );
}
