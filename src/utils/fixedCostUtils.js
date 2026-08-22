// src/utils/fixedCostUtils.js
// Feldableitungen für Fixkosten-Positionen (recurringExpenses).
//
// Hintergrund: Bei einer Transfer-Position mit Turnus ("Rücklage"/Sinking Fund)
// ist `amount` der Rechnungsbetrag für den ganzen Zyklus — nicht mehr der Betrag
// pro Buchung. Was pro Monat gebucht wird, ist die Monatsrate. Alles in dieser
// Datei ist rein funktional und kennt kein React; die Zyklusrechnung weiter
// unten liest zusätzlich die Buchungen des Buchs.

import { addMonthsISO, getFinancialMonth, getFinancialMonthRange } from "./financialMonthUtils.js";
import { potPurposeBalance } from "./potUtils.js";
import { todayISO } from "./hbUtils.js";

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

/**
 * Anzahl Finanzmonate von fromISO bis toISO, 0-basiert (derselbe Finanzmonat
 * ergibt 0). Negativ, wenn toISO davor liegt.
 *
 * Bewusst privat: costGroupUtils.monthSpan() und goalUtils.diffMonthsInclusive()
 * rechnen beide INKLUSIV und liefern damit eine um 1 höhere Zahl. Eine
 * Konsolidierung der drei Varianten ist ein eigener Aufräumschritt.
 *
 * Beide Daten laufen durch dieselbe Finanzmonats-Funktion — würde nur eines
 * konvertiert, entstünden Off-by-one-Fehler, die bei monthStartDay === 1
 * unsichtbar blieben.
 * @returns {number|null}
 */
