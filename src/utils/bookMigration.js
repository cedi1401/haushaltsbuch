// src/utils/bookMigration.js
//
// Normalisierung und Migration der Bücher: normalizeBook() läuft bei jedem
// Laden und beim Backup-Import und bringt jedes Buch auf CURRENT_SCHEMA_VERSION.

import { CUSTOM_CATEGORY_PALETTE } from "./hbPalette.js";
import { normalizeEntryTemplate } from "./entryTemplateUtils.js";
import { normalizeInvestments } from "./investmentModel.js";
import { DEFAULT_POTS, DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./bookDefaults.js";
import { fixedCostKind, validateMonthStartDay } from "./hbUtils.js";
import { migrateTransferCategoryIds } from "./transferCategoryMigration.js";
import { migrateSavingsPurposes, normalizeSavingsPurposes } from "./savingsPurposeMigration.js";

// 3 = Fixkosten-Gruppen haben ein festes `kind` ("expense" | "transfer") und
//     damit eine feste Spalte im Fixkosten-View (siehe migrateFixedCostKinds).
// 4 = Einträge tragen `recurringId` — die Herkunftskennung ihrer Fixkosten-
//     Position (siehe stampRecurringIds).
// 5 = Bücher tragen `investments` (Depots, Assets, Transaktionen, Snapshots).
// 6 = Transfer-Zwecke sind Objekte mit ID, Referenzen laufen über
//     `transferCategoryId` (siehe transferCategoryMigration.js).
// 7 = Zweck = Sparposition: Zwecke tragen Topf und Regel, Transfer-Positionen
//     und Sparziele sind in sie aufgegangen; `goals` entfällt,
//     `recurringExpenses` führt nur noch Ausgaben (siehe
//     savingsPurposeMigration.js).
export const CURRENT_SCHEMA_VERSION = 7;

/** Returns true if the book has not yet been migrated to the current schema. */
export function bookNeedsMigration(book) {
  return !book || typeof book.schemaVersion !== "number" || book.schemaVersion < CURRENT_SCHEMA_VERSION;
}

// Intern — liefert die stabile ID von Custom-Kategorien (makeCustomCategoryId).
function hashStringFNV1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============================================
// Rückwärtskompatibilität: altes flaches Format
// ============================================

// Wird noch beim Import alter Backups benötigt (Migration)
const DEFAULT_CATEGORIES = [
  { name: "Allgemein", budget: null },
  { name: "Miete", budget: null },
  { name: "Lebensmittel", budget: null },
  { name: "Freizeit", budget: null },
];

// ============================================
// Migration: Legacy-Kategorienamen → neue IDs
// ============================================

// Migration: entfernte Unterkategorie-IDs → Ersatz-IDs
const REMOVED_SUB_MAP = new Map([
  ["sub_bausparen", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_festgeld_tagesgeld", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_private_rente", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_kapitallebensversicherung", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_bueromaterial", { categoryId: "cat_shopping", subcategoryId: null }],
  ["sub_kontentransfer", { categoryId: "cat_bank", subcategoryId: null }],
  // Umbenannte IDs (alte ID → neue ID)
  ["sub_lebensmittel_getraenke", { categoryId: "cat_lebenshaltung", subcategoryId: "sub_lebensmittel_zuhause" }],
  ["sub_haustier", { categoryId: "cat_lebenshaltung", subcategoryId: "sub_haustierbedarf" }],
  ["sub_kirche_spende", { categoryId: "cat_freizeit", subcategoryId: "sub_spenden" }],
  ["sub_kredittilgung", { categoryId: "cat_bank", subcategoryId: "sub_tilgung" }],
  ["sub_elektronik_software", { categoryId: "cat_shopping", subcategoryId: "sub_elektronik" }],
  ["sub_taxi_oepnv", { categoryId: "cat_mobilitaet", subcategoryId: "sub_oepnv" }],
  // Entfernt: "Lebensmittel auswärts" → zusammengeführt mit "Restaurant / Cafe / Bar"
  ["sub_lebensmittel_auswaerts", { categoryId: "cat_freizeit", subcategoryId: "sub_restaurant_cafe" }],
  // Entfernt: "Kirchensteuer" → auf die allgemeine Unterkategorie "Steuern" zusammengeführt
  ["sub_kirchensteuer", { categoryId: "cat_steuern", subcategoryId: "sub_steuern" }],
]);

// Bekannte Mappings: alter Kategoriename (lowercase) → neue categoryId + subcategoryId
const LEGACY_EXPENSE_NAME_MAP = new Map([
  ["allgemein", { categoryId: "cat_unkategorisiert", subcategoryId: null }],
  ["miete", { categoryId: "cat_wohnen", subcategoryId: "sub_miete_wohngeld" }],
  ["lebensmittel", { categoryId: "cat_lebenshaltung", subcategoryId: "sub_lebensmittel_zuhause" }],
  ["freizeit", { categoryId: "cat_freizeit", subcategoryId: "sub_freizeitaktivitaeten" }],
  ["wohnen", { categoryId: "cat_wohnen", subcategoryId: null }],
  ["versicherung", { categoryId: "cat_versicherung", subcategoryId: null }],
  ["sparen", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sparen und anlegen", { categoryId: "cat_sparen", subcategoryId: null }],
  ["shopping", { categoryId: "cat_shopping", subcategoryId: null }],
  ["shopping und unterhaltung", { categoryId: "cat_shopping", subcategoryId: null }],
  ["reisen", { categoryId: "cat_reisen", subcategoryId: null }],
  ["mobilität", { categoryId: "cat_mobilitaet", subcategoryId: null }],
  ["mobilitaet", { categoryId: "cat_mobilitaet", subcategoryId: null }],
  ["lebenshaltung", { categoryId: "cat_lebenshaltung", subcategoryId: null }],
  ["kinder", { categoryId: "cat_kinder", subcategoryId: null }],
  ["gesundheit", { categoryId: "cat_gesundheit", subcategoryId: null }],
  ["gesundheit und wellness", { categoryId: "cat_gesundheit", subcategoryId: null }],
  ["freizeit, hobbies und soziales", { categoryId: "cat_freizeit", subcategoryId: null }],
  ["bank", { categoryId: "cat_bank", subcategoryId: null }],
  ["bank und kredit", { categoryId: "cat_bank", subcategoryId: null }],
  ["unkategorisiert", { categoryId: "cat_unkategorisiert", subcategoryId: null }],
]);

/**
 * Generiert eine stabile, deterministische ID für eine Custom-Kategorie anhand des Namens.
 */
function makeCustomCategoryId(name) {
  const hash = hashStringFNV1a(String(name).toLowerCase().trim());
  return `cat_custom_${(hash >>> 0).toString(16)}`;
}

/**
 * Versucht, einen alten Kategorie-String in eine neue categoryId + subcategoryId aufzulösen.
 * Reihenfolge: bekannte Legacy-Namen → Namenssuche in expenseCategories → Fallback Unkategorisiert
 */
function resolveLegacyCategoryName(legacyName, expenseCategories) {
  if (!legacyName) return { categoryId: "cat_unkategorisiert", subcategoryId: null };

  const key = String(legacyName).toLowerCase().trim();

  if (LEGACY_EXPENSE_NAME_MAP.has(key)) {
    return LEGACY_EXPENSE_NAME_MAP.get(key);
  }

  // Namenssuche in expenseCategories (für custom-Kategorien die während der Migration erzeugt wurden)
  for (const cat of expenseCategories || []) {
    if (cat.name.toLowerCase() === key) {
      return { categoryId: cat.id, subcategoryId: null };
    }
    for (const sub of cat.subcategories || []) {
      if (sub.name.toLowerCase() === key) {
        return { categoryId: cat.id, subcategoryId: sub.id };
      }
    }
  }

  return { categoryId: "cat_unkategorisiert", subcategoryId: null };
}

/**
 * Baut das neue expenseCategories-Array aus dem alten flachen categories-Array.
 * Standard-Defaults werden immer übernommen; user-definierte Kategorien
 * werden als custom Oberkategorien ohne Unterkategorien hinzugefügt.
 */
function buildMigratedExpenseCategories(oldCategories) {
  const knownLegacyNames = new Set(
    [...LEGACY_EXPENSE_NAME_MAP.keys(), ...DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase())]
  );

  const customCategories = (oldCategories || [])
    .map(normalizeCategory)
    .filter((c) => !knownLegacyNames.has(c.name.toLowerCase()))
    .map((c, i) => ({
      id: makeCustomCategoryId(c.name),
      name: c.name,
      color: CUSTOM_CATEGORY_PALETTE[i % CUSTOM_CATEGORY_PALETTE.length],
      type: "expense",
      isDefault: false,
      budget: c.budget || null,
      subcategories: [],
    }))
    // Deduplizieren anhand der ID (falls mehrere Kategorien denselben Hash ergeben)
    .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx);

  return [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
      ...c,
      subcategories: c.subcategories.map((s) => ({ ...s })),
    })),
    ...customCategories,
  ];
}

