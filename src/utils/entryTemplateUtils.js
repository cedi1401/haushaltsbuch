// src/utils/entryTemplateUtils.js
//
// Buchungsvorlagen: Shape, Normalisierung und die zentrale Auflösung von
// Referenzen (Kategorie, Unterkategorie, Transfer-Zweck, Topf) auf den
// Buchungs-Draft. Bewusst eine eigene Datei statt hbUtils.js — analog zu
// potUtils/goalUtils/budgetUtils/costGroupUtils.
//
// Importiert absichtlich NICHT aus hbUtils.js (dort läge sonst ein Zyklus,
// weil normalizeBook von hier importiert).

import { generateId } from "./idUtils.js";
import { FALLBACK_CATEGORY_COLOR } from "./hbPalette.js";

export const TEMPLATE_KINDS = ["expense", "income", "withdrawal", "transfer"];
export const TEMPLATE_NAME_MAX = 50;

function isCategoryKind(kind) {
  return kind === "expense" || kind === "income";
}

/**
 * Erzwingt Shape und Defaults einer Vorlage.
 * @param {unknown} t
 * @returns {object|null} normalisierte Vorlage oder null bei unbrauchbaren Daten
 */
export function normalizeEntryTemplate(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return null;

  const name = typeof t.name === "string" ? t.name.trim().slice(0, TEMPLATE_NAME_MAX) : "";
  if (!name) return null;

  const kind = TEMPLATE_KINDS.includes(t.kind) ? t.kind : "expense";
  const catKind = isCategoryKind(kind);

  // amount ist optional: null bedeutet "Betrag jedes Mal neu erfassen"
  const rawAmount = Number(t.amount);
  const amount =
    t.amount === null || t.amount === undefined || t.amount === "" ||
    !Number.isFinite(rawAmount) || rawAmount <= 0
      ? null
      : rawAmount;

  const rawUsage = Number(t.usageCount);

  return {
    id: typeof t.id === "string" && t.id ? t.id : generateId("tpl"),
    name,
    kind,
    categoryId: catKind && typeof t.categoryId === "string" && t.categoryId ? t.categoryId : null,
    subcategoryId:
      catKind && typeof t.subcategoryId === "string" && t.subcategoryId ? t.subcategoryId : null,
    category: !catKind && typeof t.category === "string" ? t.category : "",
    potId: !catKind && typeof t.potId === "string" ? t.potId : "",
    note: typeof t.note === "string" ? t.note : "",
    amount,
    usageCount: Number.isFinite(rawUsage) && rawUsage > 0 ? Math.floor(rawUsage) : 0,
  };
}

/**
 * Erzeugt eine neue Vorlage mit frischer id.
 * @param {object} fields
 * @returns {object|null} null, wenn kein Name gesetzt ist
 */
export function makeEntryTemplate(fields = {}) {
  return normalizeEntryTemplate({
    usageCount: 0,
    ...fields,
    id: fields.id || generateId("tpl"),
  });
}

/**
 * Übersetzt eine Vorlage in ein Patch für den Buchungs-Draft und löst dabei
 * alle Referenzen gegen den aktuellen Buchstand auf. Einzige Stelle, an der
 * verwaiste Referenzen behandelt werden.
 *
 * @param {object} template
 * @param {{ expenseCategories?: array, incomeCategories?: array,
 *           transferCategories?: array, pots?: array, fallbackPotId?: string }} ctx
 * @returns {object} Draft-Patch (nur gesetzte Felder)
 */
