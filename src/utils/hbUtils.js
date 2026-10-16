// src/utils/hbUtils.js
//
// Allgemeine Helfer zum Datenmodell. Formate stehen in formatUtils.js,
// Standardwerte in bookDefaults.js, Normalisierung/Migration in bookMigration.js.
//
// Importiert absichtlich nichts aus bookMigration.js — die Migration nutzt
// fixedCostKind und validateMonthStartDay von hier.

export function validateMonthStartDay(day) {
  return Math.max(1, Math.min(28, Number(day) || 1));
}

export function sumAmounts(entries, predicate = () => true) {
  return (entries || []).filter(predicate).reduce((s, e) => s + Number(e.amount || 0), 0);
}

// ============================================
// Hilfsfunktionen für das hierarchische Modell
// ============================================

/**
 * Findet eine Oberkategorie anhand ihrer ID (expense oder income).
 * @returns {object|null}
 */
export function findCategoryById(expenseCategories, incomeCategories, categoryId) {
  if (!categoryId) return null;
  const all = [...(expenseCategories || []), ...(incomeCategories || [])];
  return all.find((c) => c.id === categoryId) || null;
}

/**
 * Gibt einen lesbaren Kategorie-Label zurück.
 * Beispiel: "Wohnen > Miete / Wohngeld" oder "Unkategorisiert"
 */
export function getCategoryLabel(expenseCategories, incomeCategories, categoryId, subcategoryId) {
  if (!categoryId) return "Unkategorisiert";
  const parent = findCategoryById(expenseCategories, incomeCategories, categoryId);
  if (!parent) return "Unkategorisiert";
  if (subcategoryId) {
    const sub = (parent.subcategories || []).find((s) => s.id === subcategoryId);
    if (sub) return `${parent.name} > ${sub.name}`;
  }
  return parent.name;
}

/**
 * Kategorie-Anzeige einer Buchung: bei Einnahmen/Ausgaben der Name der
 * Oberkategorie aus `categoryId`, bei Transfers/Entnahmen der Zweck.
 * Das Legacy-Feld `category` ist bei Ausgaben nicht verlässlich — Fixkosten-
 * Buchungen setzen es gar nicht, und nach einem Umbenennen ist es veraltet.
 */
export function getEntryCategoryName(entry, expenseCategories, incomeCategories) {
  if (entry?.kind === "expense" || entry?.kind === "income") {
    const parent = findCategoryById(expenseCategories, incomeCategories, entry.categoryId);
    if (parent) return parent.name;
  }
  return entry?.category || "";
}

// ============================================
// Fixkosten: Spaltenzuordnung (expense | transfer)
// ============================================

/**
 * Normalisiert das `kind` einer Fixkosten-Position oder -Gruppe auf eine der
 * beiden Spalten des Fixkosten-Views. Alles außer "transfer" gilt als Ausgabe.
 * @param {{kind?: string}|null|undefined} entity
 * @returns {"expense"|"transfer"}
 */
export function fixedCostKind(entity) {
  return entity?.kind === "transfer" ? "transfer" : "expense";
}