/**
 * Überschreibt die Farbe von isDefault-Kategorien mit dem aktuellen Default-Wert.
 * Notwendig damit Farbänderungen an Default-Kategorien in bestehenden Büchern ankommen.
 */
function syncDefaultCategoryColors(existingCategories, defaultCategories) {
  const colorById = new Map(defaultCategories.map((c) => [c.id, c.color]));
  return (existingCategories || []).map((cat) => {
    if (cat.isDefault && colorById.has(cat.id)) {
      return { ...cat, color: colorById.get(cat.id) };
    }
    return cat;
  });
}

/**
 * Fügt neue Default-Kategorien zu einem bestehenden Array hinzu,
 * ohne bereits vorhandene (per ID) zu überschreiben.
 */
function mergeDefaultCategories(existing, defaults) {
  const existingIds = new Set((existing || []).map((c) => c.id));
  const toAdd = defaults.filter((d) => !existingIds.has(d.id));
  return [
    ...(existing || []),
    ...toAdd.map((c) => ({ ...c, subcategories: c.subcategories.map((s) => ({ ...s })) })),
  ];
}

/**
 * Synchronisiert Default-Unterkategorien in bestehenden Büchern:
 * - Fügt neue Default-Subcategories hinzu (falls nicht vorhanden)
 * - Entfernt gelöschte Default-Subcategories (falls isDefault)
 * - Benennt Subcategories um, deren ID sich nicht geändert hat
 */
