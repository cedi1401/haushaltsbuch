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
