/*
 * Rendu du texte d'une carte : tableaux, listes à puces, paragraphes.
 *
 * Le texte reste stocké en clair — donc modifiable dans l'éditeur — et seul
 * l'affichage l'enrichit. Sont reconnus :
 *   | a | b |   ligne de tableau      (suivie de |---| pour une ligne d'en-tête)
 *   a · b       ligne de tableau, ancien format des imports précédents
 *   - item      puce                  (• accepté aussi)
 */

const isSep = (l) => /^\s*\|[-\s|]*\|\s*$/.test(l);
const isPipeRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isDotRow = (l) => / · /.test(l);
const isBullet = (l) => /^\s*[-•]\s+/.test(l);
const isNumbered = (l) => /^\s*\d+[.)]\s+/.test(l);

const cellsOf = (l) => {
  const t = l.trim();
  return t.startsWith("|")
    ? t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((s) => s.trim())
    : t.split(" · ").map((s) => s.trim());
};

/* Une puce collée à la fin d'un paragraphe (« Signification :• Turbulences »)
   passe à la ligne. Cela rattrape les cartes importées avant que la conversion
   n'insère elle-même ce saut. Seul « • » est traité : couper sur « - » casserait
   les tirets d'incise et les intervalles (« 10 - 15 kt »). */
const normalize = (text) => text.replace(/([^\n\s])[ \t]*•[ \t]+/g, "$1\n• ");

/* Découpe le texte en blocs homogènes : tableau, liste, ou paragraphe. */
function parseBlocks(text) {
  const lines = normalize(text).split("\n");
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    if (isPipeRow(line) || isDotRow(line)) {
      const rows = [];
      let header = false;
      while (i < lines.length && (isPipeRow(lines[i]) || isDotRow(lines[i]) || isSep(lines[i]))) {
        if (isSep(lines[i])) { header = rows.length === 1; i++; continue; }
        rows.push(cellsOf(lines[i]));
        i++;
      }
      i--;
      // Une ligne isolée n'est pas un tableau : on la laisse en paragraphe.
      if (rows.length > 1 || rows[0]?.length > 1) blocks.push({ type: "table", rows, header });
      else blocks.push({ type: "p", text: rows[0].join(" ") });
      continue;
    }

    if (isBullet(line)) {
      const items = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•]\s+/, "").trim());
        i++;
      }
      i--;
      blocks.push({ type: "ul", items });
      continue;
    }

    if (isNumbered(line)) {
      // Le numéro écrit est conservé plutôt que renuméroté : une liste qui
      // commence à 3 reste fidèle à ce que l'auteur a saisi.
      const items = [];
      while (i < lines.length && isNumbered(lines[i])) {
        const m = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/);
        items.push({ num: m[1], text: m[2].trim() });
        i++;
      }
      i--;
      blocks.push({ type: "ol", items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isBullet(lines[i]) && !isNumbered(lines[i]) && !isPipeRow(lines[i]) && !isDotRow(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    i--;
    blocks.push({ type: "p", text: para.join("\n") });
  }
  return blocks;
}

/* `structured` indique à l'appelant si le contenu mérite un alignement à gauche. */
export const hasStructure = (text) =>
  !!text && normalize(text).split("\n").some((l) => isBullet(l) || isNumbered(l) || isPipeRow(l) || isDotRow(l));

/* Version sur une ligne, sans balisage, pour les aperçus de la liste des cartes. */
export const plainPreview = (text) => (text || "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/^\s*\|[-\s|]*\|\s*$/gm, "")
  .replace(/\|/g, " ")
  .replace(/^\s*[-•]\s+/gm, "")
  .replace(/^\s*\d+[.)]\s+/gm, "")
  .replace(/\s+/g, " ")
  .trim();

/* Contenu d'une cellule : les <br> posés à la saisie redeviennent des lignes,
   et celles marquées « - » ou « 1. » sont rendues comme une liste. */
function Cell({ text, accent }) {
  const lignes = String(text).split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
  if (lignes.length <= 1 && !isBullet(text) && !isNumbered(text)) return text;

  const puce = accent ? "text-violet-200" : "text-slate-400 dark:text-slate-500";
  return (
    <span className="block space-y-0.5">
      {lignes.map((l, i) => {
        const b = l.match(/^\s*[-•]\s+(.*)$/);
        if (b) return (
          <span key={i} className="flex gap-1.5">
            <span className={puce}>•</span><span className="min-w-0 flex-1">{b[1]}</span>
          </span>
        );
        const n = l.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (n) return (
          <span key={i} className="flex gap-1.5">
            <span className={`tabular-nums ${puce}`}>{n[1]}.</span><span className="min-w-0 flex-1">{n[2]}</span>
          </span>
        );
        return <span key={i} className="block">{l}</span>;
      })}
    </span>
  );
}

export default function RichText({ text, accent }) {
  if (!text) return null;
  const blocks = parseBlocks(text);
  const line = accent ? "border-white/30" : "border-slate-200 dark:border-slate-700";
  const head = accent ? "bg-white/15" : "bg-slate-100 dark:bg-slate-800";

  return (
    <div className="w-full space-y-2">
      {blocks.map((b, i) => {
        if (b.type === "table") {
          return (
            <div key={i} className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri} className={b.header && ri === 0 ? `${head} font-semibold` : ""}>
                      {r.map((c, ci) => (
                        <td key={ci} className={`border ${line} px-2 py-1 align-top`}>
                          <Cell text={c} accent={accent} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="w-full space-y-1 text-left">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex gap-2">
                  <span className={accent ? "text-violet-200" : "text-slate-400 dark:text-slate-500"}>•</span>
                  <span className="min-w-0 flex-1">{it}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="w-full space-y-1 text-left">
              {b.items.map((it, ii) => (
                <li key={ii} className="flex gap-2">
                  <span className={`tabular-nums ${accent ? "text-violet-200" : "text-slate-400 dark:text-slate-500"}`}>{it.num}.</span>
                  <span className="min-w-0 flex-1">{it.text}</span>
                </li>
              ))}
            </ol>
          );
        }
        return <p key={i} className="whitespace-pre-line">{b.text}</p>;
      })}
    </div>
  );
}