function syncDefaultSubcategories(existingCategories, defaultCategories) {
  return (existingCategories || []).map((cat) => {
    const defaultCat = defaultCategories.find((d) => d.id === cat.id);
    if (!defaultCat) return cat;

    const removedDefaultIds = new Set([...REMOVED_SUB_MAP.keys()]);

    // Bestehende Subs: behalten wenn custom ODER in den neuen Defaults enthalten
    const keptSubs = (cat.subcategories || []).filter((sub) => {
      if (!sub.isDefault) return true; // Custom subs immer behalten
      if (removedDefaultIds.has(sub.id)) return false; // Gelöschte Defaults entfernen
      return true;
    }).map((sub) => {
      // Name von Default-Subs aktualisieren
      if (sub.isDefault) {
        const defaultSub = defaultCat.subcategories.find((d) => d.id === sub.id);
        if (defaultSub) return { ...sub, name: defaultSub.name };
      }
      return sub;
    });

    // Neue Default-Subs hinzufügen
    const existingSubIds = new Set(keptSubs.map((s) => s.id));
    const newSubs = defaultCat.subcategories
      .filter((d) => !existingSubIds.has(d.id))
      .map((s) => ({ ...s }));

    return {
      ...cat,
      subcategories: [...keptSubs, ...newSubs],
    };
  });
}

