// src/utils/goalUtils.js
import { getEntryFinancialMonth, getFinancialMonth } from "./financialMonthUtils.js";
import { sumAmounts } from "./hbUtils.js";

/**
 * Anzahl Finanzmonate von fromYm bis toYm (inklusive beider Grenzen), mindestens 1.
 * @param {string} fromYm - "YYYY-MM"
 * @param {string} toYm - "YYYY-MM"
 */
function diffMonthsInclusive(fromYm, toYm) {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  const span = (ty - fy) * 12 + (tm - fm) + 1;
  return span < 1 ? 1 : span;
}

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

  // Berechne durchschnittlichen monatlichen Zufluss.
  // Konsistent zu calcGoalProgress: nur Einzahlungen ab dem Zielstart zählen (F-2).
  const startDate = resolveStartDate(goal);
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
  if (startDate) {
    relevantEntries = relevantEntries.filter((e) => e.date && e.date >= startDate);
  }

  if (relevantEntries.length === 0) {
    return {
      monthsRemaining: Infinity,
      estimatedDate: null,
      isAchievable: false,
      avgMonthly: 0,
    };
  }

  // Gruppiere nach Finanzmonat
  const monthlyTotals = new Map();
  for (const e of relevantEntries) {
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;
    const prev = monthlyTotals.get(ym) || 0;
    monthlyTotals.set(ym, prev + Number(e.amount || 0));
  }

  const monthKeys = Array.from(monthlyTotals.keys()).sort();
  if (monthKeys.length === 0) {
    return {
      monthsRemaining: Infinity,
      estimatedDate: null,
      isAchievable: false,
      avgMonthly: 0,
    };
  }

  // Ø über die verstrichene Zeitspanne (erste Einzahlung → heute), Nullmonate
  // eingeschlossen — sonst wird die Prognose zu optimistisch (F-1).
  const totalIn = Array.from(monthlyTotals.values()).reduce((a, b) => a + b, 0);
  const firstYm = monthKeys[0];
  const todayYm =
    getFinancialMonth(todayISO, monthStartDay)?.yyyymm || monthKeys[monthKeys.length - 1];
  const monthSpan = diffMonthsInclusive(firstYm, todayYm);
  const avgMonthly = totalIn / monthSpan;

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

/**
 * Berechnet Kennzahlen für ein abgeschlossenes (archiviertes) Sparziel.
 * Stützt sich auf den Schnappschuss `completedAmount` zum Abschlusszeitpunkt
 * und zählt nur Einzahlungen bis zum Abschlussdatum.
 * @param {Object} goal - Das (abgeschlossene) Sparziel mit completedAt
 * @param {Array} entries - Alle Einträge
 * @returns {{
 *   start: string|null, completedAt: string|null,
 *   durationMonths: number|null, durationDays: number|null,
 *   depositCount: number, savedAmount: number, target: number,
 *   avgMonthly: number, deadlineDelta: number|null
 * } | null}
 */
export function calcGoalArchiveStats(goal, entries) {
  if (!goal) return null;

  const completedAt = goal.completedAt || null;

  // Relevante Einzahlungen (Transfers in den Topf, optional nach Zweck gefiltert)
  const relevantAll = (entries || []).filter(
    (e) =>
      e.kind === "transfer" &&
      e.potId === goal.potId &&
      (!goal.transferCategory || e.category === goal.transferCategory)
  );
  // Nur Buchungen bis zum Abschluss berücksichtigen
  const relevant = completedAt
    ? relevantAll.filter((e) => e.date && e.date <= completedAt)
    : relevantAll;

  const depositCount = relevant.length;

  const dates = relevant.map((e) => e.date).filter(Boolean).sort();
  const start = resolveStartDate(goal) || dates[0] || goal.createdAt || null;

  let durationMonths = null;
  let durationDays = null;
  if (start && completedAt) {
    const s = new Date(start);
    const e = new Date(completedAt);
    durationDays = Math.max(0, Math.round((e - s) / 86400000));
    durationMonths = Math.max(
      0,
      (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    );
  }

  const savedAmount =
    goal.completedAmount != null && Number.isFinite(Number(goal.completedAmount))
      ? Number(goal.completedAmount)
      : Number(goal.targetAmount) || 0;

  // Ø monatlich — mindestens 1 Monat als Divisor, um Division durch 0 zu vermeiden
  const monthsForAvg = durationMonths && durationMonths > 0 ? durationMonths : 1;
  const avgMonthly = Math.round((savedAmount / monthsForAvg) * 100) / 100;

  // Deadline-Vergleich: positiv = vor Deadline erreicht, negativ = danach
  let deadlineDelta = null;
  if (goal.deadline && completedAt) {
    const dl = new Date(goal.deadline);
    const c = new Date(completedAt);
    deadlineDelta = Math.round((dl - c) / 86400000);
  }

  return {
    start,
    completedAt,
    durationMonths,
    durationDays,
    depositCount,
    savedAmount,
    target: Number(goal.targetAmount) || 0,
    avgMonthly,
    deadlineDelta,
  };
}
