// src/utils/budgetUtils.js
import { getEntryFinancialMonth, getFinancialMonth, getFinancialMonthInfo } from "./financialMonthUtils.js";
import { monthlyRate } from "./fixedCostUtils.js";
import { toLocalISO } from "./hbUtils.js";

// ============================================
// Budget: Status, Zeitvergleich, Prognose
// ============================================

export const UNCATEGORIZED_ID = "cat_unkategorisiert";

// Beträge sind auf Rappen/Cent genau — alles darunter ist Rechenrauschen.
const EPS = 0.005;
// Ab dieser Auslastung gilt ein Budget als knapp.
export const BUDGET_RISK_PCT = 0.95;
// So viele Prozentpunkte darf der variable Teil dem Zeitfortschritt voraus sein.
export const BUDGET_PACE_TOLERANCE = 0.1;
// Vorher ist eine Hochrechnung aus ein, zwei Buchungen reines Raten.
export const BUDGET_MIN_DAYS = 3;

export const BUDGET_STATUS_LABEL = {
  ok: "Im Budget",
  warn: "Aufpassen",
  risk: "Knapp",
  full: "Ausgeschöpft",
  over: "Überschritten",
};

// Ton für Meter und Kennzahlen; die Pillen färbt .hb-budget-status-pill--*.
export const BUDGET_STATUS_COLOR = {
  ok: "var(--green)",
  warn: "var(--yellow)",
  risk: "var(--yellow)",
  full: "var(--muted)",
  over: "var(--red)",
};

const hasBudget = (node) => node?.budget != null && node.budget > 0;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Kennzahlen eines Budgets für einen Monat.
 *
 * Fixkosten werden aus Zeitvergleich und Prognose herausgerechnet: Eine Miete
 * ist am 3. des Monats zu 100 % verbraucht, ohne dass irgendetwas aus dem Ruder
 * läuft. Linear hochgerechnet wird deshalb nur der variable Teil; die
 * Fixkosten gehen mit ihrem bekannten Betrag ein (gebucht + noch offen).
 *
 * Zeitvergleich und Prognose gibt es nur im laufenden Monat und erst ab
 * BUDGET_MIN_DAYS — sonst bleiben die Felder null.
 *
 * @param {{ budget: number, spent: number, fixedBooked?: number, fixedOpen?: number }} item
 * @param {object|null} monthInfo - Ergebnis von getFinancialMonthInfo()
 * @returns {object}
 */
export function calcBudgetMetrics({ budget, spent, fixedBooked = 0, fixedOpen = 0 }, monthInfo) {
  const pct = budget > 0 ? spent / budget : 0;
  const variableSpent = Math.max(0, spent - fixedBooked);
  const variableBudget = budget - fixedBooked - fixedOpen;

  let expectedPct = null;
  let dailyRate = null;
  let forecast = null;
  let forecastDelta = null;
  let variablePct = null;
  let paceDelta = null;

  if (monthInfo?.isCurrentMonth && monthInfo.daysElapsed >= BUDGET_MIN_DAYS) {
    expectedPct = monthInfo.daysElapsed / monthInfo.daysInMonth;
    dailyRate = variableSpent / monthInfo.daysElapsed;
    forecast = fixedBooked + fixedOpen + dailyRate * monthInfo.daysInMonth;
    forecastDelta = forecast - budget;
    // Ein Budget, das die Fixkosten ganz aufbrauchen, hat keinen variablen
    // Teil — dort gibt es nichts, was zu schnell laufen könnte.
    if (variableBudget > EPS) {
      variablePct = variableSpent / variableBudget;
      paceDelta = variableSpent - variableBudget * expectedPct;
    }
  }

  let status;
  if (spent > budget + EPS) status = "over";
  else if (spent >= budget - EPS) status = "full";
  else if (pct >= BUDGET_RISK_PCT) status = "risk";
  else if (variablePct != null && variablePct - expectedPct > BUDGET_PACE_TOLERANCE) status = "warn";
  else status = "ok";

  return {
    pct,
    remaining: budget - spent,
    status,
    variableSpent,
    variableBudget,
    expectedPct,
    paceDelta,
    dailyRate,
    forecast,
    forecastDelta,
  };
}

// ============================================
// Budget: Ausgaben je Kategorie und Finanzmonat
// ============================================

