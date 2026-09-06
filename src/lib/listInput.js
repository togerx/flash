/*
 * Saisie assistée des listes dans une zone de texte.
 *
 * Entrée poursuit la liste en cours : « - » ou le numéro suivant sont ajoutés
 * d'office. Sur une ligne où le marqueur est resté seul, Entrée le retire et
 * sort de la liste. Backspace n'est pas intercepté : effacer « - » demande donc
 * deux frappes, ce qui reste le moyen le plus direct d'interrompre la série.
 *
 * Partagé par l'éditeur de carte et les cellules de l'éditeur de tableau.
 */
export function continueList(e, setText) {
  if (e.key !== "Enter" || e.shiftKey) return;
  const ta = e.target;
  const pos = ta.selectionStart;
  if (pos !== ta.selectionEnd) return;

  const value = ta.value;
  const debut = value.lastIndexOf("\n", pos - 1) + 1;
  const ligne = value.slice(debut, pos);

  const puce = ligne.match(/^(\s*)([-•])\s+(.*)$/);
  const num = ligne.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (!puce && !num) return;

  e.preventDefault();
  const contenu = puce ? puce[3] : num[4];

  if (!contenu.trim()) {
    const next = value.slice(0, debut) + value.slice(pos);
    setText(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(debut, debut); }, 0);
    return;
  }

  const marqueur = puce
    ? `${puce[1]}${puce[2]} `
    : `${num[1]}${Number(num[2]) + 1}${num[3]} `;
  const next = value.slice(0, pos) + "\n" + marqueur + value.slice(pos);
  setText(next);
  const suivant = pos + 1 + marqueur.length;
  setTimeout(() => { ta.focus(); ta.setSelectionRange(suivant, suivant); }, 0);
}
