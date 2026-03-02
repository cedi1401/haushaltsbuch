// src/utils/budgetUtils.js
// Budget-Berechnungen für Kategorie-Limits

/**
 * Berechnet den Verbrauch pro Kategorie für einen Monat
 * @param {Array} entries - Alle Einträge
 * @param {string} month - Format "YYYY-MM" oder "" für alle
 * @returns {Map<string, number>} - Kategorie-Name -> Summe
 */
export function calcExpenseByCategory(entries, month = "") {
  const map = new Map();

  for (const e of entries || []) {
    // Nur normale Ausgaben (aus Monatsbudget) zählen
    if (e.kind !== "expense" || e.source !== "month") continue;
    // Monatsfilter anwenden
    if (month && (!e.date || !e.date.startsWith(month))) continue;

    const cat = e.category || "Allgemein";
    const prev = map.get(cat) || 0;
    map.set(cat, prev + Number(e.amount || 0));
  }

  return map;
}

/**
 * Berechnet Budget-Status für alle Kategorien mit Budget
 * @param {Array} categories - Kategorie-Objekte [{name, budget}, ...]
 * @param {Map} expenseMap - Verbrauch pro Kategorie (von calcExpenseByCategory)
 * @returns {Array} - [{name, budget, spent, percent, status}, ...]
 */
export function calcBudgetStatus(categories, expenseMap) {
  return (categories || [])
    .filter((cat) => cat && cat.budget && cat.budget > 0)
    .map((cat) => {
      const spent = expenseMap.get(cat.name) || 0;
      const percent = Math.round((spent / cat.budget) * 100);

      // Status: ok (grün), warning (gelb), over (rot)
      let status = "ok";
      if (percent >= 100) {
        status = "over";
      } else if (percent >= 80) {
        status = "warning";
      }

      return {
        name: cat.name,
        budget: cat.budget,
        spent,
        percent,
        status,
      };
    });
}

/**
 * Berechnet Ausgaben hierarchisch (Oberkategorien mit Unterkategorien).
 * Einmaliger Pass über alle Einträge (O(n)).
 *
 * @param {Array} entries - Alle Einträge
 * @param {Array} expenseCategories - Hierarchisches Array [{id, name, color, subcategories}, ...]
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @returns {Array} - [{id, name, color, value, entryCount, subcategories: [{id, name, value, entryCount}]}]
 *                    Sortiert absteigend nach value, nur Kategorien mit value > 0
 */
export function calcExpenseByHierarchy(entries, expenseCategories, month = "") {
  // Einmaliger Pass: Map aufbauen
  // topMap: categoryId -> { value, entryCount, subMap: Map<subcategoryId, {value, entryCount}> }
  const topMap = new Map();

  // Bekannte Category-IDs für schnellen Fallback-Check
  const validCategoryIds = new Set((expenseCategories || []).map((c) => c.id));

  for (const e of entries || []) {
    if (e.kind !== "expense" || e.source !== "month") continue;
    if (month && (!e.date || !e.date.startsWith(month))) continue;

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

  // Ergebnis-Array in der Reihenfolge der expenseCategories aufbauen
  const result = [];

  for (const cat of expenseCategories || []) {
    const catData = topMap.get(cat.id);
    if (!catData || catData.value <= 0) continue;

    // Unterkategorien aufbauen
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

    // Nicht-subkategorisierte Ausgaben (direkt auf Oberkategorie)
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
 * Berechnet Einnahmen hierarchisch (analog zu calcExpenseByHierarchy).
 *
 * @param {Array} entries - Alle Einträge
 * @param {Array} incomeCategories - Hierarchisches Array für Einnahmen
 * @param {string} month - Format "YYYY-MM" oder "" für alle Monate
 * @returns {Array} - [{id, name, color, value, entryCount, subcategories: [...]}]
 */
export function calcIncomeByHierarchy(entries, incomeCategories, month = "") {
  const topMap = new Map();
  const validCategoryIds = new Set((incomeCategories || []).map((c) => c.id));

  for (const e of entries || []) {
    if (e.kind !== "income") continue;
    if (month && (!e.date || !e.date.startsWith(month))) continue;

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
