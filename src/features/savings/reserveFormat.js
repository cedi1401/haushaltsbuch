/**
 * „2,5 Monatsraten" — ein Fehl- oder Überbetrag in der Einheit, in der er
 * entsteht. Eine Nachkommastelle, weil ein Rückstand selten glatt aufgeht; die
 * glatte Zahl verliert sie wieder, sonst stünde dort „3,0 Monatsraten".
 *
 * Eigenes Modul, weil sowohl der Spaltenkatalog (Tooltip an der Status-Pille)
 * als auch der Detailbereich (Bewertungssatz) denselben Satzbaustein brauchen.
 */
export function formatRateCount(count) {
  if (!Number.isFinite(count)) return null;
  const rounded = Math.round(count * 10) / 10;
  const text = rounded.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${text} ${rounded === 1 ? "Monatsrate" : "Monatsraten"}`;
}
