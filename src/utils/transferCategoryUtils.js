// src/utils/transferCategoryUtils.js
//
// Transfer-Zwecke sind seit Schema 7 die Sparpositionen des Buchs (F2, Konzept
// C): Ein Zweck gehört genau einem Topf und trägt eine Regel.
//
//   { id, name, potId, rule, deleted?, groupId, tags, showInOverview, ...Regelfelder }
//
//   rule "free"    — Rücklage: optionale `monthlyRate`
//   rule "reserve" — Rückstellung: `amount` (Rechnung je Zyklus), `turnus`,
//                    `faelligkeit`; die Monatsrate wird abgeleitet
//   rule "goal"    — Sparziel: `targetAmount`, `deadline`, optionale
//                    `monthlyRate`, `createdAt`, `completedAt`, `completedAmount`
//
// Buchungen und Vorlagen referenzieren einen Zweck über `transferCategoryId`,
// nie über den Namen — ein Umbenennen ändert damit nur den Eintrag in der Liste.
// Weil der Zweck exklusiv ist, ist sein Netto im Topf zugleich der Ist-Stand
// der Position; es gibt keine geteilten Zwecke mehr.
//
// Gelöschte Zwecke bleiben mit `deleted: true` in der Liste: bestehende
// Buchungen behalten so ihren Namen und ihren Ist-Stand im Topf. Auswahllisten
// zeigen nur die aktiven (getActiveTransferCategories). Wird ein gelöschter Name
// neu angelegt, lebt der alte Zweck mit seiner ID wieder auf — wie früher, als
// ein gleichnamiger String die alten Buchungen automatisch wieder einsammelte.

import { generateId } from "./idUtils.js";

export const MAX_TRANSFER_NAME_LENGTH = 50;

export const PURPOSE_RULES = ["free", "reserve", "goal"];

export function makeTransferCategory(name, potId) {
  return {
    id: generateId("tcat"),
    name: String(name ?? "").trim(),
    potId: potId || null,
    rule: "free",
    monthlyRate: null,
    groupId: null,
    tags: [],
    showInOverview: false,
  };
}

/**
 * Anzeigename für Geld eines Topfs ohne Zweck (Auswahl in den Buchungsdialogen,
 * Überleitungszeile in den Rücklagen, Zusammensetzung in den Töpfen). Als
 * Name einer echten Sparposition gesperrt, sonst wären beide nicht zu
 * unterscheiden.
 */
export const NO_PURPOSE_LABEL = "Ohne Sparposition";

export function isReservedPurposeName(name) {
  return nameKey(name) === nameKey(NO_PURPOSE_LABEL);
}

/** Nur die nicht gelöschten Zwecke — für Auswahllisten und Standardwerte. */
export function getActiveTransferCategories(list) {
  return (list || []).filter((c) => c && !c.deleted);
}

/**
 * Die aktiven Zwecke eines Topfs — die Auswahl beim Buchen. Ein Zweck gehört
 * genau einem Topf; ein Zweck aus einem anderen Topf würde dessen Ist-Stand in
 * zwei Töpfe aufspalten.
 */
