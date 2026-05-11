// src/utils/budgetUtils.js
import { getEntryFinancialMonth } from "./financialMonthUtils.js";

/**
 * Aggregiert die tatsächlichen Ausgaben pro Budget-Kategorie für den aktuellen Monat.
 * Gibt alle Kategorien/Unterkategorien zurück, denen ein Budget zugewiesen ist —
 * auch solche mit 0 Ausgaben im Monat.
 * Sortierung: höchste Auslastung zuerst.
 *
 * @param {Array} filteredEntries - bereits monatsgefilterte Einträge
 * @param {Array} expenseCategories
 * @returns {Array} budgetItems: { id, name, parentName, color, budget, spent, isParent }
 */
export function calcBudgetStatus(filteredEntries, expenseCategories) {
  const topMap = new Map();
  const validIds = new Set((expenseCategories || []).map((c) => c.id));

  for (const e of filteredEntries || []) {
    if (e.kind !== "expense" || e.source !== "month") continue;
    const catId = validIds.has(e.categoryId) ? e.categoryId : null;
    if (!catId) continue;
    const amount = Number(e.amount || 0);

    if (!topMap.has(catId)) topMap.set(catId, { value: 0, subMap: new Map() });
    const catData = topMap.get(catId);
    catData.value += amount;

    if (e.subcategoryId) {
      if (!catData.subMap.has(e.subcategoryId)) catData.subMap.set(e.subcategoryId, { value: 0 });
      catData.subMap.get(e.subcategoryId).value += amount;
    }
  }

  const result = [];

  for (const cat of expenseCategories || []) {
    const catData = topMap.get(cat.id);
    const anySubHasBudget = (cat.subcategories || []).some(
      (sub) => sub.budget != null && sub.budget > 0
    );

    if (!anySubHasBudget && cat.budget != null && cat.budget > 0) {
      result.push({
        id: cat.id,
        name: cat.name,
        parentName: null,
        color: cat.color,
        budget: cat.budget,
        spent: catData?.value || 0,
        isParent: true,
      });
    }

    for (const sub of cat.subcategories || []) {
      if (sub.budget != null && sub.budget > 0) {
        result.push({
          id: sub.id,
          name: sub.name,
          parentName: cat.name,
          color: cat.color,
          budget: sub.budget,
          spent: catData?.subMap.get(sub.id)?.value || 0,
          isParent: false,
        });
      }
    }
  }

  return result.sort((a, b) => b.spent / b.budget - a.spent / a.budget);
}

/**
 * @param {Array} entries
 * @param {Array} expenseCategories
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @param {number} monthStartDay
 * @returns {Array}
 */
export function calcExpenseByHierarchy(entries, expenseCategories, month = "", monthStartDay = 1) {
  const topMap = new Map();
  const validCategoryIds = new Set((expenseCategories || []).map((c) => c.id));

  for (const e of entries || []) {
    if (e.kind !== "expense" || e.source !== "month") continue;
    if (month && getEntryFinancialMonth(e, monthStartDay) !== month) continue;

    const rawCatId = e.categoryId || "cat_unkategorisiert";
    const catId = validCategoryIds.has(rawCatId) ? rawCatId : "cat_unkategorisiert";
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

  for (const cat of expenseCategories || []) {
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

    result.push({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      budget: cat.budget || null,
      value: catData.value,
      entryCount: catData.entryCount,
      subcategories,
    });
  }

  return result.sort((a, b) => b.value - a.value);
}

/**
 * @param {Array} entries
 * @param {Array} incomeCategories
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @param {number} monthStartDay
 * @returns {Array}
 */
export function calcIncomeByHierarchy(entries, incomeCategories, month = "", monthStartDay = 1) {
  const topMap = new Map();
  const validCategoryIds = new Set((incomeCategories || []).map((c) => c.id));

  for (const e of entries || []) {
    if (e.kind !== "income") continue;
    if (month && getEntryFinancialMonth(e, monthStartDay) !== month) continue;

    const rawCatId = e.categoryId || "cat_einnahmen";
    const catId = validCategoryIds.has(rawCatId) ? rawCatId : "cat_einnahmen";
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

  for (const cat of incomeCategories || []) {
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

    result.push({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      value: catData.value,
      entryCount: catData.entryCount,
      subcategories,
    });
  }

  return result.sort((a, b) => b.value - a.value);
}
