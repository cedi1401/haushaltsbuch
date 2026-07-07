// src/utils/costGroupUtils.js
// Aggregation für den Kostenrechner ("Kostengruppen").
// Eine Kostengruppe bündelt frei gewählte (Unter-)Kategorien (z.B. "Auto" aus
// Benzin, Versicherung, Steuer, Reparatur) und berechnet die geglätteten
// Monatskosten: Gesamtausgaben ÷ Anzahl Kalendermonate im Zeitraum.
import { getEntryFinancialMonth, formatYearMonth } from "./financialMonthUtils.js";
import { todayISO } from "./hbUtils.js";

/**
 * Verschiebt einen YYYY-MM-String um delta Monate.
 * @param {string} yyyymm
 * @param {number} delta
 * @returns {string}
 */
function addMonths(yyyymm, delta) {
  const [y, m] = String(yyyymm).split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/**
 * Anzahl Monate von fromYm bis toYm inklusiv (beide YYYY-MM).
 * @returns {number}
 */
function monthSpan(fromYm, toYm) {
  const [fy, fm] = String(fromYm).split("-").map(Number);
  const [ty, tm] = String(toYm).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/**
 * Prüft, ob ein Eintrag zu einer Kostengruppe gehört.
 * Nur Ausgaben (kind="expense") zählen — unabhängig von source (month|pot),
 * da eine aus einem Topf bezahlte Reparatur trotzdem eine reale Kost ist.
 */
function entryMatchesGroup(entry, categoryIds, subcategoryIds) {
  if (!entry || entry.kind !== "expense") return false;
  return (
    (entry.categoryId != null && categoryIds.has(entry.categoryId)) ||
    (entry.subcategoryId != null && subcategoryIds.has(entry.subcategoryId))
  );
}

/**
 * Lückenlose Monats-Zeitreihe von fromYm bis toYm (beide YYYY-MM, inklusiv).
 * Monate ohne Buchungen erhalten total 0.
 *
 * @param {string} fromYm
 * @param {string} toYm
 * @param {Map<string, number>} totalsByYm
 * @returns {Array<{ ym:string, label:string, total:number }>}
 */
function buildMonthlySeries(fromYm, toYm, totalsByYm) {
  const series = [];
  const span = monthSpan(fromYm, toYm);
  if (!Number.isFinite(span) || span <= 0) return series;
  for (let i = 0; i < span; i++) {
    const ym = addMonths(fromYm, i);
    series.push({ ym, label: formatYearMonth(ym), total: totalsByYm.get(ym) || 0 });
  }
  return series;
}

/**
 * Rechnet geplante Posten auf einen erwarteten Betrag pro Monat um.
 * Jeder Posten trägt amount / intervalMonths zum monatlichen Soll bei.
 *
 * @param {Array} plannedItems - [{ id, name, amount, intervalMonths }]
 * @returns {{ expectedMonthly:number, items: Array<{ id, name, amount, intervalMonths, monthly }> }}
 */
export function calcExpectedMonthly(plannedItems) {
  const items = (plannedItems || []).map((p) => {
    const amount = Number(p.amount || 0);
    const interval = Math.max(1, Number(p.intervalMonths || 1));
    return { ...p, amount, intervalMonths: interval, monthly: amount / interval };
  });
  const expectedMonthly = items.reduce((s, p) => s + p.monthly, 0);
  return { expectedMonthly, items };
}

/**
 * Berechnet die Kennzahlen einer Kostengruppe über einen Zeitraum.
 *
 * @param {Object} group - { categoryIds: string[], subcategoryIds: string[] }
 * @param {Array} entries - alle Einträge des Buchs
 * @param {Object} opts
 * @param {"12"|"24"|"all"} opts.rangeOption - Zeitraum (Default "12")
 * @param {number} opts.monthStartDay
 * @param {string} [opts.today] - ISO-Datum (Default: heute)
 * @returns {{ total:number, monthCount:number, avgMonthly:number,
 *            entryCount:number, firstMonth:string, lastMonth:string,
 *            byCategory: Array<{ categoryId:string, subcategoryId:(string|null), total:number }>,
 *            monthlySeries: Array<{ ym:string, label:string, total:number }> }}
 */
export function calcCostGroupStats(group, entries, opts = {}) {
  const {
    rangeOption = "12",
    monthStartDay = 1,
    today = todayISO(),
  } = opts;

  const empty = {
    total: 0,
    monthCount: 0,
    avgMonthly: 0,
    entryCount: 0,
    firstMonth: "",
    lastMonth: "",
    byCategory: [],
    monthlySeries: [],
  };

  const categoryIds = new Set(group?.categoryIds || []);
  const subcategoryIds = new Set(group?.subcategoryIds || []);
  if (categoryIds.size === 0 && subcategoryIds.size === 0) return empty;

  const currentYm = getEntryFinancialMonth({ date: today }, monthStartDay);
  if (!currentYm) return empty;

  // Untergrenze des Zeitfensters bestimmen (null = unbegrenzt bei "all")
  let lowerYm = null;
  if (rangeOption === "12") lowerYm = addMonths(currentYm, -11);
  else if (rangeOption === "24") lowerYm = addMonths(currentYm, -23);

  // Passende Einträge im Zeitfenster sammeln
  const matched = [];
  for (const e of entries || []) {
    if (!entryMatchesGroup(e, categoryIds, subcategoryIds)) continue;
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym || ym > currentYm) continue; // Zukunft ausklammern
    if (lowerYm && ym < lowerYm) continue;
    matched.push({ ...e, _ym: ym });
  }

  if (matched.length === 0) {
    // Auch ohne Buchungen ist die Monatszahl für feste Fenster definiert;
    // die Zeitreihe bleibt dann durchgehend 0 (bei "all" gibt es kein Fenster).
    const monthCount = rangeOption === "12" ? 12 : rangeOption === "24" ? 24 : 0;
    const monthlySeries = lowerYm ? buildMonthlySeries(lowerYm, currentYm, new Map()) : [];
    return { ...empty, monthCount, monthlySeries };
  }

  // Ist-Aufschlüsselung je (Unter-)Kategorie sammeln. Gruppierung per
  // subcategoryId || categoryId, damit gezielt gewählte Unterkategorien
  // getrennt bleiben, ganze Kategorien aber gebündelt erscheinen.
  let total = 0;
  let firstMonth = currentYm;
  const byCategoryMap = new Map();
  const totalsByYm = new Map();
  for (const e of matched) {
    const amount = Number(e.amount || 0);
    total += amount;
    if (e._ym < firstMonth) firstMonth = e._ym;
    totalsByYm.set(e._ym, (totalsByYm.get(e._ym) || 0) + amount);

    const key = e.subcategoryId || e.categoryId;
    const existing = byCategoryMap.get(key);
    if (existing) {
      existing.total += amount;
    } else {
      byCategoryMap.set(key, {
        categoryId: e.categoryId,
        subcategoryId: e.subcategoryId || null,
        total: amount,
      });
    }
  }
  const byCategory = Array.from(byCategoryMap.values()).sort((a, b) => b.total - a.total);

  // Monatszahl: feste Fenster behalten ihre Länge (Glättung über Leermonate),
  // "all" rechnet vom ersten Buchungsmonat bis zum aktuellen Monat.
  let monthCount;
  if (rangeOption === "12") monthCount = 12;
  else if (rangeOption === "24") monthCount = 24;
  else monthCount = monthSpan(firstMonth, currentYm);

  const avgMonthly = monthCount > 0 ? total / monthCount : 0;

  // Zeitreihe über das volle Fenster (feste Fenster ab lowerYm, "all" ab
  // erstem Buchungsmonat), Leermonate mit 0 aufgefüllt.
  const monthlySeries = buildMonthlySeries(lowerYm || firstMonth, currentYm, totalsByYm);

  return {
    total,
    monthCount,
    avgMonthly,
    entryCount: matched.length,
    firstMonth,
    lastMonth: currentYm,
    byCategory,
    monthlySeries,
  };
}
