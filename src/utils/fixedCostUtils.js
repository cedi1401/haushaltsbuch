// src/utils/fixedCostUtils.js
// Feldableitungen für Fixkosten-Positionen (recurringExpenses).
//
// Hintergrund: Bei einer Transfer-Position mit Turnus ("Rücklage"/Sinking Fund)
// ist `amount` der Rechnungsbetrag für den ganzen Zyklus — nicht mehr der Betrag
// pro Buchung. Was pro Monat gebucht wird, ist die Monatsrate. Alles in dieser
// Datei ist rein funktional und kennt weder React noch Einträge.

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
