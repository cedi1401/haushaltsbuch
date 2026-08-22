// src/utils/costGroupUtils.js
// Aggregation für den Kostenrechner ("Kostengruppen").
// Eine Kostengruppe bündelt frei gewählte (Unter-)Kategorien (z.B. "Auto" aus
// Benzin, Versicherung, Steuer, Reparatur) und berechnet die geglätteten
// Monatskosten: Gesamtausgaben ÷ Anzahl Kalendermonate im Zeitraum.
import { getEntryFinancialMonth, getFinancialMonthRange, formatYearMonth, addMonthsISO } from "./financialMonthUtils.js";
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

// ── Tagesgenaue Datums-Arithmetik ────────────────────────────────────────
// Nur der frei gewählte Zeitraum ("custom") rechnet auf Tagesebene; alles
// andere in dieser Datei bleibt monatsbasiert. Gerechnet wird in UTC, damit
// Sommerzeit-Sprünge keine halben Tage erzeugen.

const MS_PER_DAY = 86400000;

function toUTCDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Verschiebt ein ISO-Datum um n Tage. */
function addDaysISO(iso, n) {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Ganze Tage von isoA bis isoB (A inklusiv, B exklusiv). */
function daysBetween(isoA, isoB) {
  return Math.round((toUTCDate(isoB) - toUTCDate(isoA)) / MS_PER_DAY);
}

/**
 * Exakte Dauer eines tagesgenauen Zeitraums in Monaten (beide Grenzen inklusiv).
 * Volle Monatsschritte plus anteiliger Rest, gemessen an der echten Länge des
 * angebrochenen Monatsfensters — deckt der Zeitraum ganze Kalendermonate ab,
 * ergibt das exakt eine ganze Zahl.
 *
 * Beispiel: 15.03. – 30.06. → 3 volle Monate (15.03.→15.06.) + 16/30 Tage ≈ 3.53
 *
 * @param {string} fromISO
 * @param {string} toISO
 * @returns {number}
 */
function monthSpanExact(fromISO, toISO) {
  const endExcl = addDaysISO(toISO, 1);
  if (endExcl <= fromISO) return 0;

  // Obergrenze als Schutz vor Endlosschleifen bei absurden Datumswerten.
  let full = 0;
  while (full < 1200 && addMonthsISO(fromISO, full + 1) <= endExcl) full++;

  const anchor = addMonthsISO(fromISO, full);
  if (anchor >= endExcl) return full;

  const restDays = daysBetween(anchor, endExcl);
  const monthDays = daysBetween(anchor, addMonthsISO(fromISO, full + 1));
  return monthDays > 0 ? full + restDays / monthDays : full;
}

/**
 * Formatiert eine Monatsdauer für die Anzeige: ganze Zahlen ohne Dezimale,
 * angebrochene Zeiträume mit einer Nachkommastelle und deutschem Komma.
 * @param {number} n
 * @returns {string}
 */
export function formatMonthCount(n) {
  const v = Number(n) || 0;
  if (Math.abs(v - Math.round(v)) < 0.05) return String(Math.round(v));
  return v.toFixed(1).replace(".", ",");
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
 * Bei einem tagesgenauen Zeitraum (rangeFrom/rangeTo gesetzt) werden die
 * angeschnittenen Randmonate markiert: sie enthalten nur einen Teil ihrer
 * Tage und sind deshalb nicht mit den vollen Monaten vergleichbar.
 *
 * @param {string} fromYm
 * @param {string} toYm
 * @param {Map<string, number>} totalsByYm
 * @param {Object} [opts]
 * @param {number} [opts.monthStartDay]
 * @param {string} [opts.rangeFrom] - ISO-Datum, untere Fenstergrenze
 * @param {string} [opts.rangeTo] - ISO-Datum, obere Fenstergrenze
 * @returns {Array<{ ym:string, label:string, total:number,
 *                   partial?:boolean, partialFrom?:string, partialTo?:string }>}
 */
function buildMonthlySeries(fromYm, toYm, totalsByYm, opts = {}) {
  const { monthStartDay = 1, rangeFrom = "", rangeTo = "" } = opts;
  const series = [];
  const span = monthSpan(fromYm, toYm);
  if (!Number.isFinite(span) || span <= 0) return series;

  for (let i = 0; i < span; i++) {
    const ym = addMonths(fromYm, i);
    const point = { ym, label: formatYearMonth(ym), total: totalsByYm.get(ym) || 0 };

    if (rangeFrom || rangeTo) {
      const bounds = getFinancialMonthRange(ym, monthStartDay);
      if (bounds) {
        const start = rangeFrom > bounds.startDate ? rangeFrom : bounds.startDate;
        const end = rangeTo && rangeTo < bounds.endDate ? rangeTo : bounds.endDate;
        if (start !== bounds.startDate || end !== bounds.endDate) {
          point.partial = true;
          point.partialFrom = start;
          point.partialTo = end;
        }
      }
    }

    series.push(point);
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
 * @param {"12"|"24"|"all"|"custom"} opts.rangeOption - Zeitraum (Default "12")
 * @param {{ from:string, to:string }} [opts.customRange] - tagesgenauer Zeitraum bei rangeOption="custom"
 * @param {number} opts.monthStartDay
 * @param {string} [opts.today] - ISO-Datum (Default: heute)
 * @returns {{ total:number, monthCount:number, avgMonthly:number,
 *            entryCount:number, firstMonth:string, lastMonth:string,
 *            rangeFrom:string, rangeTo:string,
 *            byCategory: Array<{ categoryId:string, subcategoryId:(string|null), total:number }>,
 *            monthlySeries: Array<{ ym:string, label:string, total:number, partial?:boolean }> }}
 */
export function calcCostGroupStats(group, entries, opts = {}) {
  const {
    rangeOption = "12",
    customRange = null,
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
    rangeFrom: "",
    rangeTo: "",
    byCategory: [],
    monthlySeries: [],
  };

  const categoryIds = new Set(group?.categoryIds || []);
  const subcategoryIds = new Set(group?.subcategoryIds || []);
  if (categoryIds.size === 0 && subcategoryIds.size === 0) return empty;

  const currentYm = getEntryFinancialMonth({ date: today }, monthStartDay);
  if (!currentYm) return empty;

  // Frei gewählter Zeitraum: tagesgenaue Grenzen. Das Ende wird defensiv auf
  // heute begrenzt — der Kostenrechner zeigt Ist-Kosten, keine Zukunft.
  const isCustom = rangeOption === "custom";
  let rangeFrom = "";
  let rangeTo = "";
  let customFromYm = "";
  let customToYm = "";
  if (isCustom) {
    rangeFrom = customRange?.from || "";
    rangeTo = customRange?.to || "";
    if (rangeTo > today) rangeTo = today;
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return empty;
    customFromYm = getEntryFinancialMonth({ date: rangeFrom }, monthStartDay);
    customToYm = getEntryFinancialMonth({ date: rangeTo }, monthStartDay);
    if (!customFromYm || !customToYm) return empty;
  }

  // Untergrenze des Zeitfensters bestimmen (null = unbegrenzt bei "all")
  let lowerYm = null;
  if (rangeOption === "12") lowerYm = addMonths(currentYm, -11);
  else if (rangeOption === "24") lowerYm = addMonths(currentYm, -23);

  // Passende Einträge im Zeitfenster sammeln
  const matched = [];
  for (const e of entries || []) {
    if (!entryMatchesGroup(e, categoryIds, subcategoryIds)) continue;
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;
    if (isCustom) {
      // Tagesgenau filtern — die Finanzmonats-Zuordnung dient hier nur der
      // Zeitreihe, nicht der Zugehörigkeit zum Zeitraum.
      if (e.date < rangeFrom || e.date > rangeTo) continue;
    } else {
      if (ym > currentYm) continue; // Zukunft ausklammern
      if (lowerYm && ym < lowerYm) continue;
    }
    matched.push({ ...e, _ym: ym });
  }

  if (matched.length === 0) {
    // Auch ohne Buchungen ist die Monatszahl für feste Fenster definiert;
    // die Zeitreihe bleibt dann durchgehend 0 (bei "all" gibt es kein Fenster).
    if (isCustom) {
      return {
        ...empty,
        monthCount: monthSpanExact(rangeFrom, rangeTo),
        monthlySeries: buildMonthlySeries(customFromYm, customToYm, new Map(), {
          monthStartDay,
          rangeFrom,
          rangeTo,
        }),
        rangeFrom,
        rangeTo,
      };
    }
    const monthCount = rangeOption === "12" ? 12 : rangeOption === "24" ? 24 : 0;
    const monthlySeries = lowerYm ? buildMonthlySeries(lowerYm, currentYm, new Map()) : [];
    return { ...empty, monthCount, monthlySeries };
  }

  // Ist-Aufschlüsselung je (Unter-)Kategorie sammeln. Gruppierung per
  // subcategoryId || categoryId, damit gezielt gewählte Unterkategorien
  // getrennt bleiben, ganze Kategorien aber gebündelt erscheinen.
  let total = 0;
  let firstMonth = isCustom ? customToYm : currentYm;
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
  // "all" rechnet vom ersten Buchungsmonat bis zum aktuellen Monat, der freie
  // Zeitraum exakt auf den Tag (angebrochene Randmonate zählen anteilig).
  let monthCount;
  if (isCustom) monthCount = monthSpanExact(rangeFrom, rangeTo);
  else if (rangeOption === "12") monthCount = 12;
  else if (rangeOption === "24") monthCount = 24;
  else monthCount = monthSpan(firstMonth, currentYm);

  const avgMonthly = monthCount > 0 ? total / monthCount : 0;

  // Zeitreihe über das volle Fenster (feste Fenster ab lowerYm, "all" ab
  // erstem Buchungsmonat), Leermonate mit 0 aufgefüllt.
  const monthlySeries = isCustom
    ? buildMonthlySeries(customFromYm, customToYm, totalsByYm, { monthStartDay, rangeFrom, rangeTo })
    : buildMonthlySeries(lowerYm || firstMonth, currentYm, totalsByYm);

  return {
    total,
    monthCount,
    avgMonthly,
    entryCount: matched.length,
    firstMonth,
    lastMonth: isCustom ? customToYm : currentYm,
    rangeFrom,
    rangeTo,
    byCategory,
    monthlySeries,
  };
}