export function getPurposesForPot(list, potId) {
  return getActiveTransferCategories(list).filter((c) => c.potId === potId);
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
 * Legt einen Zweck im Topf an. Gibt es einen gelöschten mit demselben Namen im
 * selben Topf, wird dieser reaktiviert (gleiche ID, samt Regel und Buchungen),
 * sonst ein neuer angehängt. Ein gelöschter Zweck aus einem anderen Topf lebt
 * bewusst nicht auf: seine Buchungen liegen dort.
 * @returns {{ list: Array, category: object }}
 */
export function addTransferCategory(list, name, potId) {
  const trimmed = String(name ?? "").trim();
  const current = list || [];
  const revived = current.find(
    (c) => c?.deleted && c.potId === potId && nameKey(c.name) === nameKey(trimmed)
  );
  if (revived) {
    const { deleted: _deleted, ...rest } = revived;
    const category = { ...rest, name: trimmed };
    return { list: current.map((c) => (c.id === revived.id ? category : c)), category };
  }
  const category = makeTransferCategory(trimmed, potId);
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
 * Der Zweck eines Buchungs-Drafts, passend zum Topf. "" heißt „Ohne
 * Sparposition" und ist in jedem Topf eine gültige Wahl (z.B. für den
 * Monatsüberschuss). Ein Zweck aus einem anderen Topf wird ersetzt. Mit
 * `suggest` (Topf gewechselt, frisch auf Transfer/Entnahme gewechselt) gilt
 * auch "" nicht als Wahl: dann wird die erste Sparposition des Topfs
 * vorgeschlagen, falls er eine hat.
 * @param {Array} list - aktive Zwecke
 * @param {string} potId
 * @param {string} id - bisheriger Zweck im Draft
 * @param {{ suggest?: boolean }} [opts]
 */
export function purposeForPot(list, potId, id, { suggest = false } = {}) {
  const choices = getPurposesForPot(list, potId);
  if (id && choices.some((c) => c.id === id)) return id;
  if (!id && !suggest) return "";
  return choices[0]?.id || "";
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

// ── Sparpositionen ────────────────────────────────────────────────────────
// Die Views aus der Zeit vor Schema 7 (Fixkosten, Rückstellungen, Sparziele,
// Trend) rechnen mit Fixkosten-Positionen bzw. Sparziel-Objekten. Die Adapter
// unten bilden einen Zweck auf diese Form ab, damit die Rechenlogik
// (Zyklus, Soll/Ist, Prognose) unverändert bleibt. Die `id` ist die des Zwecks
// — Buchungen ordnen sich darüber per `transferCategoryId` zu.

/**
 * Hat der Zweck eine monatliche Rate? Rückstellungen immer, Rücklagen und
 * Sparziele nur mit gesetzter `monthlyRate`. Genau diese Zwecke stehen in der
 * Fixkosten-Tabelle „Sparraten".
 */
export function hasPurposeRate(purpose) {
  if (!purpose) return false;
  if (purpose.rule === "reserve") return true;
  return Number(purpose.monthlyRate) > 0;
}

/**
 * Prädikat „zählt als Sparen“ für Buchungen. Gespart ist ein Transfer auf
 * einen Spar-Topf — außer er läuft auf eine Rückstellung: Die ist für eine
 * feste Rechnung zurückgelegt, also aufgeschobener Konsum, und zählt wie
 * Transfers auf andere Töpfe unter „Rücklagen“. Rücklagen, Sparziele und
 * Transfers ohne Sparposition folgen dem Topf. So kommt auch ein Buch mit nur
 * einem Topf zu einer ehrlichen Sparquote.
 */
export function makeIsSavingsTransfer(pots, transferCategories) {
  const savingsPotIds = new Set((pots || []).filter((p) => p.isSavings).map((p) => p.id));
  const reserveIds = new Set(
    (transferCategories || []).filter((c) => c.rule === "reserve").map((c) => c.id)
  );
  return (e) =>
    e?.kind === "transfer" && savingsPotIds.has(e.potId) && !reserveIds.has(e.transferCategoryId);
}

/** Aktive Zwecke mit Rate, in Listenreihenfolge. */
export function getRatedPurposes(list) {
  return getActiveTransferCategories(list).filter(hasPurposeRate);
}

/** Aktive Zwecke mit der Regel „Sparziel". */
export function getGoalPurposes(list) {
  return getActiveTransferCategories(list).filter((c) => c.rule === "goal");
}

/**
 * Ein Zweck in der Form einer Transfer-Fixkostenposition: `amount` ist bei
 * einer Rückstellung der Zyklusbetrag, sonst die Monatsrate — dieselbe
 * Bedeutung wie früher in `recurringExpenses`.
 */
export function purposeToFixedItem(purpose) {
  const isReserve = purpose.rule === "reserve";
  return {
    id: purpose.id,
    kind: "transfer",
    rule: purpose.rule,
    name: purpose.name,
    amount: isReserve ? Number(purpose.amount) || 0 : Number(purpose.monthlyRate) || 0,
    potId: purpose.potId,
    transferCategoryId: purpose.id,
    turnus: isReserve ? purpose.turnus ?? null : null,
    faelligkeit: isReserve ? purpose.faelligkeit ?? null : null,
    groupId: purpose.groupId ?? null,
    tags: purpose.tags || [],
    showInOverview: purpose.showInOverview === true,
  };
}

/**
 * Alle Fixkosten-Positionen des Buchs: die Ausgaben aus `recurringExpenses`
 * und die Zwecke mit Rate als Transfer-Positionen.
 */
export function getFixedCostItems(book) {
  return [
    ...(book?.recurringExpenses || []),
    ...getRatedPurposes(book?.transferCategories).map(purposeToFixedItem),
  ];
}

/** Ein Sparziel-Zweck in der Form, die goalUtils erwartet. */
export function purposeToGoal(purpose) {
  return {
    id: purpose.id,
    name: purpose.name,
    potId: purpose.potId,
    transferCategoryId: purpose.id,
    targetAmount: Number(purpose.targetAmount) || 0,
    deadline: purpose.deadline || null,
    monthlyRate: purpose.monthlyRate ?? null,
    createdAt: purpose.createdAt || null,
    completedAt: purpose.completedAt || null,
    completedAmount: purpose.completedAmount ?? null,
  };
}

/**
 * Nimmt einem Zweck die Rate — „Sparrate entfernen" in den Fixkosten. Der Zweck
 * selbst bleibt mit seinen Buchungen bestehen: das Geld liegt weiter im Topf.
 * Eine Rückstellung wird dabei zur freien Rücklage.
 */
export function clearPurposeRate(purpose) {
  const { amount: _amount, turnus: _turnus, faelligkeit: _faelligkeit, ...rest } = purpose;
  return {
    ...rest,
    rule: purpose.rule === "goal" ? "goal" : "free",
    monthlyRate: null,
  };
}

/**
 * Hat der Zweck Buchungen? Dann ist sein Topf festgelegt: ein Wechsel ließe
 * die bisherigen Buchungen im alten Topf zurück und spaltete den Ist-Stand.
 */
export function purposeHasEntries(entries, purposeId) {
  if (!purposeId) return false;
  return (entries || []).some(
    (e) => (e.kind === "transfer" || e.kind === "withdrawal") && e.transferCategoryId === purposeId
  );
}

// Felder, die nur zu einer Art gehören. Beim Wechsel der Art fallen die der
// alten Art weg — sonst bliebe z.B. ein Turnus an einer Rücklage stehen, den
// die Normalisierung beim nächsten Laden wieder zur Rückstellung machte.
const RULE_FIELDS = {
  free: ["monthlyRate"],
  reserve: ["amount", "turnus", "faelligkeit"],
  goal: ["targetAmount", "deadline", "monthlyRate", "createdAt", "completedAt", "completedAmount"],
};
const ALL_RULE_FIELDS = [...new Set(Object.values(RULE_FIELDS).flat())];

/**
 * Schreibt die Felder aus dem Dialog der Rücklagen-View in einen Zweck. Die Art
 * darf wechseln: der Zweck bleibt derselbe (gleiche ID, gleiche Buchungen), nur
 * seine Regel ändert sich.
 * @param {object} purpose
 * Tags und „Im Trend auflisten" werden nur geschrieben, wenn sie mitkommen.
 * @param {{ rule: "free"|"reserve"|"goal", name: string, potId: string,
 *           groupId?: string|null, monthlyRate?: number|null, amount?: number,
 *           turnus?: number, faelligkeit?: string, targetAmount?: number,
 *           deadline?: string|null, tags?: string[], showInOverview?: boolean }} fields
 * @param {string} [today] - Anlagedatum eines neuen Sparziels
 */
export function applySavingsFields(purpose, fields, today) {
  const rest = { ...purpose };
  for (const key of ALL_RULE_FIELDS) delete rest[key];
  const common = {
    ...rest,
    rule: fields.rule,
    name: String(fields.name ?? "").trim(),
    potId: fields.potId,
    groupId: fields.groupId ?? null,
  };
  if (fields.tags !== undefined) common.tags = fields.tags || [];
  if (fields.showInOverview !== undefined) common.showInOverview = fields.showInOverview === true;
  if (fields.rule === "reserve") {
    return { ...common, amount: fields.amount, turnus: fields.turnus, faelligkeit: fields.faelligkeit };
  }
  const rate = Number(fields.monthlyRate) > 0 ? Number(fields.monthlyRate) : null;
  if (fields.rule === "goal") {
    const wasGoal = purpose.rule === "goal";
    return {
      ...common,
      targetAmount: fields.targetAmount,
      deadline: fields.deadline || null,
      monthlyRate: rate,
      createdAt: (wasGoal && purpose.createdAt) || today || null,
      completedAt: wasGoal ? purpose.completedAt ?? null : null,
      completedAmount: wasGoal ? purpose.completedAmount ?? null : null,
    };
  }
  return { ...common, rule: "free", monthlyRate: rate };
}