// ============================================
// Migration: Kategorien normalisieren (altes Format: String → Objekt)
// ============================================

/**
 * Migriert Kategorie von String zu Objekt (für altes flaches Format)
 * @param {string|object} cat
 * @returns {{ name: string, budget: number|null }}
 */
export function normalizeCategory(cat) {
  if (typeof cat === "string") {
    return { name: cat.trim() || "Allgemein", budget: null };
  }
  if (cat && typeof cat === "object" && typeof cat.name === "string") {
    return {
      name: cat.name.trim() || "Allgemein",
      budget: typeof cat.budget === "number" && cat.budget > 0 ? cat.budget : null,
    };
  }
  return { name: "Allgemein", budget: null };
}

// ============================================
// Migration: Alte Einträge normalisieren
// ============================================

/**
 * Konvertiert alte Einträge (type: income/expense)
 * ins neue Format (kind, source, potId)
 */
export function normalizeEntry(entry) {
  if (!entry) return entry;

  // Falls schon neues Format: unverändert zurück
  if (entry.kind) return entry;

  // Altes Format migrieren
  const normalized = { ...entry };

  if (entry.type === "income") {
    normalized.kind = "income";
    delete normalized.type;
  } else if (entry.type === "expense") {
    normalized.kind = "expense";
    normalized.source = "month"; // alte Ausgaben = aus Monatsbudget
    delete normalized.type;
  } else if (entry.type === "withdrawal") {
    normalized.kind = "withdrawal";
    delete normalized.type;
  } else if (entry.type === "transfer") {
    normalized.kind = "transfer";
    delete normalized.type;
  } else {
    // Fallback für unbekannte Types
    normalized.kind = "expense";
    normalized.source = "month";
  }

  return normalized;
}

// ============================================
// Fixkosten: Spaltenzuordnung (expense | transfer)
// ============================================

/**
 * Migration: Fixkosten-Gruppen gehören fest zu einer Spalte.
 *
 * 1. Jede Gruppe ohne gültiges `kind` bekommt eines nach der Mehrheit ihrer
 *    Positionen. Gleichstand und leere Gruppen → "expense".
 * 2. Positionen, deren `kind` nicht zum `kind` ihrer Gruppe passt, verlieren
 *    ihre `groupId` und landen im „Weitere"-Bereich der anderen Spalte.
 *
 * Idempotent: Sind alle Gruppen bereits zugeordnet und alle Positionen
 * konsistent, werden die Original-Arrays unverändert zurückgegeben.
 *
 * Positionen mit einer `groupId`, zu der es keine Gruppe gibt, bleiben
 * unangetastet — der View behandelt sie ohnehin als ungegruppiert.
 *
 * @param {Array} groups fixedCostGroups
 * @param {Array} items recurringExpenses
 * @returns {{groups: Array, items: Array}}
 */
export function migrateFixedCostKinds(groups, items) {
  if (!Array.isArray(groups) || !Array.isArray(items)) return { groups, items };

  // 1. Mehrheit je Gruppe auszählen
  const tally = new Map();
  for (const item of items) {
    const gid = item?.groupId || null;
    if (!gid) continue;
    if (!tally.has(gid)) tally.set(gid, { expense: 0, transfer: 0 });
    tally.get(gid)[fixedCostKind(item)] += 1;
  }

  let groupsChanged = false;
  const nextGroups = groups.map((group) => {
    if (group?.kind === "expense" || group?.kind === "transfer") return group;
    groupsChanged = true;
    const counts = tally.get(group?.id);
    // Gleichstand und leere Gruppen bewusst nach "expense"
    const kind = counts && counts.transfer > counts.expense ? "transfer" : "expense";
    return { ...group, kind };
  });

  // 2. Positionen lösen, die nicht in ihre Gruppe passen
  const kindByGroupId = new Map(nextGroups.map((g) => [g.id, fixedCostKind(g)]));
  let itemsChanged = false;
  const nextItems = items.map((item) => {
    const gid = item?.groupId || null;
    if (!gid) return item;
    const groupKind = kindByGroupId.get(gid);
    if (!groupKind || groupKind === fixedCostKind(item)) return item;
    itemsChanged = true;
    return { ...item, groupId: null };
  });

  return {
    groups: groupsChanged ? nextGroups : groups,
    items: itemsChanged ? nextItems : items,
  };
}

