// src/utils/hbUtils.js

import { normalizeInvestmentData, DEFAULT_ASSET_TYPES, DEFAULT_REGIONS } from "./investmentUtils.js";

export function toCHF(n) {
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

export function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseAmount(input) {
  const n = Number(String(input ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Stabile Farben pro Kategorie-Name
export function hashStringFNV1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorFromCategoryName(name) {
  const s = String(name ?? "").trim();
  const h = hashStringFNV1a(s || "(leer)");
  const hue = h % 360;
  const sat = 68;
  const light = 46;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// ============================================
// NEU: Töpfe-System
// ============================================

// Standard-Töpfe (2 Stück)
export const DEFAULT_POTS = [
  { id: "reserve", name: "Rücklagen" },
  { id: "surplus", name: "Überschuss" },
];

// Standard-Kategorien für Ausgaben (mit optionalem Budget)
export const DEFAULT_CATEGORIES = [
  { name: "Allgemein", budget: null },
  { name: "Miete", budget: null },
  { name: "Lebensmittel", budget: null },
  { name: "Freizeit", budget: null },
];

// Standard-Kategorien für Transfers (Rücklagen-Zwecke)
export const DEFAULT_TRANSFER_CATEGORIES = [
  "Steuern",
  "KFZ-Versicherung",
  "Jahresrechnungen",
  "Notgroschen",
];

// Erstellt ein neues Haushaltsbuch mit Töpfen
export function makeDefaultBook(name = "Mein Haushaltsbuch") {
  return {
    id: `book_${Date.now()}`,
    name,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), // für Ausgaben (mit Budget)
    transferCategories: [...DEFAULT_TRANSFER_CATEGORIES], // für Transfers
    entries: [],
    pots: DEFAULT_POTS.map((p) => ({ ...p })),
    goals: [], // Sparziele
    recurringExpenses: [], // Fixkosten
    investmentPortfolios: [],
    investmentAssetTypes: [...DEFAULT_ASSET_TYPES],
    investmentRegions: [...DEFAULT_REGIONS],
    investmentTags: [],
  };
}

// ============================================
// Migration: Kategorien normalisieren (String → Objekt)
// ============================================

/**
 * Migriert Kategorie von String zu Objekt
 * @param {string|object} cat - Alte String-Kategorie oder neues Objekt
 * @returns {object} - { name: string, budget: number|null }
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
 * Extrahiert Kategorie-Namen aus Objekt-Array
 * @param {Array} categories - Array von Kategorie-Objekten oder Strings
 * @returns {Array<string>} - Array von Namen
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
  } else {
    // Fallback für unbekannte Types
    normalized.kind = "expense";
    normalized.source = "month";
  }

  return normalized;
}

/**
 * Normalisiert ein komplettes Buch:
 * - Fügt pots hinzu, falls nicht vorhanden
 * - Fügt transferCategories hinzu, falls nicht vorhanden
 * - Migriert alle Einträge
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
      const { initialBalance, ...rest } = pot;
      return rest;
    });
  }

  // Transfer-Kategorien hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.transferCategories)) {
    normalized.transferCategories = [...DEFAULT_TRANSFER_CATEGORIES];
  } else {
    // Bereinigung: "Allgemein" sollte NICHT in transferCategories sein
    normalized.transferCategories = normalized.transferCategories.filter(
      (cat) => cat !== "Allgemein"
    );
    // Falls leer nach Filterung, defaults hinzufügen
    if (normalized.transferCategories.length === 0) {
      normalized.transferCategories = [...DEFAULT_TRANSFER_CATEGORIES];
    }
  }

  // Alle Einträge migrieren
  if (Array.isArray(normalized.entries)) {
    normalized.entries = normalized.entries.map(normalizeEntry);
  }

  // Kategorien migrieren (String → Objekt mit Budget)
  if (Array.isArray(normalized.categories)) {
    normalized.categories = normalized.categories.map(normalizeCategory);
  } else {
    normalized.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  }

  // Sparziele hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.goals)) {
    normalized.goals = [];
  }

  // Fixkosten hinzufügen, falls nicht vorhanden
  if (!Array.isArray(normalized.recurringExpenses)) {
    normalized.recurringExpenses = [];
  }

  // Investment-Daten normalisieren
  const withInvestments = normalizeInvestmentData(normalized);
  Object.assign(normalized, withInvestments);

  return normalized;
}

/**
 * Normalisiert alle Bücher (z.B. beim Laden aus localStorage)
 */
export function normalizeBooks(books) {
  if (!Array.isArray(books)) return books;
  return books.map(normalizeBook);
}