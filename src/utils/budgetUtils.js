// src/utils/budgetUtils.js
import { getEntryFinancialMonth, getFinancialMonth, getFinancialMonthInfo } from "./financialMonthUtils.js";
import { normalizeCategoryBudgets, toLocalISO } from "./hbUtils.js";

// ============================================
// Budget: Status
// ============================================

export const UNCATEGORIZED_ID = "cat_unkategorisiert";

// Beträge sind auf Rappen/Cent genau — alles darunter ist Rechenrauschen.
const EPS = 0.005;
// Ab dieser Auslastung gilt ein Budget als knapp.
export const BUDGET_RISK_PCT = 0.95;

export const BUDGET_STATUS_LABEL = {
  ok: "Im Budget",
  risk: "Knapp",
  full: "Ausgeschöpft",
  over: "Überschritten",
};

// Ton für Meter und Kennzahlen; die Pillen färbt .hb-budget-status-pill--*.
export const BUDGET_STATUS_COLOR = {
  ok: "var(--green)",
  risk: "var(--yellow)",
  full: "var(--muted)",
  over: "var(--red)",
};

const hasBudget = (node) => node?.budget != null && node.budget > 0;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Kennzahlen eines Budgets für einen Monat. Der Status hängt allein am
 * Verbrauch — einen Zeitvergleich oder eine Prognose gibt es bewusst nicht.
 *
 * @param {{ budget: number, spent: number }} item
 * @returns {{ pct: number, remaining: number, status: string }}
 */
export function calcBudgetMetrics({ budget, spent }) {
  const pct = budget > 0 ? spent / budget : 0;

  let status;
  if (spent > budget + EPS) status = "over";
  else if (spent >= budget - EPS) status = "full";
  else if (pct >= BUDGET_RISK_PCT) status = "risk";
  else status = "ok";

  return { pct, remaining: budget - spent, status };
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
 *   bySubcategory: Map<string, Map<string, number>> }}
 */
export function calcCategoryMonthlySpend(entries, expenseCategories, monthStartDay = 1) {
  const subIdsByCat = new Map(
    (expenseCategories || []).map((c) => [c.id, new Set((c.subcategories || []).map((s) => s.id))])
  );
  const byCategory = new Map();
  const bySubcategory = new Map();

  for (const e of entries || []) {
    if (e.kind !== "expense" || e.source !== "month") continue;
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;

    const catId = subIdsByCat.has(e.categoryId) ? e.categoryId : UNCATEGORIZED_ID;
    const amount = Number(e.amount || 0);
    addTo(byCategory, catId, ym, amount);
    if (e.subcategoryId && subIdsByCat.get(catId)?.has(e.subcategoryId)) {
      addTo(bySubcategory, e.subcategoryId, ym, amount);
    }
  }

  return { byCategory, bySubcategory };
}

// ============================================
// Budget: Zeilenmodell für View und Dashboard-Card
// ============================================

/**
 * Baut das Modell des Budget-Views: Kategorien mit und ohne Budget.
 *
 * Mit Budget: eine Zeile je Oberkategorie mit Budget. Ihr `spent` enthält alle
 * Ausgaben der Kategorie, auch die ihrer Unterkategorien. Unter `subs` hängen
 * alle Unterkategorien mit ihren eigenen Ausgaben; hat eine davon ein Budget,
 * trägt sie dieselben Kennzahlen wie die Oberkategorie, sonst bleiben sie
 * null. `allocated` ist die Summe der Unterkategorie-Budgets (nie mehr als das
 * Budget, siehe normalizeCategoryBudgets), `directSpent` das, was ohne
 * Unterkategorie direkt auf die Oberkategorie gebucht wurde.
 *
 * Ohne Budget: eine Zeile je Oberkategorie ohne Budget, auch ohne Ausgaben.
 * Unkategorisierte Ausgaben bekommen eine eigene Zeile (`level:
 * "uncategorized"`), damit die Summe der Sektion zu den Ausgaben passt.
 *
 * Gemessen wird immer ein einzelner Finanzmonat. Ohne `monthFilter` („Alle
 * Monate“) ist das der laufende — ein Budget gilt pro Monat, eine Summe über
 * alle Monate hätte kein Gegenstück.
 *
 * @param {object} args
 * @param {Array} args.entries - alle Einträge des Buchs (ungefiltert)
 * @param {Array} args.expenseCategories
 * @param {string} [args.monthFilter] - "YYYY-MM"; leer = laufender Finanzmonat
 * @param {number} [args.monthStartDay]
 * @param {Date} [args.today] - Bezugstag, nur für Tests abweichend
 * @returns {{ budgeted: Array, unbudgeted: Array, totals: object,
 *   unbudgetedSpent: number, month: string, monthInfo: object|null }}
 */
