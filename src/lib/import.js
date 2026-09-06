/*
 * Lecture des exports texte d'Anki et de Quizlet, et conversion du HTML des
 * champs Anki en texte brut.
 *
 * Les exports texte des deux applications ont la même forme : une carte par
 * ligne, les deux faces séparées par une tabulation. Anki ajoute des lignes
 * d'en-tête « #separator:tab », parfois une 3e colonne de tags, et laisse du
 * HTML dans les champs si la case correspondante est cochée.
 */

const NBSP = String.fromCharCode(160);

/* Lignes d'échantillon pour la détection (hors lignes vides et de config Anki). */
const sampleLines = (text) => text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).slice(0, 20);

/* Séparateurs « collage » : un délimiteur qui coupe une ligne en DEUX faces à sa
   PREMIÈRE occurrence (le reste, deux-points ou tirets compris, va au verso).
   Les variantes avec/sans espaces autour se rejoignent une fois les faces
   nettoyées ; on garde un motif par famille, du plus sûr (espaces requis, donc
   peu de faux positifs) au plus risqué (nu, qui pourrait couper « arc-en-ciel »
   ou « 12:30 »). Ces motifs sont partagés par la détection ET l'analyse. */
const LINE_SEPARATORS = [
  { id: "multispace", re: / {3,}/ },        // 3 espaces consécutifs ou plus
  { id: "colon-sp",   re: / +:\s*|:\s+/ },  // " : ", " :", ": "
  { id: "dash-sp",    re: / +-\s*|-\s+/ },  // " - ", " -", "- "
  { id: "colon",      re: /:/ },            // ":" nu
  { id: "dash",       re: /-/ },            // "-" nu
];
const lineSepById = (id) => LINE_SEPARATORS.find((s) => s.id === id);

/* Coupe une ligne à la première occurrence du délimiteur → [avant, après]. */
function splitFirst(line, re) {
  const m = re.exec(line);
  return m ? [line.slice(0, m.index), line.slice(m.index + m[0].length)] : null;
}

/* Devine le séparateur. La tabulation prime (défaut d'Anki/Quizlet, analysée en
   CSV : guillemets, colonnes de tags). Sinon, on essaie dans l'ordre de sûreté :
   séparateurs « collage » francs (espaces larges, deux-points espacés), puis CSV
   classiques (; ,), enfin les motifs risqués (tiret, deux-points nus). Un motif
   n'est retenu que s'il découpe la nette majorité des lignes : un tiret présent
   ici ou là n'est pas un séparateur de colonnes. */
export function detectSeparator(text) {
  const lines = sampleLines(text);
  if (!lines.length) return "\t";
  const count = (s) => lines.filter((l) => l.includes(s)).length;
  const requis = Math.max(1, Math.ceil(lines.length * 0.6));
  const coupe = (id) => {
    const re = lineSepById(id).re;
    return lines.filter((l) => { const p = splitFirst(l, re); return p && p[0].trim() && p[1].trim(); }).length;
  };

  if (count("\t")) return "\t";
  if (coupe("multispace") >= requis) return "multispace";
  if (coupe("colon-sp") >= requis) return "colon-sp";
  if (count(";") >= requis && count(";") >= count(",")) return ";";
  if (count(",") >= requis) return ",";
  if (coupe("dash-sp") >= requis) return "dash-sp";
  if (coupe("colon") >= requis) return "colon";
  if (coupe("dash") >= requis) return "dash";

  // Repli : ancien comportement permissif.
  if (count(";") >= count(",")) return count(";") ? ";" : ",";
  return ",";
}

/* HTML -> texte brut. Les paquets Anki usent beaucoup des tableaux et des
   listes : les aplatir bêtement rendrait les cartes illisibles, donc les
   cellules sont séparées par « · », les lignes et les puces par un retour.
   DOMParser produit un document inerte : ni script exécuté, ni ressource
   chargée, contrairement à innerHTML sur un élément détaché. */
