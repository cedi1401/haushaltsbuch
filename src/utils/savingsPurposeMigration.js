// src/utils/savingsPurposeMigration.js
//
// Migration (Schema 6 → 7): Zweck = Sparposition (F2, Konzept C, Etappe 7b).
//
// Vorher lebte Zurückgelegtes an drei Stellen: Zwecke `{ id, name }`,
// Transfer-Positionen in `recurringExpenses` (Rücklage/Rückstellung, mit Topf
// und Zweck) und `goals` (Sparziel, mit Topf und optionalem Zweck). Mehrere
// Positionen durften sich einen Zweck teilen, ein Zweck in mehreren Töpfen
// liegen. Nachher ist jeder Zweck genau einer Position und genau einem Topf
// zugeordnet und trägt deren Regel (siehe transferCategoryUtils.js);
// `recurringExpenses` führt nur noch Ausgaben, `goals` entfällt.
//
// Ein „Platz" ist Topf + Zweck — das, was früher einen Ist-Stand hatte. Die
// Regeln:
//
// - Jede Transfer-Position und jedes Sparziel beansprucht ihren Platz. Die
//   erste bekommt ihn samt allen Buchungen; ist der Zweck schon an einen
//   anderen Topf gebunden, entsteht für den Platz ein neuer Zweck.
// - Teilen sich mehrere Positionen einen Platz, bekommt jede weitere einen
//   eigenen Zweck. Ihr folgen nur die Buchungen mit ihrer `recurringId`;
//   Entnahmen und Buchungen ohne Herkunft bleiben beim ersten.
// - Ein Sparziel auf einem Platz mit freier Rücklage verschmilzt mit ihr (die
//   Rate bleibt). Liegt dort eine Rückstellung oder ein Ziel, bekommt es einen
//   eigenen, leeren Zweck.
// - Ein Sparziel auf den ganzen Topf wird zu einem Ziel-Zweck; die Buchungen
//   ohne Zweck in diesem Topf wandern zu ihm (nur für das erste solche Ziel).
// - Ein Anfangsbetrag (`startMode: "custom"`) wird eine echte Transfer-Buchung
//   am Anlagedatum. `startMode`/`startDate` entfallen.
// - Plätze ohne Position (nur Buchungen oder Vorlagen) werden zu Rücklagen
//   ohne Rate; liegt der Zweck schon in einem anderen Topf, entsteht ein
//   neuer „Name (Topf)".
// - Zwecke ohne jede Verwendung landen im ersten Topf.
// - Transfer-Buchungen verlieren `recurringId`; sie ordnen sich ab jetzt über
//   `transferCategoryId` zu.
//
// Bei 1:1-Paaren gewinnt der Positionsname (Entscheidung 17.10.2026). Doppelte
// Namen unter den aktiven Zwecken bekommen am Ende ein „(2)", „(3)" …

import { generateId } from "./idUtils.js";
import { fixedCostKind } from "./hbUtils.js";
import { PURPOSE_RULES } from "./transferCategoryUtils.js";
import { todayISO } from "./formatUtils.js";

function isPotEntry(e) {
  return e && (e.kind === "transfer" || e.kind === "withdrawal");
}

function slotKey(potId, purposeId) {
  return `${potId ?? ""}\u0000${purposeId || ""}`;
}

function nameKey(name) {
  return String(name ?? "").trim().toLocaleLowerCase("de");
}

/**
 * @param {object} book - normalisiertes Buch mit Schema 6 (Zweck-IDs, kinds,
 *        Fixkosten-Positionen mit gültigem Turnus/Fälligkeit, Vorlagen)
 * @param {{ today?: string }} [opts]
 * @returns {{ transferCategories: Array, recurringExpenses: Array,
 *             entries: Array, entryTemplates: Array }}
 */
