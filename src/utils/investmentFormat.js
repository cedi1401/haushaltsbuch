// Anzeigeformate des Investment-Views. Bewusst getrennt von investmentUtils.js:
// dort steht die Rechnung, hier nur die Darstellung.
//
// Beträge laufen weiterhin über `fmt` aus dem CurrencyContext — hier stehen nur
// die Formate, die es dort nicht gibt (Stückzahlen, Prozente, Zeitstempel).

import { QUANTITY_UNIT_LABELS } from "./investmentModel.js";

/**
 * Menge mit Einheit. Stückzahlen sind meist glatt, Feinunzen und Gramm nicht —
 * deshalb bis zu vier Nachkommastellen, aber keine Nullen zum Auffüllen
 * (3 Stk statt 3,0000 Stk).
 *
 * @param {number} quantity
 * @param {"pcs"|"g"|"oz"} unit
 * @returns {string}
 */
export function formatQuantity(quantity, unit = "pcs") {
  // Number(null) ist 0 und damit endlich — null muss vorher abgefangen werden,
  // sonst liest sich „kein Bestand bekannt" wie ein Bestand von 0.
  if (quantity === null || quantity === undefined) return "—";
  const n = Number(quantity);
  if (!Number.isFinite(n)) return "—";
  const text = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
  const label = QUANTITY_UNIT_LABELS[unit] || QUANTITY_UNIT_LABELS.pcs;
  return `${text} ${label}`;
}

/**
 * Prozentwert mit Vorzeichen — für Rendite-Angaben.
 * `null` (keine Kostenbasis, kein Kurs) wird zu „—", nicht zu „0 %".
 *
 * @param {number|null} value
 * @param {{digits?: number, sign?: boolean}} options
 * @returns {string}
 */
export function formatPercent(value, { digits = 1, sign = true } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const text = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  return `${sign && n > 0 ? "+" : ""}${text} %`;
}

/**
 * Kurs in Handelswährung — mehr Nachkommastellen als bei Beträgen, weil ein
 * Kurs von 0,0842 sonst auf 0,08 zusammenfällt.
 *
 * @param {number|null} price
 * @param {string} currency ISO-Code der Handelswährung
 * @returns {string}
 */
export function formatQuotePrice(price, currency) {
  if (price === null || price === undefined || !Number.isFinite(Number(price))) return "—";
  const n = Number(price);
  const digits = Math.abs(n) >= 1 ? 2 : 4;
  const text = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  return currency ? `${text} ${currency}` : text;
}

/**
 * „Stand vom …" — der Zeitpunkt, an dem die Kurse geholt wurden. Heute nur mit
 * Uhrzeit, älter zusätzlich mit Datum: eine blosse Uhrzeit von vorgestern liest
 * sich wie ein aktueller Kurs.
 *
 * @param {string|null} iso
 * @param {Date} [now] nur für Tests
 * @returns {string}
 */
export function formatFetchedAt(iso, now = new Date()) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return time;

  const date = d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${date}, ${time}`;
}

/** Klassenname für einen Gewinn/Verlust-Wert. `null` bleibt neutral. */
export function gainClass(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "hb-muted";
  if (Number(value) > 0) return "hb-ok";
  if (Number(value) < 0) return "hb-bad";
  return "";
}
