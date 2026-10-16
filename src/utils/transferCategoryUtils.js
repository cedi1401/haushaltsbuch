// src/utils/transferCategoryUtils.js
//
// Transfer-Zwecke: { id, name, deleted? }. Buchungen, Fixkosten, Sparziele und
// Vorlagen referenzieren einen Zweck über `transferCategoryId`, nie über den
// Namen — ein Umbenennen ändert damit nur den Eintrag in der Liste.
//
// Gelöschte Zwecke bleiben mit `deleted: true` in der Liste: bestehende
// Buchungen behalten so ihren Namen und ihren Ist-Stand im Topf. Auswahllisten
// zeigen nur die aktiven (getActiveTransferCategories). Wird ein gelöschter Name
// neu angelegt, lebt der alte Zweck mit seiner ID wieder auf — wie früher, als
// ein gleichnamiger String die alten Buchungen automatisch wieder einsammelte.

import { generateId } from "./idUtils.js";

export const MAX_TRANSFER_NAME_LENGTH = 50;

export function makeTransferCategory(name) {
  return { id: generateId("tcat"), name: String(name ?? "").trim() };
}

/** Nur die nicht gelöschten Zwecke — für Auswahllisten und Standardwerte. */
export function getActiveTransferCategories(list) {
  return (list || []).filter((c) => c && !c.deleted);
}

export function findTransferCategory(list, id) {
  if (!id) return null;
  return (list || []).find((c) => c?.id === id) || null;
}

/** Name zu einer ID, auch für gelöschte Zwecke; "" wenn unbekannt oder leer. */
export function getTransferCategoryName(list, id) {
  return findTransferCategory(list, id)?.name || "";
}

function nameKey(name) {
  return String(name ?? "").trim().toLocaleLowerCase("de");
}

/**
 * Sucht einen Zweck über den Namen (ohne Groß-/Kleinschreibung).
 * @param {Array} list
 * @param {string} name
 * @param {{ includeDeleted?: boolean, excludeId?: string }} [opts]
 */
export function findTransferCategoryByName(list, name, opts = {}) {
  const { includeDeleted = false, excludeId = null } = opts;
  const key = nameKey(name);
  if (!key) return null;
  return (
    (list || []).find(
      (c) =>
        c &&
        c.id !== excludeId &&
        (includeDeleted || !c.deleted) &&
        nameKey(c.name) === key
    ) || null
  );
}

/**
 * Legt einen Zweck an. Gibt es einen gelöschten mit demselben Namen, wird
 * dieser reaktiviert (gleiche ID), sonst ein neuer angehängt.
 * @returns {{ list: Array, category: object }}
 */
export function addTransferCategory(list, name) {
  const trimmed = String(name ?? "").trim();
  const current = list || [];
  const revived = findTransferCategoryByName(current, trimmed, { includeDeleted: true });
  if (revived && revived.deleted) {
    const category = { id: revived.id, name: trimmed };
    return { list: current.map((c) => (c.id === revived.id ? category : c)), category };
  }
  const category = makeTransferCategory(trimmed);
  return { list: [...current, category], category };
}

export function renameTransferCategory(list, id, name) {
  const trimmed = String(name ?? "").trim();
  return (list || []).map((c) => (c?.id === id ? { ...c, name: trimmed } : c));
}

export function deleteTransferCategory(list, id) {
  return (list || []).map((c) => (c?.id === id ? { ...c, deleted: true } : c));
}

/** ID, wenn sie unter den gegebenen (aktiven) Zwecken ist, sonst die erste. */
export function validTransferCategoryId(list, id) {
  const items = list || [];
  if (id && items.some((c) => c.id === id)) return id;
  return items[0]?.id || "";
}

/**
 * Optionen für ein Zweck-<select>: die wählbaren Zwecke (Standard: alle
 * aktiven), plus der aktuell gewählte, falls er gelöscht ist — sonst zeigte
 * das Feld still einen anderen Zweck an, als gespeichert würde.
 * @param {Array} list - volle Liste inkl. gelöschter
 * @param {string} selectedId
 * @param {Array} [choices] - wählbare Zwecke, z.B. nur die eines Topfs
 * @returns {Array<{ id: string, label: string }>}
 */
export function getTransferCategoryOptions(list, selectedId, choices = getActiveTransferCategories(list)) {
  const options = choices.map((c) => ({ id: c.id, label: c.name }));
  if (options.some((o) => o.id === selectedId)) return options;
  const selected = findTransferCategory(list, selectedId);
  if (selected?.deleted) options.push({ id: selected.id, label: `${selected.name} (gelöscht)` });
  return options;
}