function addTo(outer, key, ym, amount) {
  let inner = outer.get(key);
  if (!inner) {
    inner = new Map();
    outer.set(key, inner);
  }
  inner.set(ym, (inner.get(ym) || 0) + amount);
}

/**
 * Ausgaben aus dem Monat je Kategorie und Unterkategorie, aufgeteilt nach
 * Finanzmonat. Topf-Ausgaben zählen nicht (sie belasten kein Budget).
 *
 * Die Kategorie-Summe enthält ihre Unterkategorien. Buchungen ohne gültige
 * Kategorie landen unter UNCATEGORIZED_ID; eine unbekannte Unterkategorie zählt
 * nur in ihre Oberkategorie.
 *
 * @param {Array} entries
 * @param {Array} expenseCategories
 * @param {number} monthStartDay
 * @returns {{ byCategory: Map<string, Map<string, number>>,
 *   bySubcategory: Map<string, Map<string, number>>, firstMonth: string|null }}
 *   firstMonth = frühester Finanzmonat mit irgendeiner Buchung im Buch
 */
export function calcCategoryMonthlySpend(entries, expenseCategories, monthStartDay = 1) {
  const subIdsByCat = new Map(
    (expenseCategories || []).map((c) => [c.id, new Set((c.subcategories || []).map((s) => s.id))])
  );
  const byCategory = new Map();
  const bySubcategory = new Map();
  let firstMonth = null;

  for (const e of entries || []) {
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;
    if (firstMonth === null || ym < firstMonth) firstMonth = ym;
    if (e.kind !== "expense" || e.source !== "month") continue;

    const catId = subIdsByCat.has(e.categoryId) ? e.categoryId : UNCATEGORIZED_ID;
    const amount = Number(e.amount || 0);
    addTo(byCategory, catId, ym, amount);
    if (e.subcategoryId && subIdsByCat.get(catId)?.has(e.subcategoryId)) {
      addTo(bySubcategory, e.subcategoryId, ym, amount);
    }
  }

  return { byCategory, bySubcategory, firstMonth };
}

