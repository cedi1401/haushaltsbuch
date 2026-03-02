// src/utils/potUtils.js

/**
 * Extrahiert YYYY-MM aus einem Datumsstring
 */
function yyyymmFromDate(dateStr) {
  if (typeof dateStr !== "string") return "";
  return dateStr.length >= 7 ? dateStr.slice(0, 7) : "";
}

/**
 * Berechnet Monats-Zusammenfassung (für Dashboard)
 * Berücksichtigt: income, expense (month), transfer
 */
export function calcMonthlySummary(entries) {
  const income = entries
    .filter((e) => e.kind === "income")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const expenseMonth = entries
    .filter((e) => e.kind === "expense" && e.source === "month")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const transfers = entries
    .filter((e) => e.kind === "transfer")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Saldo = Einnahmen - (Ausgaben aus Monat) - (Transfers)
  const balance = income - expenseMonth - transfers;

  return {
    income,
    expenseMonth,
    transfers,
    balance,
  };
}

/**
 * Berechnet Topf-Stand (aktuell)
 * @param {Array} entries - alle Einträge
 * @param {string} potId - z.B. "reserve" oder "surplus"
 */
export function calcPotBalance(entries, potId) {
  const transfersIn = entries
    .filter((e) => e.kind === "transfer" && e.potId === potId)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const expensesOut = entries
    .filter((e) => e.kind === "withdrawal" && e.potId === potId)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return transfersIn - expensesOut;
}

/**
 * Berechnet Topf-Entwicklung über Monate
 * Gibt Array zurück: [{month, transfersIn, expensesOut, balance}, ...]
 */
export function calcPotSeries(entries, potId) {
  const map = new Map();

  for (const e of entries || []) {
    const ym = yyyymmFromDate(e.date);
    if (!ym) continue;

    const prev = map.get(ym) || { month: ym, transfersIn: 0, expensesOut: 0 };

    if (e.kind === "transfer" && e.potId === potId) {
      prev.transfersIn += Number(e.amount || 0);
    }

    if (e.kind === "withdrawal" && e.potId === potId) {
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

/**
 * Berechnet Monats-Rest (für "Monat abschließen")
 * = Einnahmen - Ausgaben(month) - Transfers
 */
export function calcMonthRest(entries, ym) {
  const filtered = entries.filter((e) => {
    const month = yyyymmFromDate(e.date);
    return month === ym;
  });

  const summary = calcMonthlySummary(filtered);
  return summary.balance;
}

/**
 * Prüft, ob für einen Monat bereits ein Abschluss-Transfer existiert
 * (optional: mit bestimmter Kategorie oder Note)
 */
export function hasMonthCloseTransfer(entries, ym, potId = "surplus") {
  return entries.some((e) => {
    const month = yyyymmFromDate(e.date);
    return (
      month === ym &&
      e.kind === "transfer" &&
      e.potId === potId &&
      (e.category === "Monatsabschluss" || e.note?.includes("Monatsabschluss"))
    );
  });
}