function financialMonthSpan(fromISO, toISO, monthStartDay) {
  const from = getFinancialMonth(fromISO, monthStartDay);
  const to = getFinancialMonth(toISO, monthStartDay);
  if (!from || !to) return null;
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/**
 * Soll-Ist-Vergleich einer Rücklage für den Rücklagen-View.
 *
 * Der Soll-Stand läuft auf Monatsebene (Finanzmonate), die Fälligkeit taggenau:
 * Gebucht wird einmal pro Monat, nicht anteilig pro Tag. Der Ist-Stand ist der
 * Netto-Stand des ZWECKS im Topf — absolut gerechnet, nicht seit Zyklusbeginn,
 * damit ein Rest aus dem Vorzyklus als Überdeckung sichtbar bleibt.
 *
 * @param {object} item - Fixkosten-Position
 * @param {Array} entries - alle Einträge des Buchs
 * @param {{ monthStartDay?: number, today?: string, targetSum?: number|null }} opts
 *        targetSum: Summe der Soll-Stände aller Positionen desselben Zwecks;
 *        gesetzt von buildSinkingFundRows() bei geteilten Zwecken (P4.3).
 * @returns {object}
 */
export function sinkingFundStatus(item, entries, opts = {}) {
  const { monthStartDay = 1, today = todayISO(), targetSum = null } = opts;

  const months = turnusMonths(item);
  const rate = monthlyRate(item);
  const cycleAmount = Number(item?.amount || 0) || 0;
  const actual = potPurposeBalance(entries, item?.potId, item?.transferCategory);
  const anchor = cycleAnchor(item, entries);

  // Freies Sparen: kein Turnus, keine Rechnung, keine Bewertung. Der Ist-Stand
  // bleibt trotzdem gefüllt — das Geld liegt ja im Topf.
  if (!anchor) {
    return {
      isSinkingFund: false,
      cycleStart: null,
      nextDue: null,
      lastPayment: null,
      anchorSource: null,
      turnusMonths: months,
      monthlyRate: rate,
      cycleAmount,
      elapsed: null,
      target: null,
      actual,
      delta: null,
      coverage: null,
      progress: null,
      tolerance: null,
      status: "free",
    };
  }

  const { cycleStart, nextDue, lastPayment, anchorSource } = anchor;

  // Der Monat des cycleStart zählt als 0; gedeckelt auf turnusMonths, damit der
  // Soll-Stand bei einer überfälligen Position nicht über den Rechnungsbetrag
  // hinauswächst. Für den Rückstandsausgleich gilt diese Deckelung NICHT
  // (buildCatchUpRates, Entscheidung D1).
  const span = financialMonthSpan(cycleStart, today, monthStartDay) ?? 0;
  const elapsed = Math.max(0, Math.min(span, months));

  const target = Math.min(rate * elapsed, cycleAmount);
  const delta = actual - target;
  // Rundungstoleranz: die Monatsrate ist auf 2 NK gerundet, über turnusMonths
  // Buchungen summiert sich der Rundungsfehler auf bis zu 0.01 × turnusMonths.
  const tolerance = 0.01 * months;

  // Deckungsgrad gegen die Soll-Summe des Zwecks, falls er geteilt wird — sonst
  // läse jede Zeile den vollen Zweck-Netto als "ihren" Ist-Stand.
  const coverageBase = targetSum === null ? target : targetSum;
  const coverage = coverageBase > 0 ? actual / coverageBase : null;
  const progress = cycleAmount > 0 ? actual / cycleAmount : null;

  let status;
  if (today >= addMonthsISO(nextDue, 1)) status = "overdue";
  else if (today >= nextDue) status = "due";
  else if (delta < -tolerance) status = "behind";
  else status = "onTrack";

  return {
    isSinkingFund: true,
    cycleStart,
    nextDue,
    lastPayment,
    anchorSource,
    turnusMonths: months,
    monthlyRate: rate,
    cycleAmount,
    elapsed,
    target,
    actual,
    delta,
    coverage,
    progress,
    tolerance,
    status,
  };
}

/**
 * Schlüssel eines Zwecks: Topf + Zweck. Zwei Positionen teilen sich einen
 * Ist-Stand genau dann, wenn beide übereinstimmen.
 */
function purposeKey(item) {
  return `${item?.potId ?? ""} ${String(item?.transferCategory ?? "").trim()}`;
}

/**
 * Die Zeilen des Rücklagen-Views: sinkingFundStatus() je Position, plus die
 * Auflösung geteilter Zwecke.
 *
 * Zwei Positionen dürfen denselben Zweck im selben Topf bespielen — dann teilen
 * sie sich zwangsläufig einen Ist-Stand. Die Zeilen bleiben getrennt (es sind
 * zwei Verpflichtungen mit eigenen Zyklen), aber der Deckungsgrad wird gegen die
 * SUMME der Soll-Stände dieses Zwecks gerechnet. Sonst zeigte jede Zeile den
 * vollen Zweck-Netto als "ihren" Ist-Stand und damit einen irreführend hohen
 * Deckungsgrad.
 *
 * Nur Rücklagen zählen in die Gruppierung: freies Sparen hat keinen Soll-Stand
 * und keine Bewertung, wäre in der Summe also ein Nullsummand und trüge die
 * Markierung ohne Aussage. (Ein freier Transfer auf denselben Zweck hebt den
 * Ist-Stand der Rücklage trotzdem — das lässt sich über Soll-Summen nicht
 * ausgleichen und bleibt eine bewusste Unschärfe.)
 *
 * @param {Array} items - Fixkosten-Positionen (bereits gefiltert, z.B. nur Transfers)
 * @param {Array} entries - alle Einträge des Buchs
 * @param {{ monthStartDay?: number, today?: string }} opts
 * @returns {Array<object>} sinkingFundStatus-Objekte, erweitert um `item`,
 *          `sharedPurpose` (teilt sich den Zweck mit mindestens einer weiteren
 *          Rücklage) und `sharedWith` (Anzahl der ANDEREN Positionen am Zweck)
 */
export function buildSinkingFundRows(items, entries, opts = {}) {
  const list = Array.isArray(items) ? items : [];

  // Durchgang 1: Status ohne Kenntnis der Nachbarn — coverage wird unten ersetzt.
  const base = list.map((item) => ({ item, status: sinkingFundStatus(item, entries, opts) }));

  const groups = new Map();
  for (const { item, status } of base) {
    if (!status.isSinkingFund) continue;
    const key = purposeKey(item);
    const prev = groups.get(key) || { targetSum: 0, count: 0 };
    prev.targetSum += status.target;
    prev.count += 1;
    groups.set(key, prev);
  }

  // Durchgang 2: coverage gegen die Soll-Summe des Zwecks.
  return base.map(({ item, status }) => {
    const group = status.isSinkingFund ? groups.get(purposeKey(item)) : null;
    const sharedWith = group ? group.count - 1 : 0;
    const coverage = group && group.targetSum > 0 ? status.actual / group.targetSum : status.coverage;
    return { ...status, item, coverage, sharedPurpose: sharedWith > 0, sharedWith };
  });
}

/**
 * Verschiebt einen YYYY-MM-String um delta Monate.
 */
function addYearMonth(yyyymm, delta) {
  const [y, m] = String(yyyymm).split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/**
 * Die Raten, mit denen ein Rückstand ausgeglichen wird: eine Buchung je
 * Finanzmonat von `cycleStart + 1` bis zum aktuellen Finanzmonat, jeweils auf
 * den ersten Tag des Finanzmonats datiert.
 *
 * **Ungedeckelt** (Entscheidung D1): Bei einer fälligen oder überfälligen
 * Position entstehen mehr Raten als `sinkingFundStatus().elapsed` — dieses ist
 * für den Soll-Stand auf `turnusMonths` gedeckelt, der Ausgleich nicht. Grund:
 * Die Einzelraten werden überhaupt nur deshalb rückdatiert erzeugt, damit die
 * Fixkosten-Trendlinie stimmt; eine Deckelung liesse genau dort wieder Lücken.
 * Die Rate-Summe liegt dadurch bewusst über `target` (das auf dem
 * Rechnungsbetrag gedeckelt ist) — das Geld läge real im Topf. `elapsed` darf
 * hier deshalb NICHT als Eingabe dienen; gezählt wird selbst.
 *
 * @param {object} item - Fixkosten-Position
 * @param {{ cycleStart: string, monthStartDay?: number, today?: string }} opts
 * @returns {Array<{ ym: string, date: string, amount: number }>}
 */
export function buildCatchUpRates(item, opts = {}) {
  const { cycleStart, monthStartDay = 1, today = todayISO() } = opts;
  if (!isSinkingFund(item) || !cycleStart) return [];

  const span = financialMonthSpan(cycleStart, today, monthStartDay);
  if (!span || span < 1) return [];

  const from = getFinancialMonth(cycleStart, monthStartDay);
  const amount = monthlyRate(item);
  const rates = [];
  for (let i = 1; i <= span; i++) {
    const ym = addYearMonth(from.yyyymm, i);
    const range = getFinancialMonthRange(ym, monthStartDay);
    if (!range) break; // defensiv: bei ungültigem yyyymm käme null zurück
    rates.push({ ym, date: range.startDate, amount });
  }
  return rates;
}