function shiftMonth(yyyymm, n) {
  const [y, m] = yyyymm.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Die letzten `count` abgeschlossenen Finanzmonate vor `refMonth`, älteste
 * zuerst — aber nie vor `firstMonth`: Ein Buch, das erst seit drei Monaten
 * geführt wird, hat einen Ø über drei Monate, nicht über sechs mit drei Nullen.
 *
 * @param {string} refMonth - laufender Finanzmonat "YYYY-MM" (zählt selbst nicht)
 * @param {number} count - Obergrenze; Infinity = alle seit firstMonth
 * @param {string|null} firstMonth
 * @returns {string[]}
 */
export function listCompletedMonths(refMonth, count, firstMonth) {
  if (!refMonth || !firstMonth) return [];
  const months = [];
  let ym = shiftMonth(refMonth, -1);
  while (months.length < count && ym >= firstMonth) {
    months.push(ym);
    ym = shiftMonth(ym, -1);
  }
  return months.reverse();
}

/**
 * Durchschnitt und Median über die genannten Monate. Monate ohne Ausgaben
 * zählen als 0 — sonst sähe eine Kategorie mit einer einzigen großen Buchung
 * im Jahr wie eine monatliche Belastung aus.
 *
 * @param {Map<string, number>|undefined} monthMap
 * @param {string[]} months
 * @returns {{ avg: number, median: number, count: number }|null} null ohne Monate
 */
export function calcSpendStats(monthMap, months) {
  if (!months || months.length === 0) return null;
  const values = months.map((ym) => monthMap?.get(ym) || 0);
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return { avg: round2(avg), median: round2(median), count: values.length };
}

// ============================================
// Budget: Zeilenmodell für View und Dashboard-Card
// ============================================

// Kategorie-Verlauf abzüglich einzelner Unterkategorien — der Rest einer
// Oberkategorie, deren Budgets auf Unterkategorien liegen.
function subtractMonthMaps(base, parts) {
  const result = new Map(base || []);
  for (const part of parts) {
    for (const [ym, amount] of part || []) {
      result.set(ym, (result.get(ym) || 0) - amount);
    }
  }
  return result;
}

/**
 * Baut die Zeilen des Budget-Views: eine Sektion mit, eine ohne Budget.
 *
 * Mit Budget: eine Zeile je budgetierter Ebene — die Oberkategorie oder ihre
 * einzelnen Unterkategorien (hat eine Unterkategorie ein Budget, gilt das der
 * Oberkategorie nicht, siehe canSetParentBudget/canSetSubBudget).
 *
 * Ohne Budget: eine Zeile je Oberkategorie, auch ohne Ausgaben. Liegen Budgets
 * auf einzelnen Unterkategorien, zeigt die Zeile den Rest der Oberkategorie
 * (`isRemainder`) und entfällt, sobald nichts mehr unbudgetiert ist.
 * Unkategorisierte Ausgaben bekommen eine eigene Zeile (`level:
 * "uncategorized"`), damit die Summe der Sektion zu den Ausgaben passt.
 *
 * `monthFilter` leer („Alle Monate“): `spent` ist der Ø pro abgeschlossenem
 * Monat (`isAverage`), nie eine Summe gegen ein Monatsbudget; Fixanteil,
 * Zeitvergleich und Prognose entfallen.
 *
 * `avg6`/`median12` beziehen sich immer auf die abgeschlossenen Monate vor
 * dem heutigen Finanzmonat, unabhängig vom Filter.
 *
 * @param {object} args
 * @param {Array} args.entries - alle Einträge des Buchs (ungefiltert)
 * @param {Array} args.expenseCategories
 * @param {Array} [args.recurringExpenses]
 * @param {string} args.monthFilter - "YYYY-MM" oder "" für alle Monate
 * @param {number} [args.monthStartDay]
 * @param {Date} [args.today] - Bezugstag, nur für Tests abweichend
 * @returns {{ budgeted: Array, unbudgeted: Array, totals: object,
 *   unbudgetedSpent: number, monthInfo: object|null, isAverage: boolean }}
 */
export function buildBudgetRows({
  entries,
  expenseCategories,
  recurringExpenses,
  monthFilter,
  monthStartDay = 1,
  today = new Date(),
}) {
  const categories = expenseCategories || [];
  const spend = calcCategoryMonthlySpend(entries, categories, monthStartDay);
  const currentMonth = getFinancialMonth(toLocalISO(today), monthStartDay)?.yyyymm;
  const months6 = listCompletedMonths(currentMonth, 6, spend.firstMonth);
  const months12 = listCompletedMonths(currentMonth, 12, spend.firstMonth);

  const isAverage = !monthFilter;
  const monthInfo = getFinancialMonthInfo(monthFilter, monthStartDay, today);
  // Ohne einen einzigen abgeschlossenen Monat bleibt nur der laufende.
  let averageMonths = null;
  if (isAverage) {
    const completed = listCompletedMonths(currentMonth, Infinity, spend.firstMonth);
    averageMonths = completed.length > 0 ? completed : [currentMonth];
  }
  const spentOf = (monthMap) =>
    isAverage ? calcSpendStats(monthMap, averageMonths)?.avg || 0 : monthMap?.get(monthFilter) || 0;

  // Fixanteil des gewählten Monats: gebuchte Fixkosten über `recurringId`,
  // offene über die Positionen, die in diesem Monat noch keine Buchung haben.
  const fixedBookedByCat = new Map();
  const fixedBookedBySub = new Map();
  const fixedOpenByCat = new Map();
  const fixedOpenBySub = new Map();
  if (!isAverage) {
    const bookedIds = new Set();
    for (const e of entries || []) {
      if (!e.recurringId || e.kind !== "expense" || e.source !== "month") continue;
      if (getEntryFinancialMonth(e, monthStartDay) !== monthFilter) continue;
      bookedIds.add(e.recurringId);
      const amount = Number(e.amount || 0);
      if (e.categoryId) fixedBookedByCat.set(e.categoryId, (fixedBookedByCat.get(e.categoryId) || 0) + amount);
      if (e.subcategoryId) fixedBookedBySub.set(e.subcategoryId, (fixedBookedBySub.get(e.subcategoryId) || 0) + amount);
    }
    // In einem vergangenen Monat kommt nichts mehr nach.
    if (monthInfo?.isCurrentMonth || monthInfo?.isFutureMonth) {
      for (const item of recurringExpenses || []) {
        if (!item?.id || item.kind === "transfer" || bookedIds.has(item.id)) continue;
        const rate = monthlyRate(item);
        if (item.categoryId) fixedOpenByCat.set(item.categoryId, (fixedOpenByCat.get(item.categoryId) || 0) + rate);
        if (item.subcategoryId) fixedOpenBySub.set(item.subcategoryId, (fixedOpenBySub.get(item.subcategoryId) || 0) + rate);
      }
    }
  }

  const stats = (monthMap) => ({
    avg6: calcSpendStats(monthMap, months6)?.avg ?? null,
    median12: calcSpendStats(monthMap, months12)?.median ?? null,
  });

  const budgeted = [];
  const unbudgeted = [];

  const pushBudgeted = (base, monthMap, fixedBooked, fixedOpen) => {
    const spent = spentOf(monthMap);
    budgeted.push({
      ...base,
      spent,
      isAverage,
      fixedBooked,
      fixedOpen,
      ...stats(monthMap),
      ...calcBudgetMetrics({ budget: base.budget, spent, fixedBooked, fixedOpen }, monthInfo),
    });
  };

  for (const cat of categories) {
    const subs = cat.subcategories || [];
    const budgetedSubs = subs.filter(hasBudget);
    const catMap = spend.byCategory.get(cat.id);

    if (budgetedSubs.length === 0 && hasBudget(cat)) {
      pushBudgeted(
        {
          id: cat.id,
          level: "category",
          categoryId: cat.id,
          subcategoryId: null,
          name: cat.name,
          parentName: null,
          color: cat.color,
          isParent: true,
          budget: cat.budget,
        },
        catMap,
        fixedBookedByCat.get(cat.id) || 0,
        fixedOpenByCat.get(cat.id) || 0
      );
      continue;
    }

    for (const sub of budgetedSubs) {
      pushBudgeted(
        {
          id: sub.id,
          level: "subcategory",
          categoryId: cat.id,
          subcategoryId: sub.id,
          name: sub.name,
          parentName: cat.name,
          color: cat.color,
          isParent: false,
          budget: sub.budget,
        },
        spend.bySubcategory.get(sub.id),
        fixedBookedBySub.get(sub.id) || 0,
        fixedOpenBySub.get(sub.id) || 0
      );
    }

    const isRemainder = budgetedSubs.length > 0;
    const restMap = isRemainder
      ? subtractMonthMaps(catMap, budgetedSubs.map((s) => spend.bySubcategory.get(s.id)))
      : catMap;
    const spent = spentOf(restMap);
    const rowStats = stats(restMap);
    // Sind alle Unterkategorien budgetiert und nichts läuft direkt auf die
    // Oberkategorie, gibt es keinen Rest zu zeigen.
    if (
      isRemainder &&
      budgetedSubs.length === subs.length &&
      spent <= EPS &&
      !(rowStats.avg6 > EPS)
    ) {
      continue;
    }
    unbudgeted.push({
      id: cat.id,
      level: "category",
      categoryId: cat.id,
      subcategoryId: null,
      name: cat.name,
      parentName: null,
      color: cat.color,
      isParent: true,
      isRemainder,
      budget: null,
      spent,
      isAverage,
      ...rowStats,
    });
  }

  // Die ausgemusterte Oberkategorie „Unkategorisiert“ kann noch als echte
  // Kategorie existieren — dann ist sie oben bereits eine normale Zeile.
  if (!categories.some((c) => c.id === UNCATEGORIZED_ID)) {
    const monthMap = spend.byCategory.get(UNCATEGORIZED_ID);
    const spent = spentOf(monthMap);
    const rowStats = stats(monthMap);
    if (spent > EPS || rowStats.avg6 > EPS) {
      unbudgeted.push({
        id: UNCATEGORIZED_ID,
        level: "uncategorized",
        categoryId: null,
        subcategoryId: null,
        name: "Unkategorisiert",
        parentName: null,
        color: "#6b6b6b",
        isParent: true,
        isRemainder: false,
        budget: null,
        spent,
        isAverage,
        ...rowStats,
      });
    }
  }

  budgeted.sort((a, b) => b.pct - a.pct);
  unbudgeted.sort(
    (a, b) => b.spent - a.spent || (b.avg6 || 0) - (a.avg6 || 0) || a.name.localeCompare(b.name, "de")
  );

  const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
  const totalBase = {
    budget: sum(budgeted, "budget"),
    spent: sum(budgeted, "spent"),
    fixedBooked: sum(budgeted, "fixedBooked"),
    fixedOpen: sum(budgeted, "fixedOpen"),
  };

  return {
    budgeted,
    unbudgeted,
    totals: {
      ...totalBase,
      ...calcBudgetMetrics(totalBase, monthInfo),
      overCount: budgeted.filter((r) => r.status === "over").length,
    },
    unbudgetedSpent: sum(unbudgeted, "spent"),
    monthInfo,
    isAverage,
  };
}

// ============================================
// Budget: Pflegen (Vorschlagswerte, Schreiben)
// ============================================

/**
 * Vorschlagswerte für den Bearbeiten-Dialog: Ø 6 Monate und Median 12 Monate
 * je Oberkategorie (inklusive ihrer Unterkategorien) und je Unterkategorie.
 * Gleiche Monate wie `avg6`/`median12` der Zeilen — die Zeilen kennen aber nur
 * ihre eigene Ebene, der Dialog braucht beide.
 *
 * @param {object} args
 * @param {Array} args.entries - alle Einträge des Buchs (ungefiltert)
 * @param {Array} args.expenseCategories
 * @param {number} [args.monthStartDay]
 * @param {Date} [args.today] - Bezugstag, nur für Tests abweichend
 * @returns {{ byCategory: Map<string, {avg6: number|null, median12: number|null}>,
 *   bySubcategory: Map<string, {avg6: number|null, median12: number|null}> }}
 */
export function calcBudgetSuggestions({ entries, expenseCategories, monthStartDay = 1, today = new Date() }) {
  const categories = expenseCategories || [];
  const spend = calcCategoryMonthlySpend(entries, categories, monthStartDay);
  const currentMonth = getFinancialMonth(toLocalISO(today), monthStartDay)?.yyyymm;
  const months6 = listCompletedMonths(currentMonth, 6, spend.firstMonth);
  const months12 = listCompletedMonths(currentMonth, 12, spend.firstMonth);
  const stats = (monthMap) => ({
    avg6: calcSpendStats(monthMap, months6)?.avg ?? null,
    median12: calcSpendStats(monthMap, months12)?.median ?? null,
  });

  const byCategory = new Map();
  const bySubcategory = new Map();
  for (const cat of categories) {
    byCategory.set(cat.id, stats(spend.byCategory.get(cat.id)));
    for (const sub of cat.subcategories || []) {
      bySubcategory.set(sub.id, stats(spend.bySubcategory.get(sub.id)));
    }
  }
  return { byCategory, bySubcategory };
}

const toBudget = (value) => {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) && n > 0 ? round2(n) : null;
};

