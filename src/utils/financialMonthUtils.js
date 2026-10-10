// src/utils/financialMonthUtils.js
// Berechnet den "finanziellen Monat" basierend auf einem konfigurierbaren Monatsbeginn-Tag.
// Beispiel: monthStartDay=24 → Einträge ab dem 24. Mai zählen zum finanziellen Juni (24. Mai – 23. Jun = "Juni").
import { validateMonthStartDay, toLocalISO } from "./hbUtils.js";
import { MONTHS_SHORT } from "./constants.js";

/**
 * Berechnet den finanziellen Monat für ein gegebenes Datum.
 * @param {string} dateStr - ISO-Datum (YYYY-MM-DD)
 * @param {number} monthStartDay - Tag des Monatsbeginns (1-28, Default: 1 = Kalendermonat)
 * @returns {{ year: number, month: number, yyyymm: string } | null}
 */
export function getFinancialMonth(dateStr, monthStartDay = 1) {
  if (typeof dateStr !== "string" || dateStr.length < 7) return null;

  const parts = dateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2] || 1);

  if (!Number.isFinite(year) || month < 1 || month > 12) return null;

  const startDay = validateMonthStartDay(monthStartDay);

  let financialMonth = month;
  let financialYear = year;

  // Ab dem startDay beginnt der nächste Finanzmonat (nur wenn startDay > 1)
  // Beispiel startDay=24: Mai 24 → Juni, Juni 1-23 → Juni, Juni 24 → Juli
  if (startDay > 1 && day >= startDay) {
    financialMonth += 1;
    if (financialMonth > 12) {
      financialMonth = 1;
      financialYear += 1;
    }
  }

  const yyyymm = `${financialYear}-${String(financialMonth).padStart(2, "0")}`;
  return { year: financialYear, month: financialMonth, yyyymm };
}

/**
 * Gibt den YYYY-MM-String des finanziellen Monats eines Eintrags zurück.
 * @param {Object} entry - Eintrag mit .date Feld
 * @param {number} monthStartDay
 * @returns {string}
 */
export function getEntryFinancialMonth(entry, monthStartDay = 1) {
  if (!entry?.date) return "";
  return getFinancialMonth(entry.date, monthStartDay)?.yyyymm ?? "";
}

/**
 * Berechnet den Datumsbereich eines finanziellen Monats.
 * @param {string} yyyymm - Finanzieller Monat (z.B. "2025-03")
 * @param {number} monthStartDay
 * @returns {{ startDate: string, endDate: string }} - ISO-Datumsstrings (inklusiv)
 */
export function getFinancialMonthRange(yyyymm, monthStartDay = 1) {
  if (!yyyymm) return null;
  const [yStr, mStr] = yyyymm.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;

  const startDay = validateMonthStartDay(monthStartDay);

  if (startDay === 1) {
    // Kalendermonat: 1. bis letzten Tag
    const lastDay = new Date(year, month, 0).getDate();
    return {
      startDate: `${year}-${String(month).padStart(2, "0")}-01`,
      endDate: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  // Finanzmonat N beginnt am startDay des Vormonats (Kalendermonat N-1)
  // Beispiel: Finanzmonat "Juni" mit startDay=24 → 24. Mai bis 23. Juni
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const startDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;

  // Endet am Tag vor dem startDay des angegebenen Monats
  const endDay = startDay - 1;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

/**
 * Liefert Länge und Verlaufsstatus eines finanziellen Monats unter
 * Berücksichtigung des konfigurierten Monatsbeginns. Gerechnet wird in lokaler
 * Zeit — `toISOString()` würde kurz nach Mitternacht noch den Vortag liefern.
 * @param {string} monthFilter - Finanzmonat "YYYY-MM"; leer ⇒ null
 * @param {number} monthStartDay
 * @param {Date} [today] - Bezugstag, nur für Tests abweichend
 * @returns {{ startDate: string, daysInMonth: number, daysElapsed: number,
 *   daysRemaining: number, isCurrentMonth: boolean, isFutureMonth: boolean } | null}
 */
export function getFinancialMonthInfo(monthFilter, monthStartDay, today = new Date()) {
  if (!monthFilter) return null;
  const startDay = monthStartDay ?? 1;
  const range = getFinancialMonthRange(monthFilter, startDay);
  if (!range) return null;

  const todayStr = toLocalISO(today);
  const isCurrentMonth = getFinancialMonth(todayStr, startDay)?.yyyymm === monthFilter;

  const msPerDay = 86400000;
  const startDate = new Date(range.startDate + "T00:00:00");
  const endDate = new Date(range.endDate + "T00:00:00");
  const daysInMonth = Math.round((endDate - startDate) / msPerDay) + 1;

  const isFutureMonth = !isCurrentMonth && startDate > today;

  let daysElapsed;
  if (isCurrentMonth) {
    // Ab Mitternacht zählen, nicht ab der Uhrzeit: sonst rundet der Nachmittag
    // auf den nächsten Tag auf. Math.round fängt nur noch die Sommerzeit ab.
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    daysElapsed = Math.min(
      Math.round((todayStart - startDate) / msPerDay) + 1,
      daysInMonth
    );
  } else if (isFutureMonth) {
    daysElapsed = 0;
  } else {
    daysElapsed = daysInMonth;
  }

  return {
    startDate: range.startDate,
    daysInMonth,
    daysElapsed,
    daysRemaining: Math.max(0, daysInMonth - daysElapsed),
    isCurrentMonth,
    isFutureMonth,
  };
}

export function formatYearMonth(yyyymm) {
  const [y, m] = String(yyyymm).split("-");
  if (!y || !m) return yyyymm;
  return `${MONTHS_SHORT[Number(m) - 1] || m} ${y}`;
}

/**
 * Verschiebt ein ISO-Datum um n Monate; der Tag wird ans Monatsende geklemmt
 * (31.01. +1M → 28.02.). Gerechnet wird in UTC, damit Sommerzeit-Sprünge keine
 * halben Tage erzeugen.
 * @param {string} iso - ISO-Datum (YYYY-MM-DD)
 * @param {number} n - Anzahl Monate (negativ = rückwärts)
 * @returns {string}
 */
export function addMonthsISO(iso, n) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}
