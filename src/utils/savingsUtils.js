// src/utils/savingsUtils.js
//
// Rechenmodell der Sparen-View (F2, Konzept C, Etappe 7c). Jede aktive
// Sparposition (Zweck) wird zu einer Zeile in ihrem Topf; die Bewertung hängt an
// der Art:
//
//   Rücklage     — keine Bewertung, nur Ist-Stand und optionale Rate
//   Rückstellung — Zyklus, Soll/Ist und Status aus sinkingFundStatus()
//   Sparziel     — Fortschritt und Prognose aus goalUtils
//
// Je Topf entsteht zusätzlich die Überleitung: Topf-Stand = Summe der
// Sparpositionen + abgeschlossene Sparziele + Rest „ohne Sparposition"
// (Buchungen ohne Zweck und solche auf gelöschte Zwecke). Damit lässt sich jede
// Abweichung zwischen Topf und Positionen in der View ablesen.

import { calcPotBalance, potPurposeBalances } from "./potUtils.js";
import { monthlyRate, sinkingFundStatus } from "./fixedCostUtils.js";
import { calcGoalArchiveStats, calcGoalPrognosis, calcGoalProgress } from "./goalUtils.js";
import { getActiveTransferCategories, purposeToFixedItem, purposeToGoal } from "./transferCategoryUtils.js";
import { todayISO } from "./formatUtils.js";

/** Unterhalb davon ist ein Rest Rundungsrauschen, keine Aussage. */
const CENT = 0.005;

/**
 * Status eines Sparziels in denselben Stufen wie bei Rückstellungen:
 * „reached" (Ziel erreicht), „missed" (Deadline vorbei), „offTrack" (mit dem
 * bisherigen Tempo nicht bis zur Deadline), „onTrack", ohne Deadline „open".
 */
export function goalStatus(progress, prognosis, hasDeadline) {
  if (progress.percent >= 100) return "reached";
  if (!hasDeadline) return "open";
  if (prognosis.deadlinePassed) return "missed";
  return prognosis.isAchievable ? "onTrack" : "offTrack";
}

/**
 * Eine Zeile der Sparen-View. Die Felder aus sinkingFundStatus() liegen flach
 * in der Zeile, weil der Detailbereich und die Dialoge der Rückstellungen sie
 * so erwarten; `item` ist der Zweck in Form einer Fixkosten-Position.
 */
function buildRow(purpose, entries, opts) {
  const item = purposeToFixedItem(purpose);
  const base = { id: purpose.id, purpose, rule: purpose.rule, item };

  if (purpose.rule === "goal") {
    const goal = purposeToGoal(purpose);
    const progress = calcGoalProgress(goal, entries);
    const prognosis = calcGoalPrognosis(goal, entries, opts.today, opts.monthStartDay);
    return {
      ...base,
      goal,
      goalProgress: progress,
      prognosis,
      monthlyRate: Number(purpose.monthlyRate) > 0 ? Number(purpose.monthlyRate) : null,
      goalAmount: progress.target,
      target: null,
      actual: progress.current,
      delta: null,
      progress: progress.target > 0 ? progress.current / progress.target : null,
      nextDate: goal.deadline,
      status: goalStatus(progress, prognosis, Boolean(goal.deadline)),
    };
  }

  const status = sinkingFundStatus(item, entries, opts);
  if (status.isSinkingFund) {
    return {
      ...status,
      ...base,
      goalAmount: status.cycleAmount,
      nextDate: status.nextDue,
    };
  }

  // Rücklage (auch eine Rückstellung ohne gültigen Anker fällt hierher)
  return {
    ...status,
    ...base,
    monthlyRate: monthlyRate(item) > 0 ? monthlyRate(item) : null,
    goalAmount: null,
    nextDate: null,
  };
}

/**
 * Das komplette Modell der Sparen-View.
 *
 * @param {{ pots?: Array, transferCategories?: Array }} book
 * @param {Array} entries - alle Einträge des Buchs
 * @param {{ monthStartDay?: number, today?: string }} [opts]
 * @returns {{
 *   sections: Array<{ pot: object, balance: number, rows: Array,
 *                     archivedBalance: number, unassigned: number }>,
 *   archivedGoals: Array,
 *   kpis: { saved: number, potCount: number, rates: number, reserveRates: number,
 *           behind: number, due: number }
 * }}
 */
export function buildSavingsModel(book, entries, opts = {}) {
  const o = { monthStartDay: opts.monthStartDay ?? 1, today: opts.today ?? todayISO() };
  const pots = book?.pots || [];
  const potIds = new Set(pots.map((p) => p.id));
  const purposes = getActiveTransferCategories(book?.transferCategories).filter((c) =>
    potIds.has(c.potId)
  );

  const rowsByPot = new Map();
  const archivedByPot = new Map();
  const archivedGoals = [];
  for (const purpose of purposes) {
    if (purpose.rule === "goal" && purpose.completedAt) {
      const goal = purposeToGoal(purpose);
      archivedGoals.push({ ...goal, archive: calcGoalArchiveStats(goal, entries) });
      continue;
    }
    if (!rowsByPot.has(purpose.potId)) rowsByPot.set(purpose.potId, []);
    rowsByPot.get(purpose.potId).push(buildRow(purpose, entries, o));
  }
  archivedGoals.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

  const sections = pots.map((pot) => {
    const rows = rowsByPot.get(pot.id) || [];
    const balance = calcPotBalance(entries, pot.id);
    const byPurpose = potPurposeBalances(entries, pot.id);
    let archivedBalance = 0;
    for (const g of archivedGoals) {
      if (g.potId === pot.id) archivedBalance += byPurpose.get(g.id) || 0;
    }
    archivedByPot.set(pot.id, archivedBalance);
    const assigned = rows.reduce((s, r) => s + (Number(r.actual) || 0), 0);
    return {
      pot,
      balance,
      rows,
      archivedBalance,
      unassigned: balance - assigned - archivedBalance,
    };
  });

  let saved = 0;
  let rates = 0;
  let reserveRates = 0;
  let behind = 0;
  let due = 0;
  for (const section of sections) {
    for (const row of section.rows) {
      saved += Number(row.actual) || 0;
      rates += Number(row.monthlyRate) || 0;
      if (row.rule === "reserve") reserveRates += Number(row.monthlyRate) || 0;
      if (row.status === "due" || row.status === "overdue") due += 1;
      else if (row.status === "behind" || row.status === "offTrack" || row.status === "missed") behind += 1;
    }
  }

  return {
    sections,
    archivedGoals,
    kpis: {
      saved,
      potCount: sections.filter((s) => s.rows.length > 0).length,
      rates,
      reserveRates,
      behind,
      due,
    },
  };
}

/** Ist ein Rest groß genug, um als eigene Zeile zu erscheinen? */
export function isVisibleRemainder(amount) {
  return Math.abs(Number(amount) || 0) >= CENT;
}
