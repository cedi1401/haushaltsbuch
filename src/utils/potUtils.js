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

/**
 * Netto-Stand eines einzelnen Zwecks in einem Topf: Σ Transfers − Σ Entnahmen.
 * Kann negativ sein (Überentnahme). Zählt jede Buchung mit, auch manuell
 * erfasste ohne recurringId — der Ist-Stand ist das Geld im Topf, nicht die
 * Herkunft der Buchung.
 * @param {Array} entries - alle Einträge
 * @param {string} potId
 * @param {string} purpose - Zweck (entry.category)
 * @returns {number}
 */
export function potPurposeBalance(entries, potId, purpose) {
  const key = String(purpose ?? "").trim();
  let sum = 0;
  for (const e of entries || []) {
    if (e.potId !== potId) continue;
    if (String(e.category ?? "").trim() !== key) continue;
    if (e.kind === "transfer") sum += Number(e.amount || 0);
    else if (e.kind === "withdrawal") sum -= Number(e.amount || 0);
  }
  return sum;
}

/**
 * Alle Zweck-Netto-Stände eines Topfes in einem Durchlauf.
 * Ein Eintrag ohne category landet unter dem leeren Schlüssel "" — die
 * Anzeige-Beschriftung (z.B. „Sonstiges") ist Sache der View.
 * @param {Array} entries
 * @param {string} potId
 * @returns {Map<string, number>}
 */
export function potPurposeBalances(entries, potId) {
  const map = new Map();
  for (const e of entries || []) {
    if (e.potId !== potId) continue;
    if (e.kind !== "transfer" && e.kind !== "withdrawal") continue;
    const key = String(e.category ?? "").trim();
    const prev = map.get(key) || 0;
    const amount = Number(e.amount || 0);
    map.set(key, e.kind === "transfer" ? prev + amount : prev - amount);
  }
  return map;
}
