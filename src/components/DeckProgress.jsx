/* Récapitulatif d'un paquet : apprises / à revoir / pas encore vues.
   `stats` vient soit des compteurs du paquet (accueil, aucune carte lue), soit
   d'un calcul direct sur les cartes (vue paquet). Le détail chiffré s'affiche
   au survol, ou au focus (clavier et tactile). */
export default function DeckProgress({ stats, compact }) {
  const { total, apprise, arevoir, nonvue } = stats;
  const barCls = `flex w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-700 ${compact ? "h-1.5" : "h-2.5"}`;

  // Paquet vide : la piste est tout de même rendue, pour que toutes les vignettes
  // gardent le même gabarit. Rien à survoler, donc ni focus ni info-bulle.
  if (!total) return <div className={compact ? "" : "mt-4"}><div className={barCls} /></div>;

  const pct = (n) => `${(n / total) * 100}%`;
  const items = [
    { n: apprise, label: `apprise${apprise > 1 ? "s" : ""}`, dot: "bg-emerald-500" },
    { n: arevoir, label: "à revoir", dot: "bg-rose-400" },
    { n: nonvue, label: `pas encore vue${nonvue > 1 ? "s" : ""}`, dot: "bg-slate-300" },
  ];

  return (
    <div
      className={`group relative cursor-default focus-visible:outline-none ${compact ? "" : "mt-4"}`}
      tabIndex={0}
      aria-label={`Progression : ${items.map((i) => `${i.n} ${i.label}`).join(", ")}`}
    >
      <div className={barCls}>
        <div className="bg-emerald-500 transition-all" style={{ width: pct(apprise) }} />
        <div className="bg-rose-400 transition-all" style={{ width: pct(arevoir) }} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus:opacity-100">
        {items.map((it) => (
          <span key={it.label} className="flex items-center gap-1.5 whitespace-nowrap py-0.5">
            <i className={`h-2 w-2 shrink-0 rounded-full ${it.dot}`} /> <b className="font-semibold">{it.n}</b> {it.label}
          </span>
        ))}
        <span className="mt-1 block whitespace-nowrap border-t border-white/15 pt-1 text-slate-400 dark:text-slate-500">
          {total} carte{total > 1 ? "s" : ""} au total
        </span>
      </div>
    </div>
  );
}
