// src/utils/recurringUtils.js
import { RECURRING_DUE_THRESHOLD_DAYS } from "./constants.js";

/**
 * Berechnet das nächste Fälligkeitsdatum basierend auf dem Tag des Monats
 * @param {number} dayOfMonth - Tag des Monats (1-31)
 * @param {string} [referenceDate] - Optionales Referenzdatum (ISO-Format), default: heute
 * @returns {string} - ISO-Datum des nächsten Fälligkeitstermins
 */
export function calcNextDueDate(dayOfMonth, referenceDate) {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let targetMonth = currentMonth;
  let targetYear = currentYear;

  // Wenn der Tag diesen Monat schon vorbei ist, nächsten Monat nehmen
  if (currentDay > dayOfMonth) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  // Maximalen Tag im Zielmonat ermitteln (z.B. 28/29/30/31)
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const actualDay = Math.min(dayOfMonth, daysInTargetMonth);

  const dueDate = new Date(targetYear, targetMonth, actualDay);

  const yyyy = dueDate.getFullYear();
  const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
  const dd = String(dueDate.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Berechnet die Anzahl der Tage bis zum Fälligkeitsdatum
 * @param {string} dueDateISO - Fälligkeitsdatum im ISO-Format
 * @param {string} [todayISO] - Optionales heutiges Datum im ISO-Format
 * @returns {number} - Tage bis Fälligkeit (negativ = überfällig)
 */
export function calcDaysUntilDue(dueDateISO, todayISO) {
  const today = todayISO ? new Date(todayISO) : new Date();
  const dueDate = new Date(dueDateISO);

  // Auf Mitternacht normalisieren
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffMs = dueDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Zählt die Anzahl der Fixkosten, die bald fällig sind
 * @param {Array} expenses - Array von recurringExpense-Objekten
 * @param {string} todayISO - Heutiges Datum im ISO-Format
 * @param {number} [threshold] - Schwellenwert in Tagen
 * @returns {number} - Anzahl der bald fälligen Items
 */
export function calcDueSoonCount(expenses, todayISO, threshold = RECURRING_DUE_THRESHOLD_DAYS) {
  if (!Array.isArray(expenses)) return 0;

  return expenses.filter((item) => {
    if (!item.active) return false;
    const nextDue = calcNextDueDate(item.dayOfMonth, todayISO);
    const daysUntil = calcDaysUntilDue(nextDue, todayISO);
    return daysUntil >= 0 && daysUntil <= threshold;
  }).length;
}

/**
 * Formatiert den Tag des Monats als "X. des Monats"
 * @param {number} day - Tag des Monats (1-31)
 * @returns {string}
 */
export function formatDayOfMonth(day) {
  return `${day}. des Monats`;
}
