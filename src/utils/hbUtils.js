// src/utils/hbUtils.js
import { CUSTOM_CATEGORY_PALETTE } from "./hbPalette.js";
import { MONTHS_LONG } from "./constants.js";

export const CURRENT_SCHEMA_VERSION = 2;

/** Returns true if the book has not yet been migrated to the current schema. */
export function bookNeedsMigration(book) {
  return !book || typeof book.schemaVersion !== "number" || book.schemaVersion < CURRENT_SCHEMA_VERSION;
}

// Internal legacy CHF formatter — used as fallback by formatCurrency below.
function toCHF(n) {
  try {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    return `${Number(n || 0).toFixed(2)} CHF`;
  }
}

export function formatCurrency(n, currency = "CHF", fractionDigits = 2) {
  const cur = String(currency).toUpperCase();
  const amount = Number(n || 0);
  try {
    if (cur === "CHF") {
      // style:"currency" erzwingt U+0027 als Tausendertrennzeichen (schmales Apostroph)
      // Plain-Number-Format nutzt in Chromium U+2019 (breiter)
      return new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        currencyDisplay: "code",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
    }
    if (cur === "EUR") {
      // 1.250,50 € (deutsches Format, Symbol nach Betrag)
      const formatted = new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
      return `${formatted} €`;
    }
    if (cur === "USD") {
      // $1,250.50 (US-Format, Symbol vor Betrag)
      const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
      return `$${formatted}`;
    }
    if (cur === "GBP") {
      const formatted = new Intl.NumberFormat("en-GB", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
      return `£${formatted}`;
    }
    if (cur === "JPY") {
      const formatted = new Intl.NumberFormat("ja-JP", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
      return `¥${formatted}`;
    }
    // Fallback für andere Währungen
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return toCHF(n);
  }
}

// Kompakte Währungsdarstellung für enge Kontexte (z. B. Chart-Achsen):
// Tausender/Millionen werden zu „k"/„M" gekürzt, z. B. CHF3.5k, −EUR1.2k, $4M.
// Affix-Platzierung folgt formatCurrency; bewusst ohne Leerzeichen für maximale Kürze.
function trimCompactNumber(x) {
  const s = x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatCurrencyCompact(n, currency = "CHF") {
  const cur = String(currency).toUpperCase();
  const amount = Number(n || 0);
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  let num;
  if (abs >= 1_000_000) num = `${trimCompactNumber(abs / 1_000_000)}M`;
  else if (abs >= 1_000) num = `${trimCompactNumber(abs / 1_000)}k`;
  else num = String(Math.round(abs));

  if (cur === "EUR") return `${sign}${num} €`;
  if (cur === "USD") return `${sign}$${num}`;
  if (cur === "GBP") return `${sign}£${num}`;
  if (cur === "JPY") return `${sign}¥${num}`;
  if (cur === "CHF") return `${sign}CHF${num}`;
  return `${sign}${cur}${num}`;
}

export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formatiert ein ISO-Datum (YYYY-MM-DD) im europäischen Format (DD.MM.YYYY).
 * Gibt einen leeren String zurück, falls das Eingabedatum ungültig ist.
 */
export function formatDateDE(isoDate) {
  if (!isoDate) return "";
  const s = String(isoDate);
  // Bereits DD.MM.YYYY? -> unverändert zurück
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, yyyy, mm, dd] = m;
  return `${dd}.${mm}.${yyyy}`;
}

export function formatDateDELong(isoDate) {
  if (!isoDate) return "";
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${Number(m[3])}. ${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}`;
}

export function validateMonthStartDay(day) {
  return Math.max(1, Math.min(28, Number(day) || 1));
}

export function formatFileStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

export function parseAmount(input) {
  const n = Number(String(input ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function sumAmounts(entries, predicate = () => true) {
  return (entries || []).filter(predicate).reduce((s, e) => s + Number(e.amount || 0), 0);
}

// Internal — used by the deterministic category color hashing below.
function hashStringFNV1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============================================
// NEU: Töpfe-System
// ============================================

// Standard-Töpfe (2 Stück)
export const DEFAULT_POTS = [
  { id: "reserve", name: "Rücklagen" },
  { id: "surplus", name: "Überschuss" },
];

// ============================================
// Rückwärtskompatibilität: altes flaches Format
// ============================================

// Wird noch beim Import alter Backups benötigt (Migration)
export const DEFAULT_CATEGORIES = [
  { name: "Allgemein", budget: null },
  { name: "Miete", budget: null },
  { name: "Lebensmittel", budget: null },
  { name: "Freizeit", budget: null },
];

// ============================================
// Hierarchische Standard-Kategorien (NEU)
// ============================================

export const DEFAULT_EXPENSE_CATEGORIES = [
  {
    id: "cat_wohnen",
    name: "Wohnen",
    color: "#0078d4",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_wohnnebenkosten", name: "Wohnnebenkosten", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_immobilienkredit", name: "Immobilienkredit", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_haushaltsdienstleistungen", name: "Haushaltsdienstleistungen", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_moebel_haushaltsgeraete", name: "Möbel und Haushaltsgeräte", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_miete_wohngeld", name: "Miete / Wohngeld", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_heimwerken_garten", name: "Heimwerken und Garten", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_strom", name: "Strom", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_gas", name: "Gas", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_oel", name: "Öl", parentId: "cat_wohnen", isDefault: true },
    ],
  },
  {
    id: "cat_versicherung",
    name: "Versicherung",
    color: "#7160e8",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_bu_versicherung", name: "Berufsunfähigkeitsversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_haftpflicht", name: "Haftpflichtversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_krankenversicherung", name: "Krankenversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_risiko_leben", name: "Risiko-Lebensversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_pflegeversicherung", name: "Pflegeversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_rechtsschutz", name: "Rechtsschutzversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_unfallversicherung", name: "Unfallversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_reiseversicherung", name: "Reiseversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_kranken_zusatz", name: "Kranken-Zusatzversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_hausratversicherung", name: "Hausratversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_wohngebaeudeversicherung", name: "Wohngebäudeversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_tierversicherung", name: "Tierversicherung", parentId: "cat_versicherung", isDefault: true },
    ],
  },
  {
    id: "cat_sparen",
    name: "Sparen und Anlegen",
    color: "#e8a200",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_wertpapieranlage", name: "Wertpapieranlage", parentId: "cat_sparen", isDefault: true },
      { id: "sub_wertgegenstaende", name: "Wertgegenstände", parentId: "cat_sparen", isDefault: true },
      { id: "sub_edelmetalle", name: "Edelmetalle", parentId: "cat_sparen", isDefault: true },
      { id: "sub_krypto", name: "Krypto", parentId: "cat_sparen", isDefault: true },
      { id: "sub_immobilien", name: "Immobilien", parentId: "cat_sparen", isDefault: true },
    ],
  },
  {
    id: "cat_shopping",
    name: "Shopping und Unterhaltung",
    color: "#e3008c",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_buecher_zeitungen", name: "Bücher / Zeitungen / Zeitschriften", parentId: "cat_shopping", isDefault: true },
      { id: "sub_tv_video_musik", name: "TV / Video / Musik", parentId: "cat_shopping", isDefault: true },
      { id: "sub_bekleidung_schuhe", name: "Bekleidung / Schuhe / Accessoires", parentId: "cat_shopping", isDefault: true },
      { id: "sub_geschenke", name: "Geschenke", parentId: "cat_shopping", isDefault: true },
    ],
  },
  {
    id: "cat_reisen",
    name: "Reisen",
    color: "#e74856",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_hotel_unterkunft", name: "Hotel und Unterkunft", parentId: "cat_reisen", isDefault: true },
      { id: "sub_pauschalreise", name: "Pauschalreise", parentId: "cat_reisen", isDefault: true },
      { id: "sub_reise_transport", name: "Transport", parentId: "cat_reisen", isDefault: true },
    ],
  },
  {
    id: "cat_mobilitaet",
    name: "Mobilität",
    color: "#f7630c",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_kfz_versicherung", name: "KFZ-Versicherung", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_tanken", name: "Tanken", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_kfz_kredit", name: "KFZ-Kredit / Leasingrate / KFZ-Kauf", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_kfz_sonstige", name: "KFZ Sonstige", parentId: "cat_mobilitaet", isDefault: true },
    ],
  },
  {
    id: "cat_lebenshaltung",
    name: "Lebenshaltung",
    color: "#038387",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_drogerie", name: "Drogerie", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_festnetz_internet", name: "Festnetz und Internet", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_handy", name: "Handy", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_lebensmittel_zuhause", name: "Lebensmittel zu Hause", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_lebensmittel_auswaerts", name: "Lebensmittel auswärts", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_haustierbedarf", name: "Haustierbedarf", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_haushaltsbedarf", name: "Haushaltsbedarf", parentId: "cat_lebenshaltung", isDefault: true },
    ],
  },
  {
    id: "cat_kinder",
    name: "Kinder",
    color: "#c239b3",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_spielwaren", name: "Spielwaren", parentId: "cat_kinder", isDefault: true },
      { id: "sub_taschengeld", name: "Taschengeld / Unterhalt", parentId: "cat_kinder", isDefault: true },
      { id: "sub_kinderbetreuung", name: "Kinderbetreuung", parentId: "cat_kinder", isDefault: true },
    ],
  },
  {
    id: "cat_gesundheit",
    name: "Gesundheit und Wellness",
    color: "#9acd32",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_arznei_heilmittel", name: "Arznei- und Heilmittel", parentId: "cat_gesundheit", isDefault: true },
      { id: "sub_wellness_beauty", name: "Wellness und Beauty", parentId: "cat_gesundheit", isDefault: true },
      { id: "sub_arztbesuch", name: "Arztbesuch / Krankenhaus", parentId: "cat_gesundheit", isDefault: true },
    ],
  },
  {
    id: "cat_freizeit",
    name: "Freizeit, Hobbies und Soziales",
    color: "#498205",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_spenden", name: "Spenden", parentId: "cat_freizeit", isDefault: true },
      { id: "sub_restaurant_cafe", name: "Restaurant / Cafe / Bar", parentId: "cat_freizeit", isDefault: true },
      { id: "sub_sport_fitness", name: "Sport und Fitness", parentId: "cat_freizeit", isDefault: true },
      { id: "sub_freizeitaktivitaeten", name: "Freizeitaktivitäten", parentId: "cat_freizeit", isDefault: true },
    ],
  },
  {
    id: "cat_bank",
    name: "Bank und Kredit",
    color: "#4f6bed",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_bankgebuehren", name: "Bankgebühren", parentId: "cat_bank", isDefault: true },
      { id: "sub_barauszahlung", name: "Barauszahlung", parentId: "cat_bank", isDefault: true },
      { id: "sub_kreditkartenabrechnung", name: "Kreditkartenabrechnung", parentId: "cat_bank", isDefault: true },
      { id: "sub_tilgung", name: "Tilgung", parentId: "cat_bank", isDefault: true },
    ],
  },
  {
    id: "cat_unkategorisiert",
    name: "Unkategorisiert",
    color: "#6b6b6b",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [],
  },
];

export const DEFAULT_INCOME_CATEGORIES = [
  {
    id: "cat_einnahmen",
    name: "Einnahmen",
    color: "#10893e",
    type: "income",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_gehalt", name: "Gehalt", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_kapitaleinkommen", name: "Kapitaleinkommen", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_mieteinnahmen", name: "Mieteinnahmen", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_rente_pension", name: "Rente und Pension", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_staatliche_leistung", name: "Staatliche Leistung und Förderung", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_unterhalt_einnahme", name: "Unterhalt", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_bareinzahlung", name: "Bareinzahlung", parentId: "cat_einnahmen", isDefault: true },
    ],
  },
];

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
 * Prüft ob eine Kategorie oder Unterkategorie eine Standard-Kategorie ist (nicht löschbar).
 */
export function isCategoryDefault(expenseCategories, incomeCategories, categoryId, subcategoryId) {
  const parent = findCategoryById(expenseCategories, incomeCategories, categoryId);
  if (!parent) return false;
  if (subcategoryId) {
    const sub = (parent.subcategories || []).find((s) => s.id === subcategoryId);
    return sub?.isDefault ?? false;
  }
  return parent.isDefault ?? false;
}

// ============================================
// Migration: Legacy-Kategorienamen → neue IDs
// ============================================

// Migration: entfernte Unterkategorie-IDs → Ersatz-IDs
const REMOVED_SUB_MAP = new Map([
  ["sub_bausparen", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_festgeld_tagesgeld", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_private_rente", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_kapitallebensversicherung", { categoryId: "cat_sparen", subcategoryId: null }],
  ["sub_elektronik_software", { categoryId: "cat_shopping", subcategoryId: null }],
  ["sub_bueromaterial", { categoryId: "cat_shopping", subcategoryId: null }],
  ["sub_taxi_oepnv", { categoryId: "cat_mobilitaet", subcategoryId: null }],
  ["sub_kontentransfer", { categoryId: "cat_bank", subcategoryId: null }],
  // Umbenannte IDs (alte ID → neue ID)
  ["sub_lebensmittel_getraenke", { categoryId: "cat_lebenshaltung", subcategoryId: "sub_lebensmittel_zuhause" }],
  ["sub_haustier", { categoryId: "cat_lebenshaltung", subcategoryId: "sub_haustierbedarf" }],
  ["sub_kirche_spende", { categoryId: "cat_freizeit", subcategoryId: "sub_spenden" }],
  ["sub_kredittilgung", { categoryId: "cat_bank", subcategoryId: "sub_tilgung" }],
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
// Datenmodell: Standard-Buch erstellen
// ============================================

export function makeDefaultBook(name = "Mein Haushaltsbuch") {
  return {
    id: `book_${Date.now()}`,
    name,
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
      ...c,
      subcategories: c.subcategories.map((s) => ({ ...s })),
    })),
    incomeCategories: DEFAULT_INCOME_CATEGORIES.map((c) => ({
      ...c,
      subcategories: c.subcategories.map((s) => ({ ...s })),
    })),
    transferCategories: [],
    entries: [],
    pots: [],
    goals: [],
    recurringExpenses: [],
    fixedCostGroups: [],
    baseCurrency: "CHF",
    monthStartDay: 1,
  };
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

/**
 * Extrahiert Kategorie-Namen aus Objekt-Array (Rückwärtskompatibilität)
 * @param {Array} categories
 * @returns {Array<string>}
 */
export function getCategoryNames(categories) {
  return (categories || []).map((c) =>
    typeof c === "string" ? c : c.name
  );
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
// Hauptmigration: normalizeBook()
// ============================================

/**
 * Normalisiert ein komplettes Buch:
 * - Migiert altes flaches Kategorie-System → hierarchisches System
 * - Fügt categoryId + subcategoryId zu Einträgen hinzu
 * - Fügt fehlende Felder (pots, goals, etc.) hinzu
 */
export function normalizeBook(book) {
  if (!book) return book;

  const normalized = { ...book };

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

  // Transfer-Kategorien hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.transferCategories)) {
    normalized.transferCategories = [];
  } else {
    // Bereinigung: "Allgemein" sollte NICHT in transferCategories sein
    normalized.transferCategories = normalized.transferCategories.filter(
      (cat) => cat !== "Allgemein"
    );
  }

  // Alle Einträge mit kind/source migrieren
  if (Array.isArray(normalized.entries)) {
    normalized.entries = normalized.entries.map(normalizeEntry);
  }

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

  // Sparziele hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.goals)) {
    normalized.goals = [];
  } else {
    // Archiv-Felder (Abschluss) für ältere Ziele ergänzen
    normalized.goals = normalized.goals.map((g) => ({
      completedAt: null,
      completedAmount: null,
      ...g,
    }));
  }

  // Fixkosten hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.recurringExpenses)) {
    normalized.recurringExpenses = [];
  } else {
    normalized.recurringExpenses = normalized.recurringExpenses.map((r) => {
      const withGroup = r.groupId === undefined ? { ...r, groupId: null } : r;
      return Array.isArray(withGroup.tags) ? withGroup : { ...withGroup, tags: [] };
    });
  }

  // Fixkosten-Gruppen hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.fixedCostGroups)) {
    normalized.fixedCostGroups = [];
  }

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
// Budget-Validierung
// ============================================

/**
 * Darf die Oberkategorie ein Budget bekommen?
 * Nein, wenn mindestens eine Unterkategorie bereits ein Budget hat.
 */
export function canSetParentBudget(category) {
  return !(category.subcategories || []).some(
    (sub) => sub.budget != null && sub.budget > 0
  );
}

/**
 * Darf die Unterkategorie ein Budget bekommen?
 * Nein, wenn die Oberkategorie bereits ein Budget hat.
 */
export function canSetSubBudget(parentCategory) {
  return !(parentCategory.budget != null && parentCategory.budget > 0);
}
