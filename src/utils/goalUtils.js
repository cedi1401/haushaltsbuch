// src/utils/goalUtils.js

/**
 * Generiert eine eindeutige Goal-ID
 */
export function generateGoalId() {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Berechnet den Fortschritt eines Sparziels
 * @param {Object} goal - Das Sparziel
 * @param {Array} entries - Alle Einträge
 * @param {Array} pots - Alle Töpfe
 * @returns {{ current: number, target: number, percent: number, remaining: number }}
 */
export function calcGoalProgress(goal, entries, pots) {
  if (!goal) {
    return { current: 0, target: 0, percent: 0, remaining: 0 };
  }

  const target = Number(goal.targetAmount) || 0;
  let current = 0;

  if (goal.type === "pot") {
    // Bei type="pot": Topf-Stand berechnen (Summe transfers in - expenses out)
    const potId = goal.linkedId;

    const transfersIn = (entries || [])
      .filter((e) => e.kind === "transfer" && e.potId === potId)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const expensesOut = (entries || [])
      .filter((e) => e.kind === "expense" && e.source === "pot" && e.potId === potId)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    current = transfersIn - expensesOut;
  } else if (goal.type === "category") {
    // Bei type="category": Summe aller Transfers mit diesem Zweck
    const categoryName = goal.linkedId;

    current = (entries || [])
      .filter((e) => e.kind === "transfer" && e.category === categoryName)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
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
export function calcGoalPrognosis(goal, entries, todayISO) {
  if (!goal) {
    return { monthsRemaining: 0, estimatedDate: null, isAchievable: false, avgMonthly: 0 };
  }

  const progress = calcGoalProgress(goal, entries, []);
  const remaining = progress.remaining;
  const target = progress.target;
  const current = progress.current;

  // Wenn Ziel bereits erreicht
  if (remaining <= 0) {
    return { monthsRemaining: 0, estimatedDate: todayISO, isAchievable: true, avgMonthly: 0 };
  }

  // Berechne durchschnittlichen monatlichen Zufluss
  let relevantEntries = [];

  if (goal.type === "pot") {
    relevantEntries = (entries || []).filter(
      (e) => e.kind === "transfer" && e.potId === goal.linkedId
    );
  } else if (goal.type === "category") {
    relevantEntries = (entries || []).filter(
      (e) => e.kind === "transfer" && e.category === goal.linkedId
    );
  }

  if (relevantEntries.length === 0) {
    return { monthsRemaining: Infinity, estimatedDate: null, isAchievable: false, avgMonthly: 0 };
  }

  // Gruppiere nach Monat
  const monthlyTotals = new Map();
  for (const e of relevantEntries) {
    const ym = typeof e.date === "string" ? e.date.slice(0, 7) : "";
    if (!ym) continue;
    const prev = monthlyTotals.get(ym) || 0;
    monthlyTotals.set(ym, prev + Number(e.amount || 0));
  }

  const months = Array.from(monthlyTotals.values());
  if (months.length === 0) {
    return { monthsRemaining: Infinity, estimatedDate: null, isAchievable: false, avgMonthly: 0 };
  }

  const avgMonthly = months.reduce((a, b) => a + b, 0) / months.length;

  if (avgMonthly <= 0) {
    return { monthsRemaining: Infinity, estimatedDate: null, isAchievable: false, avgMonthly: 0 };
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