export function migrateSavingsPurposes(book, opts = {}) {
  const { today = todayISO() } = opts;
  const pots = Array.isArray(book?.pots) ? book.pots : [];
  const potIds = new Set(pots.map((p) => p.id));
  const fallbackPotId = pots[0]?.id ?? null;
  const potName = (id) => pots.find((p) => p.id === id)?.name || "";
  const validPot = (id) => (potIds.has(id) ? id : fallbackPotId);

  // Zwecke in Listenreihenfolge; neue werden hinter ihrem Ursprung einsortiert.
  const purposes = new Map();
  const order = [];
  const inserted = new Map(); // Ursprungs-ID → neue IDs
  for (const p of book?.transferCategories || []) {
    if (!p?.id || purposes.has(p.id)) continue;
    purposes.set(p.id, { ...p });
    order.push(p.id);
  }

  function createPurpose(name, originId, extra = {}) {
    const id = generateId("tcat");
    purposes.set(id, { id, name, ...extra });
    if (originId && purposes.has(originId)) {
      if (!inserted.has(originId)) inserted.set(originId, []);
      inserted.get(originId).push(id);
    } else {
      order.push(id);
    }
    return id;
  }

  const boundPot = new Map(); // Zweck-ID → Topf
  const slotOwner = new Map(); // Platz → Zweck-ID
  const slotMoves = new Map(); // Platz → neue Zweck-ID (alle Buchungen des Platzes)
  const recMoves = new Map(); // recurringId → neue Zweck-ID (nur Monatsraten)

  // Den Platz (Topf + Zweck) übernehmen. Ist der Zweck noch frei, behält er
  // seine ID; sonst entsteht ein neuer, und alle Buchungen des Platzes ziehen um.
  function claimSlot(potId, purposeId, name) {
    const key = slotKey(potId, purposeId);
    let id;
    if (purposeId && purposes.has(purposeId) && !boundPot.has(purposeId)) {
      id = purposeId;
    } else {
      const origin = purposes.get(purposeId);
      id = createPurpose(name, purposeId, origin?.deleted ? { deleted: true } : {});
      slotMoves.set(key, id);
    }
    boundPot.set(id, potId);
    slotOwner.set(key, id);
    return id;
  }

  function assign(id, fields) {
    purposes.set(id, { ...purposes.get(id), ...fields });
  }

  // 1. Transfer-Positionen
  const expenses = [];
  for (const r of book?.recurringExpenses || []) {
    if (fixedCostKind(r) !== "transfer") {
      expenses.push(r);
      continue;
    }
    const potId = validPot(r.potId);
    const purposeId = r.transferCategoryId || null;
    // Ein Zweck braucht einen Namen — sonst verwirft ihn die nächste
    // Normalisierung (transferCategoryMigration).
    const name = String(r.name || "").trim() || purposes.get(purposeId)?.name || "Rücklage";
    let id;
    if (purposeId && !slotOwner.has(slotKey(potId, purposeId))) {
      id = claimSlot(potId, purposeId, name);
    } else {
      id = createPurpose(name, purposeId);
      boundPot.set(id, potId);
      recMoves.set(r.id, id);
    }
    const ruleFields = r.turnus
      ? { rule: "reserve", amount: Number(r.amount) || 0, turnus: r.turnus, faelligkeit: r.faelligkeit }
      : { rule: "free", monthlyRate: Number(r.amount) || null };
    // Eine Position auf einem gelöschten Zweck war sichtbar und buchbar —
    // der Zweck lebt deshalb wieder auf.
    assign(id, {
      name,
      deleted: false,
      potId,
      groupId: r.groupId ?? null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      showInOverview: r.showInOverview !== false,
      ...ruleFields,
    });
  }

  // 2. Sparziele
  const startEntries = [];
  for (const g of book?.goals || []) {
    if (!g || typeof g !== "object") continue;
    const potId = validPot(g.potId);
    const purposeId = g.transferCategoryId || null;
    const key = slotKey(potId, purposeId);
    const goalFields = {
      name: String(g.name || "").trim() || "Sparziel",
      deleted: false,
      potId,
      rule: "goal",
      targetAmount: Number(g.targetAmount) || 0,
      deadline: g.deadline || null,
      createdAt: g.createdAt || null,
      completedAt: g.completedAt || null,
      completedAmount: g.completedAmount ?? null,
    };

    let id;
    const owner = slotOwner.get(key);
    if (!owner) {
      // Auch der Platz „ohne Zweck" (Ziel auf den ganzen Topf) wird so
      // übernommen: claimSlot legt dafür einen neuen Zweck an.
      id = claimSlot(potId, purposeId, goalFields.name);
      assign(id, { monthlyRate: null, groupId: null, tags: [], showInOverview: false, ...goalFields });
    } else if (purposes.get(owner).rule === "free") {
      id = owner;
      const { monthlyRate: _r, ...rest } = goalFields;
      assign(id, rest);
    } else {
      id = createPurpose(goalFields.name, purposeId);
      boundPot.set(id, potId);
      assign(id, { monthlyRate: null, groupId: null, tags: [], showInOverview: false, ...goalFields });
    }

    const startAmount = Number(g.startAmount);
    if (g.startMode === "custom" && Number.isFinite(startAmount) && startAmount > 0) {
      startEntries.push({
        id: generateId("entry"),
        date: g.createdAt || today,
        amount: startAmount,
        transferCategoryId: id,
        categoryId: null,
        subcategoryId: null,
        kind: "transfer",
        potId,
        note: `Anfangsbetrag ${goalFields.name}`,
      });
    }
  }

  // 3. Plätze ohne Position: aus Buchungen und Vorlagen
  function claimUsedSlot(potId, purposeId) {
    if (!purposeId || !purposes.has(purposeId)) return;
    const key = slotKey(potId, purposeId);
    if (slotOwner.has(key)) return;
    const origin = purposes.get(purposeId);
    const name = boundPot.has(purposeId) ? `${origin.name} (${potName(potId) || "Topf"})` : origin.name;
    const id = claimSlot(potId, purposeId, name);
    if (id !== purposeId) assign(id, { potId, rule: "free", monthlyRate: null });
  }

  for (const e of book?.entries || []) {
    if (!isPotEntry(e)) continue;
    if (e.kind === "transfer" && e.recurringId && recMoves.has(e.recurringId)) continue;
    if (!potIds.has(e.potId)) continue;
    claimUsedSlot(e.potId, e.transferCategoryId);
  }
  for (const t of book?.entryTemplates || []) {
    if (!isPotEntry(t) || !potIds.has(t.potId)) continue;
    claimUsedSlot(t.potId, t.transferCategoryId);
  }

  // 4. Buchungen umhängen, recurringId der Transfers entfernen
  const entries = [...(book?.entries || []), ...startEntries].map((e) => {
    if (!isPotEntry(e)) return e;
    let purposeId = e.transferCategoryId || null;
    if (e.kind === "transfer" && e.recurringId && recMoves.has(e.recurringId)) {
      purposeId = recMoves.get(e.recurringId);
    } else {
      purposeId = slotMoves.get(slotKey(e.potId, purposeId)) ?? purposeId;
    }
    const { recurringId: _recurringId, ...rest } = e;
    const next = e.kind === "transfer" ? rest : { ...e };
    next.transferCategoryId = purposeId;
    return next;
  });

  const entryTemplates = (book?.entryTemplates || []).map((t) => {
    if (!isPotEntry(t)) return t;
    const moved = slotMoves.get(slotKey(t.potId, t.transferCategoryId || null));
    return moved ? { ...t, transferCategoryId: moved } : t;
  });

  // 5. Liste zusammensetzen, ungebundene Zwecke in den ersten Topf
  const ids = order.flatMap((id) => [id, ...(inserted.get(id) || [])]);
  const list = ids.map((id) => {
    const p = purposes.get(id);
    const potId = boundPot.get(id) ?? p.potId ?? fallbackPotId;
    return { rule: "free", monthlyRate: null, groupId: null, tags: [], showInOverview: false, ...p, potId };
  });

  return {
    transferCategories: dedupeNames(list),
    recurringExpenses: expenses,
    entries,
    entryTemplates,
  };
}

