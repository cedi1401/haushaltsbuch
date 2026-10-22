// src/utils/dashboardTrend.js
import { getEntryFinancialMonth } from "./financialMonthUtils.js";

/**
 * Aggregiert je Finanzmonat die Dashboard-Kennzahlen (Einnahmen, Ausgaben,
 * Rücklagen, Gespart, Frei). Enthält nur Monate mit Buchungen, aufsteigend
 * nach Monat sortiert — Basis für die Stat-Tile-Sparklines und das
 * Vormonatsdelta.
 *
 * Die Aggregation spiegelt exakt die Scalar-Kennzahlen aus HaushaltsbuchApp:
 * Was als Sparen zählt (Spar-Transfers und Ausgaben in „Sparen und Anlegen“),
 * landet in `savings`, übrige Monatsausgaben (`source === "month"`) in
 * `expense`, übrige Transfers in `reserve`. Jeder Betrag zählt genau einmal.
 * Frei = Einnahmen − Ausgaben − Rücklagen − Gespart. Entnahmen (`withdrawal`)
 * fließen — wie in der App — in keine dieser Zahlen.
 *
 * @param {Array} entries - alle Einträge des Buchs
 * @param {(entry) => boolean} isSavingsEntry - siehe makeIsSavingsEntry
 * @param {number} monthStartDay - Starttag des Finanzmonats
 * @returns {Array<{month, income, expense, reserve, savings, free}>}
 */
export function calcMonthlyTotals(entries, isSavingsEntry, monthStartDay = 1) {
  const map = new Map();

  for (const e of entries || []) {
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;

    const row = map.get(ym) || { month: ym, income: 0, expense: 0, reserve: 0, savings: 0 };
    const amt = Number(e.amount || 0);

    if (e.kind === "income") {
      row.income += amt;
    } else if (isSavingsEntry?.(e)) {
      row.savings += amt;
    } else if (e.kind === "expense" && e.source === "month") {
      row.expense += amt;
    } else if (e.kind === "transfer") {
      row.reserve += amt;
    }

    map.set(ym, row);
  }

  return Array.from(map.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, free: r.income - r.expense - r.reserve - r.savings }));
}
