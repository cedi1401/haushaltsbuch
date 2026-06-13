// src/utils/potUtils.js
import { getEntryFinancialMonth } from "./financialMonthUtils.js";
import { sumAmounts } from "./hbUtils.js";

/**
 * Berechnet Topf-Stand (aktuell)
 * @param {Array} entries - alle Einträge
 * @param {string} potId - z.B. "reserve" oder "surplus"
 */
export function calcPotBalance(entries, potId) {
  const transfersIn = sumAmounts(entries, (e) => e.kind === "transfer" && e.potId === potId);
  const expensesOut = sumAmounts(entries, (e) => e.kind === "withdrawal" && e.potId === potId);

  return transfersIn - expensesOut;
}

/**
 * Berechnet Topf-Entwicklung über Monate
 * Gibt Array zurück: [{month, transfersIn, expensesOut, balance}, ...]
 */
export function calcPotSeries(entries, potId, monthStartDay = 1) {
  const map = new Map();

  for (const e of entries || []) {
    if (e.potId !== potId) continue;
    if (e.kind !== "transfer" && e.kind !== "withdrawal") continue;

    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;

    const prev = map.get(ym) || { month: ym, transfersIn: 0, expensesOut: 0 };

    if (e.kind === "transfer") {
      prev.transfersIn += Number(e.amount || 0);
    } else {
      prev.expensesOut += Number(e.amount || 0);
    }

    map.set(ym, prev);
  }

  // Sortieren + kumulierte Balance berechnen
  const arr = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));

  let cumulative = 0;
  return arr.map((d) => {
    cumulative += d.transfersIn - d.expensesOut;
    return { ...d, balance: cumulative };
  });
}

export function getWithdrawalCategoriesForPot(entries, potId, allCategories) {
  if (!potId || !allCategories.length) return allCategories;
  const used = new Set();
  for (const e of entries) {
    if (e.kind === "withdrawal" && e.potId === potId && e.category) used.add(e.category);
  }
  const filtered = allCategories.filter((cat) => used.has(cat));
  return filtered.length > 0 ? filtered : allCategories;
}