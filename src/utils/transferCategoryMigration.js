// src/utils/transferCategoryMigration.js
//
// Migration (Schema 5 → 6): Transfer-Zwecke von Klartext auf IDs.
//
// Vorher war `transferCategories` ein String-Array, und jede Referenz trug den
// Namen: `entry.category` (Transfer/Entnahme), `recurringExpense.transferCategory`,
// `goal.transferCategory` und `entryTemplate.category` (Transfer/Entnahme).
// Nachher ist die Liste `[{ id, name, deleted? }]` und alle vier Stellen tragen
// `transferCategoryId` (null = kein Zweck, z.B. Monatsüberschuss).
//
// Namen, die referenziert werden, aber nicht (mehr) in der Liste stehen — also
// früher gelöschte Zwecke —, werden als `deleted: true` aufgenommen. So behalten
// alte Buchungen ihren Namen und ihren Ist-Stand im Topf, ohne in den
// Auswahllisten wieder aufzutauchen.
//
// Idempotent: Ein bereits migriertes Buch hat keine Legacy-Felder mehr, die
// Liste besteht aus Objekten — ein zweiter Lauf ändert nichts außer neuen
// Array-Referenzen. Deshalb läuft die Migration in normalizeBook() ohne
// Versions-Gate und fängt auch ein Backup mit Mischständen ab.

import { generateId } from "./idUtils.js";
import { fixedCostKind } from "./hbUtils.js";

function isTransferKind(kind) {
  return kind === "transfer" || kind === "withdrawal";
}

// Bestehende Liste in Objekte überführen. Strings bekommen eine neue ID; der
// Legacy-Name "Allgemein" gehörte nie in die Liste und wurde schon bisher
// beim Laden entfernt.
function normalizeList(rawList) {
  const list = [];
  const seenIds = new Set();
  const byName = new Map();

  for (const raw of Array.isArray(rawList) ? rawList : []) {
    let item = null;
    if (typeof raw === "string") {
      const name = raw.trim();
      if (!name || name === "Allgemein") continue;
      if (byName.has(name)) continue;
      item = { id: generateId("tcat"), name };
    } else if (raw && typeof raw === "object" && typeof raw.name === "string") {
      const name = raw.name.trim();
      if (!name) continue;
      const id = typeof raw.id === "string" && raw.id ? raw.id : generateId("tcat");
      if (seenIds.has(id)) continue;
      item = raw.deleted ? { id, name, deleted: true } : { id, name };
    }
    if (!item) continue;
    seenIds.add(item.id);
    list.push(item);
    // Aktive Zwecke gewinnen bei Namensgleichheit gegen gelöschte.
    const prev = byName.get(item.name);
    if (!prev || (prev.deleted && !item.deleted)) byName.set(item.name, item);
  }

  return { list, byName };
}

/**
 * @param {object} book - Buch mit bereits normalisierten Eintrags-`kind`s
 * @returns {{ transferCategories: Array, entries?: Array, recurringExpenses?: Array,
 *             goals?: Array, entryTemplates?: Array }}
 *          Nur die Felder, die als Array vorlagen (plus immer die Liste).
 */
export function migrateTransferCategoryIds(book) {
  const { list, byName } = normalizeList(book?.transferCategories);

  // Name → ID; unbekannte Namen werden als gelöschte Zwecke angelegt.
  function resolve(name) {
    const key = typeof name === "string" ? name.trim() : "";
    if (!key) return null;
    let item = byName.get(key);
    if (!item) {
      item = { id: generateId("tcat"), name: key, deleted: true };
      list.push(item);
      byName.set(key, item);
    }
    return item.id;
  }

  const result = {};

  if (Array.isArray(book?.entries)) {
    result.entries = book.entries.map((e) => {
      if (!e || typeof e !== "object" || !isTransferKind(e.kind)) return e;
      const { category, ...rest } = e;
      if (rest.transferCategoryId === undefined) rest.transferCategoryId = resolve(category);
      return rest;
    });
  }

  if (Array.isArray(book?.recurringExpenses)) {
    result.recurringExpenses = book.recurringExpenses.map((r) => {
      if (!r || typeof r !== "object" || !("transferCategory" in r)) return r;
      const { transferCategory, ...rest } = r;
      if (rest.transferCategoryId === undefined) {
        rest.transferCategoryId = fixedCostKind(r) === "transfer" ? resolve(transferCategory) : null;
      }
      return rest;
    });
  }

  if (Array.isArray(book?.goals)) {
    result.goals = book.goals.map((g) => {
      if (!g || typeof g !== "object" || !("transferCategory" in g)) return g;
      const { transferCategory, ...rest } = g;
      if (rest.transferCategoryId === undefined) rest.transferCategoryId = resolve(transferCategory);
      return rest;
    });
  }

  if (Array.isArray(book?.entryTemplates)) {
    result.entryTemplates = book.entryTemplates.map((t) => {
      if (!t || typeof t !== "object" || !("category" in t)) return t;
      const { category, ...rest } = t;
      if (rest.transferCategoryId === undefined) {
        rest.transferCategoryId = isTransferKind(t.kind) ? resolve(category) : null;
      }
      return rest;
    });
  }

  result.transferCategories = list;
  return result;
}
