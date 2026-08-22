// src/utils/fixedCostUtils.js
// Feldableitungen für Fixkosten-Positionen (recurringExpenses).
//
// Hintergrund: Bei einer Transfer-Position mit Turnus ("Rücklage"/Sinking Fund)
// ist `amount` der Rechnungsbetrag für den ganzen Zyklus — nicht mehr der Betrag
// pro Buchung. Was pro Monat gebucht wird, ist die Monatsrate. Alles in dieser
// Datei ist rein funktional und kennt weder React noch Einträge.

import { addMonthsISO } from "./financialMonthUtils.js";

/**
 * Zykluslänge in Monaten. 1, wenn kein Turnus gesetzt ist — dadurch sind
 * monthlyRate() und annualAmount() für alle Positionen ohne Turnus
 * wertidentisch mit `amount` bzw. `amount * 12`.
 * @param {{ turnus?: number|null }} item
 * @returns {number}
 */
export function turnusMonths(item) {
  const n = Number(item?.turnus);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Der Betrag, der pro Monat gebucht wird.
 * expense → amount; transfer → amount / turnusMonths(item).
 *
 * Dies ist die EINZIGE Rundungsstelle der Turnus-Rechnung (Entscheidung D5):
 * Würden mehrere Stellen unabhängig runden, drifteten Soll- und Ist-Stand genau
 * um den Betrag auseinander, den die Toleranz abfangen soll.
 * @param {{ kind?: string, amount?: number|string, turnus?: number|null }} item
 * @returns {number}
 */
export function monthlyRate(item) {
  const amount = Number(item?.amount || 0);
  if (!Number.isFinite(amount)) return 0;
  if (item?.kind !== "transfer") return amount;
  return Math.round((amount / turnusMonths(item)) * 100) / 100;
}

/**
 * Jahresbetrag = monthlyRate(item) * 12.
 *
 * Bewusst über die gerundete Monatsrate (Entscheidung D4): Eine Jahresrechnung
 * über 1000 ergibt 999.96, nicht 1000. Die Zahl soll zeigen, was tatsächlich
 * gebucht wird — zwölf gerundete Raten. Eine Sonderregel für turnus === 12 würde
 * den Wert gegenüber allen anderen Turnussen inkonsistent machen.
 * @param {object} item
 * @returns {number}
 */
export function annualAmount(item) {
  return monthlyRate(item) * 12;
}

/**
 * Ist die Position eine Rücklage? Zugleich die Kostenregel: nur Positionen mit
 * Turnus zählen in die Fixkosten-Belastung, Transfers ohne Turnus sind "freies
 * Sparen".
 * @param {{ kind?: string, turnus?: number|null }} item
 * @returns {boolean}
 */
export function isSinkingFund(item) {
  return item?.kind === "transfer" && Number(item?.turnus) > 0;
}

// ── Zyklusrechnung ───────────────────────────────────────────────────────
// Ab hier wird nicht mehr nur das Item gelesen, sondern auch die Buchungen.
// Alle Funktionen bekommen `today` als Parameter injiziert (nie `new Date()`
// im Funktionskörper) — sonst wäre die Logik nicht testbar.

/**
 * Bestimmt den Zyklus einer Rücklage.
 *
 * Zyklusbeginn ist die jüngste Entnahme für diesen Zweck — jede Entnahme zählt,
 * ohne Schwellenwert: Ein Rücklagen-Zweck wird nicht zweckentfremdet, eine
 * Entnahme daraus IST damit die Rechnungszahlung. Gibt es noch keine, wird der
 * Zyklus aus der hinterlegten Fälligkeit zurückgerechnet (Mitteneinstieg).
 *
 * Gerechnet wird taggenau; nur der Soll-Stand in sinkingFundStatus() läuft auf
 * Monatsebene. Bei einer Fälligkeit am Monatsende klemmt addMonthsISO() den Tag
 * (31.03. −1M → 28.02.); nextDue wandert dadurch auf den geklemmten Tag mit.
 *
 * @param {object} item - Fixkosten-Position
 * @param {Array} entries - alle Einträge des Buchs
 * @returns {{ cycleStart: string, nextDue: string, lastPayment: string|null,
 *             anchorSource: "withdrawal"|"faelligkeit" }|null}
 *          null, wenn die Position keine Rücklage ist oder kein Anker existiert
 */
export function cycleAnchor(item, entries) {
  if (!isSinkingFund(item)) return null;

  const purpose = String(item?.transferCategory ?? "").trim();
  let lastPayment = null;
  for (const e of entries || []) {
    if (e.kind !== "withdrawal") continue;
    if (e.potId !== item.potId) continue;
    if (String(e.category ?? "").trim() !== purpose) continue;
    if (!e.date) continue;
    if (lastPayment === null || e.date > lastPayment) lastPayment = e.date;
  }

  const months = turnusMonths(item);
  // Ohne Entnahme UND ohne Fälligkeit gäbe es keinen Anker. Die Normalisierung
  // in hbUtils schliesst diesen Halbzustand aus; hier steht der Fall nur, damit
  // ein manipuliertes Backup keine NaN-Daten erzeugt.
  if (!lastPayment && !item?.faelligkeit) return null;

  const cycleStart = lastPayment ?? addMonthsISO(item.faelligkeit, -months);
  return {
    cycleStart,
    nextDue: addMonthsISO(cycleStart, months),
    lastPayment,
    anchorSource: lastPayment ? "withdrawal" : "faelligkeit",
  };
}