export function templateToDraftPatch(template, ctx = {}) {
  if (!template) return {};
  const {
    expenseCategories = [],
    incomeCategories = [],
    transferCategories = [],
    pots = [],
    fallbackPotId = "",
  } = ctx;

  const kind = TEMPLATE_KINDS.includes(template.kind) ? template.kind : "expense";

  // note wird immer überschrieben (auch mit "") — das ist das definierende
  // Merkmal einer Vorlage.
  const patch = { kind, note: typeof template.note === "string" ? template.note : "" };

  // amount === null → Draft-Betrag unangetastet lassen, damit nichts verloren
  // geht, wenn der Nutzer den Betrag vor dem Klick auf den Chip getippt hat.
  if (template.amount !== null && template.amount !== undefined && Number.isFinite(Number(template.amount))) {
    patch.amount = String(template.amount);
  }

  if (isCategoryKind(kind)) {
    const list = kind === "expense" ? expenseCategories : incomeCategories;
    const cat = list.find((c) => c.id === template.categoryId) || null;
    patch.categoryId = cat ? cat.id : null;
    const sub =
      cat && template.subcategoryId
        ? (cat.subcategories || []).find((s) => s.id === template.subcategoryId)
        : null;
    patch.subcategoryId = sub ? sub.id : null;
  } else {
    // Transfer-Zweck: unbekannt → erster verfügbarer (wie applyKindToDraft)
    patch.category = transferCategories.includes(template.category)
      ? template.category
      : transferCategories[0] || "";
    // Topf: unbekannt → aktueller Draft-Topf, sonst erster Topf
    const fallback = pots.some((p) => p.id === fallbackPotId)
      ? fallbackPotId
      : pots[0]?.id || "";
    patch.potId = pots.some((p) => p.id === template.potId) ? template.potId : fallback;
  }

  return patch;
}

/**
 * Deutsche Warntexte zu verwaisten Referenzen — für den Vorlagen-Manager.
 * @param {object} template
 * @param {object} ctx wie bei templateToDraftPatch
 * @returns {string[]}
 */
export function getTemplateIssues(template, ctx = {}) {
  if (!template) return [];
  const {
    expenseCategories = [],
    incomeCategories = [],
    transferCategories = [],
    pots = [],
  } = ctx;

  const kind = TEMPLATE_KINDS.includes(template.kind) ? template.kind : "expense";
  const issues = [];

  if (isCategoryKind(kind)) {
    const list = kind === "expense" ? expenseCategories : incomeCategories;
    const cat = list.find((c) => c.id === template.categoryId) || null;
    if (template.categoryId && !cat) {
      issues.push("Die hinterlegte Kategorie existiert nicht mehr — beim Anwenden bleibt die Kategorie leer.");
    } else if (
      cat &&
      template.subcategoryId &&
      !(cat.subcategories || []).some((s) => s.id === template.subcategoryId)
    ) {
      issues.push("Die hinterlegte Unterkategorie existiert nicht mehr.");
    }
  } else {
    if (template.category && !transferCategories.includes(template.category)) {
      issues.push(`Der Transfer-Zweck „${template.category}“ existiert nicht mehr.`);
    }
    if (pots.length === 0) {
      issues.push("Es gibt noch keine Töpfe — die Vorlage lässt sich nicht buchen.");
    } else if (template.potId && !pots.some((p) => p.id === template.potId)) {
      issues.push("Der hinterlegte Topf existiert nicht mehr.");
    }
  }

  return issues;
}

/**
 * Farbe für den Vorlagen-Chip. Wird bewusst aus der aufgelösten Kategorie
 * abgeleitet statt in der Vorlage gespeichert, damit Chip- und Kategoriefarbe
 * beim Umfärben nicht auseinanderlaufen.
 * @param {object} template
 * @param {object} ctx wie bei templateToDraftPatch
 * @returns {string} CSS-Farbe
 */
export function getTemplateColor(template, ctx = {}) {
  if (!template) return FALLBACK_CATEGORY_COLOR;
  const { expenseCategories = [], incomeCategories = [] } = ctx;
  const kind = TEMPLATE_KINDS.includes(template.kind) ? template.kind : "expense";
  if (!isCategoryKind(kind)) return "var(--accent)";
  const list = kind === "expense" ? expenseCategories : incomeCategories;
  const cat = list.find((c) => c.id === template.categoryId) || null;
  return cat?.color || FALLBACK_CATEGORY_COLOR;
}
