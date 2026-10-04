// src/utils/investmentModel.js
//
// Datenmodell des Investment-Views: Shape, Konstanten und Normalisierung.
// Bewusst eine eigene Datei statt hbUtils.js — analog zu entryTemplateUtils.js.
//
// Importiert absichtlich NICHT aus hbUtils.js (dort läge sonst ein Zyklus,
// weil normalizeBook von hier importiert).
//
// Aufbau (siehe docs/investment-view-plan.md, Abschnitt 7):
//   depots       Aufbewahrungsorte — Broker, Bank, aber auch "Zu Hause"
//   assets       Stammdaten je Wertpapier/Metall, depotunabhängig
//   transactions Kauf/Verkauf/Ausschüttung; Bestand wird daraus berechnet
//   snapshots    Depotwert je Tag, für die Verlaufskurve
//
// Bestand und Kostenbasis werden pro (depotId, assetId) geführt: dasselbe
// Wertpapier in zwei Depots bleibt getrennt, es gibt keine Mischkostenbasis.

import { generateId } from "./idUtils.js";

export const ASSET_CLASSES = ["stock", "etf", "metal", "crypto", "other"];

export const ASSET_CLASS_LABELS = {
  stock: "Aktie",
  etf: "ETF",
  metal: "Edelmetall",
  crypto: "Krypto",
  other: "Sonstiges",
};

export const TRANSACTION_TYPES = ["buy", "sell", "dividend"];

export const TRANSACTION_TYPE_LABELS = {
  buy: "Kauf",
  sell: "Verkauf",
  dividend: "Ausschüttung",
};

// "pcs" = Stück (Wertpapiere), "g"/"oz" = Gramm/Feinunze (Edelmetalle)
export const QUANTITY_UNITS = ["pcs", "g", "oz"];

export const QUANTITY_UNIT_LABELS = {
  pcs: "Stk",
  g: "g",
  oz: "oz",
};

export const METALS = ["gold", "silver"];

// Yahoo-Future-Symbole, beide in USD pro Feinunze. Am 20.09.2026 verifiziert.
// XAUUSD=X existiert bei Yahoo NICHT — nicht darauf ausweichen.
export const METAL_SYMBOLS = {
  gold: "GC=F",
  silver: "SI=F",
};

export const METAL_LABELS = {
  gold: "Gold",
  silver: "Silber",
};

export const GRAMS_PER_TROY_OUNCE = 31.1034768;

export const DEPOT_NAME_MAX = 50;
export const ASSET_NAME_MAX = 80;
export const SYMBOL_MAX = 20;

/** Leere Struktur für ein Buch ohne Investments. */
export function emptyInvestments() {
  return { depots: [], assets: [], transactions: [], snapshots: [] };
}

function isIsoDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function positiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegativeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function cleanString(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isoTimestamp(v) {
  return typeof v === "string" && v ? v : new Date().toISOString();
}

/**
 * Rechnet eine Menge in Feinunzen um. Nur für Edelmetalle sinnvoll —
 * die Kurse GC=F/SI=F notieren in USD pro Feinunze.
 * @param {number} quantity
 * @param {"pcs"|"g"|"oz"} unit
 * @returns {number}
 */
export function toTroyOunces(quantity, unit) {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return 0;
  if (unit === "g") return q / GRAMS_PER_TROY_OUNCE;
  return q; // "oz" — Metall-Transaktionen tragen nie "pcs" (siehe normalizeInvestments)
}

/**
 * Erzwingt Shape und Defaults eines Depots.
 * @returns {object|null} null bei unbrauchbaren Daten (fehlender Name)
 */
export function normalizeDepot(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const name = cleanString(d.name, DEPOT_NAME_MAX);
  if (!name) return null;
  return {
    id: typeof d.id === "string" && d.id ? d.id : generateId("dep"),
    name,
    note: cleanString(d.note, 200),
    createdAt: isoTimestamp(d.createdAt),
  };
}

/**
 * Erzwingt Shape und Defaults eines Wertpapier-/Metall-Stammsatzes.
 * @returns {object|null} null ohne Symbol
 */
export function normalizeAsset(a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  // Yahoo-Symbole sind case-insensitive; Grossschreibung hält die Dedup-Prüfung einfach.
  const symbol = cleanString(a.symbol, SYMBOL_MAX).toUpperCase();
  if (!symbol) return null;

  const kind = a.kind === "metal" ? "metal" : "security";
  const metal = kind === "metal" && METALS.includes(a.metal) ? a.metal : null;
  // Ein Metall-Asset ohne erkennbares Metall wäre nicht bewertbar.
  if (kind === "metal" && !metal) return null;

  const assetClass = ASSET_CLASSES.includes(a.assetClass)
    ? a.assetClass
    : kind === "metal"
      ? "metal"
      : "other";

  const quoteCurrency = cleanString(a.quoteCurrency, 3).toUpperCase();

  return {
    id: typeof a.id === "string" && a.id ? a.id : generateId("ast"),
    symbol,
    name: cleanString(a.name, ASSET_NAME_MAX) || symbol,
    assetClass,
    quoteCurrency: quoteCurrency || "USD",
    kind,
    metal,
  };
}

/**
 * Erzwingt Shape und Defaults einer Transaktion.
 *
 * Ausschüttungen werden auf quantity = 1 / price = Gesamtbetrag normalisiert.
 * Damit ist `quantity * price - fee` bei allen drei Arten derselbe Geldfluss.
 *
 * @returns {object|null} null bei unbrauchbaren Daten
 */
export function normalizeInvestmentTransaction(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return null;

  const type = TRANSACTION_TYPES.includes(t.type) ? t.type : null;
  if (!type) return null;

  const depotId = typeof t.depotId === "string" ? t.depotId : "";
  const assetId = typeof t.assetId === "string" ? t.assetId : "";
  if (!depotId || !assetId) return null;

  const date = isIsoDate(t.date) ? t.date : null;
  if (!date) return null;

  const isDividend = type === "dividend";
  const quantity = isDividend ? 1 : positiveNumber(t.quantity);
  if (quantity === null) return null;

  const unit = isDividend ? "pcs" : QUANTITY_UNITS.includes(t.unit) ? t.unit : "pcs";

  // Preis 0 ist zulässig (Gratisaktien, Ausbuchungen), negativ nicht.
  const price = nonNegativeNumber(t.price, null);
  if (price === null) return null;

  const fxRate = positiveNumber(t.fxRate) ?? 1;
  const currency = cleanString(t.currency, 3).toUpperCase();

  return {
    id: typeof t.id === "string" && t.id ? t.id : generateId("itx"),
    depotId,
    assetId,
    type,
    date,
    quantity,
    unit,
    price,
    fee: nonNegativeNumber(t.fee, 0),
    currency: currency || "USD",
    fxRate,
    note: cleanString(t.note, 200),
    createdAt: isoTimestamp(t.createdAt),
  };
}

/**
 * Erzwingt Shape eines Tages-Snapshots des Depotwerts.
 * @returns {object|null}
 */
export function normalizeSnapshot(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  if (!isIsoDate(s.date)) return null;
  const total = Number(s.total);
  if (!Number.isFinite(total)) return null;

  const byDepot = Array.isArray(s.byDepot)
    ? s.byDepot
        .map((row) => {
          if (!row || typeof row.depotId !== "string" || !row.depotId) return null;
          const value = Number(row.value);
          return Number.isFinite(value) ? { depotId: row.depotId, value } : null;
        })
        .filter(Boolean)
    : [];

  return {
    date: s.date,
    currency: cleanString(s.currency, 3).toUpperCase() || "CHF",
    total,
    byDepot,
  };
}

/**
 * Normalisiert die gesamte Investment-Struktur eines Buchs.
 *
 * Verwaiste Transaktionen (unbekanntes Depot oder Asset) werden entfernt:
 * sie sind in keinem View sichtbar, würden aber in Summen einfliessen —
 * ein unsichtbarer Geisterwert ist schlimmer als der Verlust einer aus einem
 * manipulierten Backup stammenden Zeile. Das reguläre Löschen eines Depots
 * räumt seine Transaktionen in der UI mit auf, nicht erst hier.
 *
 * @param {unknown} inv
 * @returns {{depots: array, assets: array, transactions: array, snapshots: array}}
 */
export function normalizeInvestments(inv) {
  if (!inv || typeof inv !== "object" || Array.isArray(inv)) return emptyInvestments();

  const depots = Array.isArray(inv.depots)
    ? inv.depots.map(normalizeDepot).filter(Boolean)
    : [];
  const assets = Array.isArray(inv.assets)
    ? inv.assets.map(normalizeAsset).filter(Boolean)
    : [];

  const depotIds = new Set(depots.map((d) => d.id));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const transactions = (Array.isArray(inv.transactions) ? inv.transactions : [])
    .map(normalizeInvestmentTransaction)
    .filter(Boolean)
    .filter((t) => depotIds.has(t.depotId) && assetById.has(t.assetId))
    .map((t) => {
      // Einheit gegen die Art des Assets erzwingen: Stück für Wertpapiere,
      // Gramm/Unze für Metalle. Sonst wäre die Bewertung um Faktor 31 daneben.
      const asset = assetById.get(t.assetId);
      if (t.type === "dividend") return t;
      if (asset.kind === "metal") {
        return t.unit === "g" || t.unit === "oz" ? t : { ...t, unit: "oz" };
      }
      return t.unit === "pcs" ? t : { ...t, unit: "pcs" };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const snapshots = (Array.isArray(inv.snapshots) ? inv.snapshots : [])
    .map(normalizeSnapshot)
    .filter(Boolean);

  // Höchstens ein Snapshot pro Tag — der zuletzt geschriebene gewinnt.
  const byDate = new Map();
  for (const s of snapshots) byDate.set(s.date, s);

  return {
    depots,
    assets,
    transactions,
    snapshots: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

/** Erzeugt ein neues Depot mit frischer id. @returns {object|null} */
export function makeDepot(fields = {}) {
  return normalizeDepot({ createdAt: new Date().toISOString(), ...fields, id: fields.id || generateId("dep") });
}

/** Erzeugt einen neuen Asset-Stammsatz mit frischer id. @returns {object|null} */
export function makeAsset(fields = {}) {
  return normalizeAsset({ ...fields, id: fields.id || generateId("ast") });
}

/** Erzeugt eine neue Transaktion mit frischer id. @returns {object|null} */
export function makeInvestmentTransaction(fields = {}) {
  return normalizeInvestmentTransaction({
    createdAt: new Date().toISOString(),
    ...fields,
    id: fields.id || generateId("itx"),
  });
}