// Aktive Zwecke brauchen eindeutige Namen (findTransferCategoryByName). Der
// erste behält seinen Namen, weitere bekommen „(2)", „(3)" …
function dedupeNames(list) {
  const taken = new Set();
  return list.map((p) => {
    if (p.deleted) return p;
    let name = p.name;
    let n = 2;
    while (taken.has(nameKey(name))) {
      name = `${p.name} (${n})`;
      n += 1;
    }
    taken.add(nameKey(name));
    return name === p.name ? p : { ...p, name };
  });
}

/**
 * Hält die Zweck-Liste bei jedem Laden konsistent (idempotent, ohne
 * Versions-Gate). Gilt auch für Backups mit Mischständen.
 *
 * - Topf: ein Zweck ohne Topf kommt in den ersten; ein Zweck, dessen Topf
 *   gelöscht wurde, gilt als gelöscht (seine Buchungen zeigen ohnehin auf
 *   einen ungültigen Topf).
 * - Regel: unbekannt → "free". Eine Rückstellung ohne gültigen Betrag, Turnus
 *   oder Fälligkeit wird zur Rücklage mit dem Betrag als Monatsrate — dieselbe
 *   Hygiene-Regel wie früher bei den Fixkosten-Positionen.
 * - Felder anderer Regeln werden entfernt.
 *
 * @param {Array} list - Zwecke (bereits Objekte mit ID)
 * @param {Array} pots
 * @returns {Array}
 */
