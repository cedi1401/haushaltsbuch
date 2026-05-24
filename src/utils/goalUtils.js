// src/utils/goalUtils.js
import { getEntryFinancialMonth } from "./financialMonthUtils.js";
import { sumAmounts } from "./hbUtils.js";

/**
 * Bestimmt das Startdatum basierend auf dem startMode
 */
function resolveStartDate(goal) {
  if (!goal) return null;
  switch (goal.startMode) {
    case "date":
      return goal.startDate || goal.createdAt || null;
    case "custom":
      return goal.createdAt || null;
    case "zero":
    default:
      return null; // kein Startdatum = alle Entries zählen
  }
}

/**
 * Berechnet den Fortschritt eines Sparziels
 * @param {Object} goal - Das Sparziel (potId, transferCategory, startMode, startDate, startAmount)
 * @param {Array} entries - Alle Einträge
 * @param {Array} pots - Alle Töpfe
 * @returns {{ current: number, target: number, percent: number, remaining: number }}
 */
export function calcGoalProgress(goal, entries, _pots) {
  if (!goal) {
    return { current: 0, target: 0, percent: 0, remaining: 0 };
  }

  const target = Number(goal.targetAmount) || 0;
  const potId = goal.potId;
  const startDate = resolveStartDate(goal);

  // Entries ab Startdatum filtern
  const relevant = (entries || []).filter((e) => {
    if (startDate && (!e.date || e.date < startDate)) return false;
    return true;
  });

  let current = 0;

  if (goal.transferCategory) {
    // Nur Transfers mit passendem potId + category zählen
    // Entnahmen werden NICHT abgezogen (sie haben keinen Zweck)
    current = sumAmounts(relevant, (e) =>
      e.kind === "transfer" && e.potId === potId && e.category === goal.transferCategory
    );
  } else {
    // Topf-Gesamtstand: alle transfers rein - alle withdrawals raus
    const transfersIn = sumAmounts(relevant, (e) => e.kind === "transfer" && e.potId === potId);
    const withdrawalsOut = sumAmounts(relevant, (e) => e.kind === "withdrawal" && e.potId === potId);
    current = transfersIn - withdrawalsOut;
  }

  // Manuellen Anfangsbetrag addieren (für startMode "custom")
  if (goal.startMode === "custom") {
    current += Number(goal.startAmount || 0);
  }

  const percent = target > 0 ? Math.round((current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);

  return { current, target, percent, remaining };
}

/**
 * Berechnet die Prognose für ein Sparziel
 * @param {Object} goal - Das Sparziel
 * @param {Array} entries - Alle Einträge
 * @param {string} todayISO - Heutiges Datum als ISO-String (YYYY-MM-DD)
 * @returns {{ monthsRemaining: number, estimatedDate: string|null, isAchievable: boolean, avgMonthly: number }}
 */
export function calcGoalPrognosis(goal, entries, todayISO, monthStartDay = 1) {
  if (!goal) {
    return {
      monthsRemaining: 0,
      estimatedDate: null,
      isAchievable: false,
      avgMonthly: 0,
    };
  }

  const progress = calcGoalProgress(goal, entries, []);
  const remaining = progress.remaining;

  // Wenn Ziel bereits erreicht
  if (remaining <= 0) {
    return {
      monthsRemaining: 0,
      estimatedDate: todayISO,
      isAchievable: true,
      avgMonthly: 0,
    };
  }

  // Berechne durchschnittlichen monatlichen Zufluss
  let relevantEntries = [];

  if (goal.transferCategory) {
    relevantEntries = (entries || []).filter(
      (e) =>
        e.kind === "transfer" &&
        e.potId === goal.potId &&
        e.category === goal.transferCategory
    );
  } else {
    relevantEntries = (entries || []).filter(
      (e) => e.kind === "transfer" && e.potId === goal.potId
    );
  }

  if (relevantEntries.length === 0) {
    return {
      monthsRemaining: Infinity,
      estimatedDate: null,
      isAchievable: false,
      avgMonthly: 0,
    };
  }

  // Gruppiere nach Monat
  const monthlyTotals = new Map();
  for (const e of relevantEntries) {
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;
    const prev = monthlyTotals.get(ym) || 0;
    monthlyTotals.set(ym, prev + Number(e.amount || 0));
  }

  const months = Array.from(monthlyTotals.values());
  if (months.length === 0) {
    return {
      monthsRemaining: Infinity,
      estimatedDate: null,
      isAchievable: false,
      avgMonthly: 0,
    };
  }

  const avgMonthly = months.reduce((a, b) => a + b, 0) / months.length;

  if (avgMonthly <= 0) {
    return {
      monthsRemaining: Infinity,
      estimatedDate: null,
      isAchievable: false,
      avgMonthly: 0,
    };
  }

  const monthsRemaining = Math.ceil(remaining / avgMonthly);

  // Berechne geschätztes Datum
  const today = new Date(todayISO);
  const estimatedDate = new Date(today);
  estimatedDate.setMonth(estimatedDate.getMonth() + monthsRemaining);
  const estimatedISO = estimatedDate.toISOString().slice(0, 10);

  // Prüfe, ob Ziel vor Deadline erreichbar ist
  let isAchievable = true;
  if (goal.deadline) {
    const deadlineDate = new Date(goal.deadline);
    isAchievable = estimatedDate <= deadlineDate;
  }

  return {
    monthsRemaining,
    estimatedDate: estimatedISO,
    isAchievable,
    avgMonthly: Math.round(avgMonthly * 100) / 100,
  };
}