/**
 * Setzt das Budget einer Ausgaben-Kategorie und hält dabei die Regel
 * „Oberkategorie oder Unterkategorien, nie beides" ein: Die jeweils andere
 * Ebene wird geleert.
 *
 * - `subBudgets` gesetzt: Budgets je Unterkategorie (`{ [subId]: Betrag }`),
 *   das Budget der Oberkategorie entfällt. Fehlende, leere oder nicht positive
 *   Beträge heißen „kein Budget".
 * - sonst: `budget` gilt für die ganze Kategorie, alle Unterkategorie-Budgets
 *   entfallen. `budget` leer oder 0 entfernt das Budget ganz.
 *
 * @param {Array} expenseCategories
 * @param {string} categoryId - ID der Oberkategorie
 * @param {{ budget?: number|null, subBudgets?: object|null }} change
 * @returns {Array} neue Liste; andere Kategorien bleiben dieselben Objekte
 */
export function setCategoryBudgets(expenseCategories, categoryId, { budget = null, subBudgets = null } = {}) {
  return (expenseCategories || []).map((cat) => {
    if (cat.id !== categoryId) return cat;
    return {
      ...cat,
      budget: subBudgets ? null : toBudget(budget),
      subcategories: (cat.subcategories || []).map((sub) => ({
        ...sub,
        budget: subBudgets ? toBudget(subBudgets[sub.id]) : null,
      })),
    };
  });
}