export function normalizeSavingsPurposes(list, pots) {
  const potIds = new Set((pots || []).map((p) => p.id));
  const fallbackPotId = pots?.[0]?.id ?? null;

  return (list || []).map((raw) => {
    const {
      rule: rawRule, monthlyRate, amount, turnus, faelligkeit,
      categoryId, subcategoryId, targetAmount, deadline, createdAt, completedAt, completedAmount,
      startMode: _startMode, startDate: _startDate, startAmount: _startAmount,
      ...rest
    } = raw;

    let potId = raw.potId || null;
    let deleted = raw.deleted === true;
    if (!potId) potId = fallbackPotId;
    else if (!potIds.has(potId)) deleted = true;

    const base = {
      ...rest,
      potId,
      groupId: raw.groupId ?? null,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      showInOverview: raw.showInOverview === true,
    };
    if (deleted) base.deleted = true;
    else delete base.deleted;

    const rate = Number(monthlyRate);
    const validRate = Number.isFinite(rate) && rate > 0 ? rate : null;
    const rule = PURPOSE_RULES.includes(rawRule) ? rawRule : "free";

    if (rule === "reserve") {
      const a = Number(amount);
      const t = Number(turnus);
      if (Number.isFinite(a) && a > 0 && Number.isFinite(t) && t > 0 && faelligkeit) {
        // Kategorie optional (Ausgaben-Donut); leere Werte werden null, eine
        // Unterkategorie ohne Oberkategorie fällt weg.
        const cat = typeof categoryId === "string" && categoryId ? categoryId : null;
        const sub = cat && typeof subcategoryId === "string" && subcategoryId ? subcategoryId : null;
        return { ...base, rule, amount: a, turnus: t, faelligkeit, categoryId: cat, subcategoryId: sub };
      }
      return { ...base, rule: "free", monthlyRate: Number.isFinite(a) && a > 0 ? a : null };
    }

    if (rule === "goal") {
      const target = Number(targetAmount);
      const completed = Number(completedAmount);
      return {
        ...base,
        rule,
        targetAmount: Number.isFinite(target) && target > 0 ? target : 0,
        deadline: deadline || null,
        monthlyRate: validRate,
        createdAt: createdAt || null,
        completedAt: completedAt || null,
        completedAmount:
          completedAmount !== null && completedAmount !== undefined && Number.isFinite(completed)
            ? completed
            : null,
      };
    }

    return { ...base, rule: "free", monthlyRate: validRate };
  });
}