export function htmlToText(s) {
  if (!s) return "";
  if (!/[<&]/.test(s)) return s.trim();

  const doc = new DOMParser().parseFromString(s.replace(/\[sound:[^\]]*\]/gi, ""), "text/html");

  const walk = (node) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "img") return "";

    // Une ligne de tableau devient « | cellule | cellule | », et une ligne
    // d'en-tête est suivie de « |---| » : RichText s'en sert pour reconstruire
    // un vrai tableau à l'affichage, sans que le texte cesse d'être éditable.
    if (tag === "tr") {
      const cells = [...node.children]
        .filter((c) => /^(td|th)$/i.test(c.tagName))
        .map((c) => walk(c).replace(/\s*\n\s*/g, " ").trim().replace(/\|/g, "/"));
      if (!cells.length) return "";
      const header = [...node.children].some((c) => c.tagName.toLowerCase() === "th");
      return `| ${cells.join(" | ")} |\n${header ? "|---|\n" : ""}`;
    }
    // Une liste ordonnée est numérotée à la source : ses éléments sont traités
    // ici plutôt que par la branche `li`, qui produirait des puces.
    if (tag === "ol") {
      const items = [...node.children].filter((c) => c.tagName.toLowerCase() === "li");
      if (items.length) {
        const lignes = items.map((li, i) =>
          `${i + 1}. ${[...li.childNodes].map(walk).join("").trim()}`);
        return `\n${lignes.join("\n")}\n`;
      }
    }
    const inner = [...node.childNodes].map(walk).join("");
    if (tag === "td" || tag === "th") return inner;
    if (tag === "li") return `- ${inner.trim()}\n`;
    // Saut AVANT une liste ou un tableau : sans lui, « Texte :<ul> » collerait
    // la première puce à la fin du paragraphe qui la précède.
    if (["ul", "ol", "table"].includes(tag)) return `\n${inner}\n`;
    if (["div", "p", "tbody", "thead", "h1", "h2", "h3"].includes(tag)) return `${inner}\n`;
    return inner;
  };

  return walk(doc.body)
    .split(NBSP).join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* Nettoie une face : espaces de bord et de fin de ligne, et — sur une face d'UNE
   seule ligne — une puce ou un numéro en tête, artefact d'une liste collée
   (« 1. mot », « - mot »). Les vraies listes multi-lignes sont un contenu voulu,
   rendu comme tel : on n'y touche pas. */
function cleanField(s) {
  let t = (s || "").replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, "").trim();
  if (t && !t.includes("\n")) t = t.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim();
  return t;
}

/* Analyse CSV : gère les guillemets, donc les champs contenant le séparateur ou
   des retours à la ligne. `sep` est un caractère unique (tabulation, ; ou ,). */
function parseDelimited(text, sep) {
  const rows = [];
  let field = "", row = [], quoted = false;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (row.some((f) => f.trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === sep) endField();
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  endRow();

  return rows
    // Les lignes de configuration d'Anki (#separator:tab, #html:true) sautent.
    .filter((r) => !r[0]?.startsWith("#"))
    // Colonnes au-delà de la seconde ignorées : Anki y range les tags.
    .map((r) => ({ recto: r[0] || "", verso: r[1] || "" }));
}

/* Analyse « collage » : chaque ligne est coupée en deux faces à la première
   occurrence du délimiteur. Une ligne sans délimiteur devient un recto seul. */
function splitByLine(text, re) {
  return text.split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const p = splitFirst(l, re); return p ? { recto: p[0], verso: p[1] } : { recto: l, verso: "" }; });
}

/* Découpe un texte en cartes { recto, verso }. `sep` est soit un caractère CSV
   (tabulation, ; ou ,), soit l'identifiant d'un séparateur « collage » (voir
   LINE_SEPARATORS). Le HTML éventuel est converti en texte, puis chaque face est
   nettoyée. */
export function parseCards(text, sep) {
  const lineSep = lineSepById(sep);
  const rows = lineSep ? splitByLine(text, lineSep.re) : parseDelimited(text, sep);

  return rows
    .map((r) => ({ recto: cleanField(htmlToText(r.recto)), verso: cleanField(htmlToText(r.verso)) }))
    .filter((c) => c.recto || c.verso);
}

/* Nom de paquet proposé à partir du nom de fichier. */
export const deckNameFromFile = (filename) =>
  filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Paquet importé";