export function buildBudgetRows({
  entries,
  expenseCategories,
  monthFilter = "",
  monthStartDay = 1,
  today = new Date(),
}) {
  const categories = expenseCategories || [];
  const spend = calcCategoryMonthlySpend(entries, categories, monthStartDay);
  const month = monthFilter || getFinancialMonth(toLocalISO(today), monthStartDay)?.yyyymm;
  const monthInfo = getFinancialMonthInfo(month, monthStartDay, today);
  const spentOf = (monthMap) => round2(monthMap?.get(month) || 0);

  const budgeted = [];
  const unbudgeted = [];

  for (const cat of categories) {
    const spent = spentOf(spend.byCategory.get(cat.id));
    const base = {
      id: cat.id,
      level: "category",
      categoryId: cat.id,
      subcategoryId: null,
      name: cat.name,
      parentName: null,
      color: cat.color,
      isParent: true,
    };

    if (!hasBudget(cat)) {
      unbudgeted.push({ ...base, budget: null, spent });
      continue;
    }

    let subSpent = 0;
    let allocated = 0;
    const subs = (cat.subcategories || []).map((sub) => {
      const subBudget = hasBudget(sub) ? sub.budget : null;
      const own = spentOf(spend.bySubcategory.get(sub.id));
      subSpent += own;
      allocated += subBudget || 0;
      return {
        id: sub.id,
        level: "subcategory",
        categoryId: cat.id,
        subcategoryId: sub.id,
        name: sub.name,
        parentName: cat.name,
        color: cat.color,
        isParent: false,
        budget: subBudget,
        spent: own,
        ...(subBudget != null
          ? calcBudgetMetrics({ budget: subBudget, spent: own })
          : { pct: null, remaining: null, status: null }),
      };
    });

    budgeted.push({
      ...base,
      budget: cat.budget,
      spent,
      ...calcBudgetMetrics({ budget: cat.budget, spent }),
      allocated: round2(allocated),
      directSpent: round2(spent - subSpent),
      subs,
    });
  }

  // Die ausgemusterte Oberkategorie „Unkategorisiert“ kann noch als echte
  // Kategorie existieren — dann ist sie oben bereits eine normale Zeile.
  if (!categories.some((c) => c.id === UNCATEGORIZED_ID)) {
    const spent = spentOf(spend.byCategory.get(UNCATEGORIZED_ID));
    if (spent > EPS) {
      unbudgeted.push({
        id: UNCATEGORIZED_ID,
        level: "uncategorized",
        categoryId: null,
        subcategoryId: null,
        name: "Unkategorisiert",
        parentName: null,
        color: "#6b6b6b",
        isParent: true,
        budget: null,
        spent,
      });
    }
  }

  budgeted.sort((a, b) => b.pct - a.pct);
  unbudgeted.sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, "de"));

  const sum = (rows, key) => round2(rows.reduce((s, r) => s + (r[key] || 0), 0));
  const totalBase = { budget: sum(budgeted, "budget"), spent: sum(budgeted, "spent") };

  return {
    budgeted,
    unbudgeted,
    totals: {
      ...totalBase,
      ...calcBudgetMetrics(totalBase),
      overCount: budgeted.filter((r) => r.status === "over").length,
    },
    unbudgetedSpent: sum(unbudgeted, "spent"),
    month,
    monthInfo,
  };
}

// ============================================
// Budget: Pflegen
// ============================================

const toBudget = (value) => {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) && n > 0 ? round2(n) : null;
};

/**
 * Setzt das Budget einer Ausgaben-Kategorie und, optional, die Aufteilung auf
 * ihre Unterkategorien.
 *
 * - `budget` leer oder 0 entfernt das Budget ganz, samt aller
 *   Unterkategorie-Budgets: ohne Rahmen gibt es nichts aufzuteilen.
 * - `subBudgets` (`{ [subId]: Betrag }`) ersetzt die Aufteilung vollständig.
 *   Fehlende, leere oder nicht positive Beträge heißen „kein Budget".
 *
 * Die Summe der Unterkategorien darf das Budget nicht übersteigen. Das prüft
 * der Dialog vor dem Speichern; käme es trotzdem dazu, hebt
 * `normalizeCategoryBudgets` das Budget auf die Summe an.
 *
 * @param {Array} expenseCategories
 * @param {string} categoryId - ID der Oberkategorie
 * @param {{ budget?: number|null, subBudgets?: object|null }} change
 * @returns {Array} neue Liste; andere Kategorien bleiben dieselben Objekte
 */
export function setCategoryBudgets(expenseCategories, categoryId, { budget = null, subBudgets = null } = {}) {
  const parentBudget = toBudget(budget);
  const next = (expenseCategories || []).map((cat) => {
    if (cat.id !== categoryId) return cat;
    return {
      ...cat,
      budget: parentBudget,
      subcategories: (cat.subcategories || []).map((sub) => ({
        ...sub,
        budget: parentBudget != null ? toBudget(subBudgets?.[sub.id]) : null,
      })),
    };
  });
  return normalizeCategoryBudgets(next);
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