// ============================================
// Hauptmigration: normalizeBook()
// ============================================

/**
 * Einmalige Migration (Schema 3 → 4): ordnet bestehende Einträge über ihren
 * Notiztext der Fixkosten-Position zu, aus der sie stammen. Ab Schema 4 setzt
 * "Jetzt buchen" die `recurringId` direkt (buildEntryFromItem), und der
 * Notiztext ist nur noch Anzeige.
 *
 * Bewusste Einschränkungen:
 * - Nur `expense` und `transfer` werden gestempelt, nie `withdrawal`: eine
 *   Entnahme ist keine Kostenbuchung und würde die Zuordnung verfälschen.
 * - Namensdubletten: die erste Position gewinnt. Das friert dasselbe
 *   "irgendeine passt"-Verhalten ein, das die Trend-Auswertung bisher hatte.
 * - Idempotent: ein bereits gesetztes `recurringId` bleibt unangetastet, weil
 *   normalizeBook() beim Backup-Import auch auf fremde Bücher läuft.
 *
 * @param {Array} entries
 * @param {Array} recurringExpenses - bereits normalisiert
 * @returns {Array} dasselbe Array, wenn nichts zu stempeln war
 */
function stampRecurringIds(entries, recurringExpenses) {
  if (!Array.isArray(entries) || entries.length === 0) return entries;

  const idByName = new Map();
  for (const r of recurringExpenses || []) {
    if (!r?.name || !r?.id || idByName.has(r.name)) continue;
    idByName.set(r.name, r.id);
  }
  if (idByName.size === 0) return entries;

  let changed = false;
  const stamped = entries.map((e) => {
    if (!e || e.recurringId !== undefined) return e;
    if (e.kind !== "expense" && e.kind !== "transfer") return e;
    const recurringId = idByName.get(e.note);
    if (!recurringId) return e;
    changed = true;
    return { ...e, recurringId };
  });

  return changed ? stamped : entries;
}

/**
 * Normalisiert ein komplettes Buch:
 * - Migiert altes flaches Kategorie-System → hierarchisches System
 * - Fügt categoryId + subcategoryId zu Einträgen hinzu
 * - Fügt fehlende Felder (pots, recurringExpenses, etc.) hinzu
 */