/**
 * Aggregiert Einträge in eine 2-stufige Kategorie-Hierarchie (Top-Kategorie →
 * Unterkategorien), inkl. Unkategorisiert-Split. Gemeinsame Basis für Ausgaben-
 * und Einkommens-Auswertung — siehe die beiden Wrapper unten.
 *
 * @param {Array} entries
 * @param {Array} categories
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @param {number} monthStartDay
 * @param {object} opts
 * @param {(e: object) => boolean} opts.entryFilter - true = Eintrag einbeziehen
 * @param {string} opts.fallbackCategoryId - Ziel-Kategorie für fehlende/ungültige categoryId
 * @param {boolean} [opts.includeBudget] - wenn true, wird `budget` ins Result übernommen
 * @returns {Array}
 */
function calcByHierarchy(entries, categories, month, monthStartDay, { entryFilter, fallbackCategoryId, fallbackName = "Unkategorisiert", fallbackColor = "#6b6b6b", includeBudget = false }) {
  const topMap = new Map();
  const validCategoryIds = new Set((categories || []).map((c) => c.id));

  for (const e of entries || []) {
    if (!entryFilter(e)) continue;
    if (month && getEntryFinancialMonth(e, monthStartDay) !== month) continue;

    const rawCatId = e.categoryId || fallbackCategoryId;
    const catId = validCategoryIds.has(rawCatId) ? rawCatId : fallbackCategoryId;
    const subId = e.subcategoryId || null;
    const amount = Number(e.amount || 0);

    if (!topMap.has(catId)) {
      topMap.set(catId, { value: 0, entryCount: 0, subMap: new Map() });
    }
    const catData = topMap.get(catId);
    catData.value += amount;
    catData.entryCount += 1;

    if (subId) {
      if (!catData.subMap.has(subId)) {
        catData.subMap.set(subId, { value: 0, entryCount: 0 });
      }
      const subData = catData.subMap.get(subId);
      subData.value += amount;
      subData.entryCount += 1;
    }
  }

  const result = [];

  for (const cat of categories || []) {
    const catData = topMap.get(cat.id);
    if (!catData || catData.value <= 0) continue;

    const subcategories = [];
    for (const sub of cat.subcategories || []) {
      const subData = catData.subMap.get(sub.id);
      if (subData && subData.value > 0) {
        subcategories.push({
          id: sub.id,
          name: sub.name,
          value: subData.value,
          entryCount: subData.entryCount,
        });
      }
    }

    const subcatTotal = subcategories.reduce((sum, s) => sum + s.value, 0);
    const uncategorizedValue = catData.value - subcatTotal;
    const uncategorizedCount = catData.entryCount - subcategories.reduce((sum, s) => sum + s.entryCount, 0);

    if (uncategorizedValue > 0.001 && cat.subcategories && cat.subcategories.length > 0) {
      subcategories.unshift({
        id: null,
        name: `${cat.name} (allgemein)`,
        value: uncategorizedValue,
        entryCount: uncategorizedCount,
      });
    }

    const item = {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      value: catData.value,
      entryCount: catData.entryCount,
      subcategories,
    };
    if (includeBudget) item.budget = cat.budget || null;
    result.push(item);
  }

  // Fallback-Bucket (fehlende/ungültige Kategorie) synthetisieren, falls die
  // Fallback-Kategorie nicht (mehr) als echte Kategorie in der Liste existiert
  // (z.B. die ausgemusterte "Unkategorisiert"-Oberkategorie).
  if (!validCategoryIds.has(fallbackCategoryId)) {
    const fbData = topMap.get(fallbackCategoryId);
    if (fbData && fbData.value > 0) {
      const item = {
        id: fallbackCategoryId,
        name: fallbackName,
        color: fallbackColor,
        value: fbData.value,
        entryCount: fbData.entryCount,
        subcategories: [],
      };
      if (includeBudget) item.budget = null;
      result.push(item);
    }
  }

  return result.sort((a, b) => b.value - a.value);
}

/**
 * @param {Array} entries
 * @param {Array} expenseCategories
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @param {number} monthStartDay
 * @returns {Array}
 */
export function calcExpenseByHierarchy(entries, expenseCategories, month = "", monthStartDay = 1) {
  return calcByHierarchy(entries, expenseCategories, month, monthStartDay, {
    entryFilter: (e) => e.kind === "expense" && e.source === "month",
    fallbackCategoryId: "cat_unkategorisiert",
    includeBudget: true,
  });
}

/**
 * @param {Array} entries
 * @param {Array} incomeCategories
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @param {number} monthStartDay
 * @returns {Array}
 */
export function calcIncomeByHierarchy(entries, incomeCategories, month = "", monthStartDay = 1) {
  return calcByHierarchy(entries, incomeCategories, month, monthStartDay, {
    entryFilter: (e) => e.kind === "income",
    fallbackCategoryId: "cat_einnahmen",
  });
}