export function normalizeBook(book) {
  if (!book) return book;

  const normalized = { ...book };

  // Rohwert lesen, bevor er am Ende der Funktion überschrieben wird: er
  // entscheidet, welche einmaligen Migrationen laufen. normalizeBook() läuft
  // bei JEDEM App-Start, nicht nur bei Migrationsbedarf — ohne dieses Gate
  // wäre eine Migration ein Dauerverhalten.
  const priorVersion = typeof book.schemaVersion === "number" ? book.schemaVersion : 0;

  // Nicht-leeren Namen erzwingen. Sonst lehnt die Electron-IPC-Validierung
  // (validateBook: name.length > 0) die GESAMTE Speicherung ab → db:syncBooks
  // liefert false → unter Electron wird nichts persistiert (Datenverlust).
  normalized.name = String(book.name || "").trim() || "Unbenanntes Buch";

  // Pots hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.pots)) {
    normalized.pots = [...DEFAULT_POTS];
  } else {
    // MIGRATION: initialBalance entfernen
    normalized.pots = normalized.pots.map((pot) => {
      const { initialBalance: _initialBalance, ...rest } = pot;
      return rest;
    });
  }

  // Alle Einträge mit kind/source migrieren
  if (Array.isArray(normalized.entries)) {
    normalized.entries = normalized.entries.map(normalizeEntry);
  }

  // Transfer-Zwecke: Liste als Objekte, Referenzen per ID. Braucht die
  // normalisierten Eintrags-kinds von oben und muss vor normalizeEntryTemplate
  // laufen, das nur noch `transferCategoryId` kennt. Idempotent, daher ohne
  // Versions-Gate.
  Object.assign(normalized, migrateTransferCategoryIds(normalized));

  // === Hierarchische Kategorie-Migration ===
  const needsCategoryMigration = !Array.isArray(normalized.expenseCategories);

  if (needsCategoryMigration) {
    // Aus altem flachen categories-Array neue hierarchische Struktur aufbauen
    normalized.expenseCategories = buildMigratedExpenseCategories(normalized.categories);
    normalized.incomeCategories = DEFAULT_INCOME_CATEGORIES.map((c) => ({
      ...c,
      subcategories: c.subcategories.map((s) => ({ ...s })),
    }));

    // Altes categories-Feld entfernen
    delete normalized.categories;
  } else {
    // Neue Default-Kategorien mergen, falls sie seit der letzten Migration hinzugekommen sind
    normalized.expenseCategories = mergeDefaultCategories(
      normalized.expenseCategories,
      DEFAULT_EXPENSE_CATEGORIES
    );
    // Unterkategorien synchronisieren (neue hinzufügen, gelöschte entfernen, umbenannte aktualisieren)
    normalized.expenseCategories = syncDefaultSubcategories(
      normalized.expenseCategories,
      DEFAULT_EXPENSE_CATEGORIES
    );
    // Farben von Default-Kategorien immer auf den aktuellen Stand bringen
    normalized.expenseCategories = syncDefaultCategoryColors(
      normalized.expenseCategories,
      DEFAULT_EXPENSE_CATEGORIES
    );
    // Ausgemusterte Default-Oberkategorie "Unkategorisiert" aus bestehenden
    // Büchern entfernen. Sie bleibt als virtueller Fallback-Bucket in der
    // Auswertung erhalten (siehe calcByHierarchy). Nur entfernen, wenn keine
    // benutzerdefinierten Unterkategorien daran hängen.
    normalized.expenseCategories = normalized.expenseCategories.filter(
      (c) => c.id !== "cat_unkategorisiert" || (c.subcategories || []).some((s) => !s.isDefault)
    );
    if (!Array.isArray(normalized.incomeCategories)) {
      normalized.incomeCategories = DEFAULT_INCOME_CATEGORIES.map((c) => ({
        ...c,
        subcategories: c.subcategories.map((s) => ({ ...s })),
      }));
    } else {
      normalized.incomeCategories = mergeDefaultCategories(
        normalized.incomeCategories,
        DEFAULT_INCOME_CATEGORIES
      );
      normalized.incomeCategories = syncDefaultSubcategories(
        normalized.incomeCategories,
        DEFAULT_INCOME_CATEGORIES
      );
      normalized.incomeCategories = syncDefaultCategoryColors(
        normalized.incomeCategories,
        DEFAULT_INCOME_CATEGORIES
      );
    }
  }

  // Budget-Regel: Die Summe der Unterkategorie-Budgets übersteigt das Budget
  // der Oberkategorie nie. Bewusst ohne Versions-Gate — das ist eine
  // Invariante, keine einmalige Migration (greift auch bei alten Backups).
  normalized.expenseCategories = normalizeCategoryBudgets(normalized.expenseCategories);

  // categoryId + subcategoryId zu Einträgen hinzufügen (falls noch nicht vorhanden)
  // + gelöschte/umbenannte Unterkategorie-IDs migrieren
  if (Array.isArray(normalized.entries)) {
    normalized.entries = normalized.entries.map((entry) => {
      // Bereits migriert
      if (entry.categoryId !== undefined) {
        // Prüfe ob subcategoryId in der REMOVED_SUB_MAP ist → migrieren
        if (entry.subcategoryId && REMOVED_SUB_MAP.has(entry.subcategoryId)) {
          const replacement = REMOVED_SUB_MAP.get(entry.subcategoryId);
          return { ...entry, categoryId: replacement.categoryId, subcategoryId: replacement.subcategoryId };
        }
        return entry;
      }

      // Transfer: keine Kategorie-ID nötig
      if (entry.kind === "transfer") {
        return { ...entry, categoryId: null, subcategoryId: null };
      }

      // Einnahme: Standard-Einnahmen-Kategorie
      if (entry.kind === "income") {
        return { ...entry, categoryId: "cat_einnahmen", subcategoryId: null };
      }

      // Ausgabe: aus altem category-String auflösen
      const { categoryId, subcategoryId } = resolveLegacyCategoryName(
        entry.category,
        normalized.expenseCategories
      );
      return { ...entry, categoryId, subcategoryId };
    });
  }

  // Fixkosten hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.recurringExpenses)) {
    normalized.recurringExpenses = [];
  } else {
    normalized.recurringExpenses = normalized.recurringExpenses.map((r) => {
      const withGroup = r.groupId === undefined ? { ...r, groupId: null } : r;
      const withTags = Array.isArray(withGroup.tags) ? withGroup : { ...withGroup, tags: [] };
      // `kind` explizit setzen: der Fixkosten-View leitet daraus die Spalte ab,
      // ein fehlender Wert würde sonst als Transfer gerendert.
      const withKind = withTags.kind === "expense" || withTags.kind === "transfer"
        ? withTags
        : { ...withTags, kind: "expense" };
      // Turnus/Fälligkeit (Rückstellungen): bewusst KEINE Ableitung aus Bestandsdaten —
      // ein bestehender Transfer ohne Turnus bleibt ohne. Hygiene-Regel: ein Turnus
      // gilt nur an einem Transfer und nur mit Fälligkeit als Zyklus-Anker. Ohne
      // Anker ließe sich kein Zyklus berechnen; der Halbzustand darf auch aus
      // einem manipulierten Backup nicht entstehen.
      const rawTurnus = Number(withKind.turnus);
      const rawFaelligkeit = withKind.faelligkeit || null;
      const validTurnus =
        withKind.kind === "transfer" &&
        Number.isFinite(rawTurnus) &&
        rawTurnus > 0 &&
        !!rawFaelligkeit;
      const turnus = validTurnus ? rawTurnus : null;
      const faelligkeit = validTurnus ? rawFaelligkeit : null;
      return withKind.turnus === turnus && withKind.faelligkeit === faelligkeit
        ? withKind
        : { ...withKind, turnus, faelligkeit };
    });
  }

  // Fixkosten-Gruppen hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.fixedCostGroups)) {
    normalized.fixedCostGroups = [];
  }

  // Gruppen an eine Spalte binden und nicht passende Positionen daraus lösen
  const fixedCosts = migrateFixedCostKinds(
    normalized.fixedCostGroups,
    normalized.recurringExpenses
  );
  normalized.fixedCostGroups = fixedCosts.groups;
  normalized.recurringExpenses = fixedCosts.items;

  // Muss NACH der Normalisierung der recurringExpenses laufen (der Entry-
  // Durchlauf weiter oben kennt sie noch nicht) und nur einmalig: ein später
  // manuell erfasster Eintrag mit passendem Notiztext soll NICHT gestempelt
  // werden — genau das ist die gewollte Verschärfung der Kostenzuordnung.
  // Feste 4, nicht CURRENT_SCHEMA_VERSION: ein späterer Bump auf 5 darf diese
  // Migration nicht erneut über bereits migrierte Bücher laufen lassen.
  if (priorVersion < 4) {
    normalized.entries = stampRecurringIds(normalized.entries, normalized.recurringExpenses);
  }

  // Kostengruppen (Kostenrechner) hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.costGroups)) {
    normalized.costGroups = [];
  } else {
    normalized.costGroups = normalized.costGroups.map((g) => ({
      ...g,
      categoryIds: Array.isArray(g.categoryIds) ? g.categoryIds : [],
      subcategoryIds: Array.isArray(g.subcategoryIds) ? g.subcategoryIds : [],
      plannedItems: Array.isArray(g.plannedItems) ? g.plannedItems : [],
    }));
  }

  // Buchungsvorlagen hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.entryTemplates)) {
    normalized.entryTemplates = [];
  } else {
    // .filter(Boolean) bewusst: kaputte Einträge aus manipulierten Backups
    // fliegen hier raus, statt später im Picker zu crashen.
    normalized.entryTemplates = normalized.entryTemplates
      .map(normalizeEntryTemplate)
      .filter(Boolean);
  }

  // Zweck = Sparposition (Schema 7). Einmalig, weil die Migration Buchungen
  // umhängt; braucht normalisierte Fixkosten-Positionen und Vorlagen von oben.
  // Feste 7 aus demselben Grund wie die 4 bei stampRecurringIds.
  if (priorVersion < 7) {
    Object.assign(normalized, migrateSavingsPurposes(normalized));
  } else {
    // Schema 7 kennt keine Transfer-Positionen mehr — auch nicht aus einem
    // manipulierten Backup.
    normalized.recurringExpenses = normalized.recurringExpenses.filter(
      (r) => fixedCostKind(r) === "expense"
    );
  }
  delete normalized.goals;
  normalized.transferCategories = normalizeSavingsPurposes(
    normalized.transferCategories,
    normalized.pots
  );

  // Investments (Depots, Assets, Transaktionen, Snapshots). Läuft bewusst bei
  // jedem Start und nicht nur einmalig: normalizeInvestments ist idempotent und
  // hält die Struktur auch nach einem Import sauber.
  normalized.investments = normalizeInvestments(normalized.investments);

  // Basiswährung: Standard CHF (bisherige implizite Währung)
  if (!normalized.baseCurrency) {
    normalized.baseCurrency = "CHF";
  }

  // Finanzieller Monatsbeginn: Standard 1 = Kalendermonat
  normalized.monthStartDay = validateMonthStartDay(normalized.monthStartDay);

  normalized.schemaVersion = CURRENT_SCHEMA_VERSION;

  return normalized;
}

/**
 * Normalisiert alle Bücher (z.B. beim Laden aus localStorage/SQLite)
 */
export function normalizeBooks(books) {
  if (!Array.isArray(books)) return books;
  return books.map(normalizeBook);
}

// ============================================
// Budget-Regel
// ============================================

const positiveBudget = (value) => (typeof value === "number" && value > 0 ? value : null);

/**
 * Hält die Budget-Regel der Ausgaben-Kategorien ein: Die Oberkategorie trägt
 * das Budget, ihre Unterkategorien teilen es optional auf — die Summe der
 * Unterkategorie-Budgets übersteigt das Budget der Oberkategorie nie.
 *
 * Verletzt eine Kategorie die Regel, wird ihr Budget auf die Summe der
 * Unterkategorien angehoben. Das deckt auch Bücher aus der Zeit ab, in der ein
 * Budget entweder auf der Oberkategorie oder auf den Unterkategorien lag: Aus
 * reinen Unterkategorie-Budgets wird deren Summe als Budget der Oberkategorie.
 *
 * Läuft bei jedem Laden (normalizeBook) und ist für gültige Daten ein No-op.
 *
 * @param {Array} expenseCategories
 * @returns {Array} dieselbe Liste, wenn nichts zu korrigieren war
 */
export function normalizeCategoryBudgets(expenseCategories) {
  if (!Array.isArray(expenseCategories)) return expenseCategories;
  let changed = false;
  const result = expenseCategories.map((cat) => {
    const allocated = (cat.subcategories || []).reduce((sum, sub) => sum + (positiveBudget(sub.budget) || 0), 0);
    if (allocated <= 0) return cat;
    const total = Math.round(allocated * 100) / 100;
    if ((positiveBudget(cat.budget) || 0) >= total) return cat;
    changed = true;
    return { ...cat, budget: total };
  });
  return changed ? result : expenseCategories;
}
