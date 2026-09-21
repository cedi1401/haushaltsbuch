// src/utils/investmentUtils.js
//
// Rechenkern des Investment-Views: Bestand, Kostenbasis, Gewinn/Verlust,
// Allokation. Ausschließlich reine Funktionen — keine Abrufe, kein React,
// kein Zugriff auf den Speicher. Die Kurse kommen als fertige Map herein
// (siehe quoteMapFromBatch), damit alles hier ohne Netz testbar bleibt.
//
// Verbindliche Regeln (docs/investment-view-plan.md, Abschnitt 7):
//   - Bestand und Kostenbasis pro (depotId, assetId) — Durchschnittskosten,
//     kein FIFO, keine depotübergreifende Mischung.
//   - quantity * price ist immer der Bruttobetrag in `currency`.
//     Kauf: + fee auf die Kostenbasis. Verkauf: - fee vom Erlös.
//   - Umrechnung in die Buchwährung über den gespeicherten `fxRate` der
//     Transaktion, nie über den heutigen Kurs.
//   - Ausschüttung: quantity = 1, price = Gesamtbetrag; Bestand unberührt.
//   - Edelmetalle: Mengen werden auf Feinunzen normalisiert, weil GC=F/SI=F
//     in USD pro Feinunze notieren.

import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  METAL_SYMBOLS,
  toTroyOunces,
} from "./investmentModel.js";

// Mengen sind Gleitkommazahlen: 120 g werden zu 3.8580...  oz, und nach einem
// Vollverkauf bleibt ein Rest von 1e-16 stehen. Alles darunter gilt als null.
const QTY_EPSILON = 1e-9;

/** Schlüssel einer Position: dasselbe Wertpapier in zwei Depots bleibt getrennt. */
export function positionKey(depotId, assetId) {
  return `${depotId}::${assetId}`;
}

/**
 * Bewertungseinheit einer Position: Feinunzen bei Metallen, Stück sonst.
 * Transaktionen dürfen in g ODER oz erfasst sein; summierbar ist nur eine davon.
 * @param {object} asset
 * @returns {"pcs"|"oz"}
 */
export function positionUnit(asset) {
  return asset?.kind === "metal" ? "oz" : "pcs";
}

/**
 * Menge einer Transaktion in der Bewertungseinheit ihrer Position.
 * @param {object} tx
 * @param {object} asset
 * @returns {number}
 */
export function normalizedQuantity(tx, asset) {
  const q = Number(tx?.quantity);
  if (!Number.isFinite(q)) return 0;
  return asset?.kind === "metal" ? toTroyOunces(q, tx.unit) : q;
}

/**
 * Geldfluss einer Transaktion, einmal in Handelswährung und einmal in der
 * Buchwährung. `gross` ist quantity * price ohne Gebühr, `net` der Betrag,
 * der tatsächlich vom Konto geht (Kauf) bzw. ankommt (Verkauf/Ausschüttung).
 *
 * @param {object} tx
 * @returns {{gross: number, fee: number, net: number, grossBase: number, feeBase: number, netBase: number, fxRate: number}}
 */
export function transactionAmounts(tx) {
  const quantity = Number(tx?.quantity) || 0;
  const price = Number(tx?.price) || 0;
  const fee = Number(tx?.fee) || 0;
  const fxRate = Number(tx?.fxRate) > 0 ? Number(tx.fxRate) : 1;

  const gross = quantity * price;
  // Kauf: die Gebühr erhöht den Aufwand. Verkauf/Ausschüttung: sie mindert den Ertrag.
  const net = tx?.type === "buy" ? gross + fee : gross - fee;

  return {
    gross,
    fee,
    net,
    grossBase: gross * fxRate,
    feeBase: fee * fxRate,
    netBase: net * fxRate,
    fxRate,
  };
}

/**
 * Das Symbol, unter dem ein Asset bewertet wird. Bei Metallen ist das immer
 * das Future-Symbol, auch wenn im Stammsatz etwas anderes steht.
 * @param {object} asset
 * @returns {string}
 */
export function quoteSymbolFor(asset) {
  if (!asset) return "";
  if (asset.kind === "metal") return METAL_SYMBOLS[asset.metal] || asset.symbol || "";
  return asset.symbol || "";
}

/**
 * Macht aus der Antwort von fetchQuotes eine Map symbol -> Kursdaten.
 * Fehlgeschlagene Zeilen landen als { ok: false, error } in der Map, damit die
 * UI zwischen "nie abgerufen" und "Abruf fehlgeschlagen" unterscheiden kann.
 *
 * @param {{ok: boolean, data?: Array<{symbol: string, ok: boolean, data?: object, error?: string}>}} result
 * @returns {Map<string, object>}
 */
export function quoteMapFromBatch(result) {
  const map = new Map();
  if (!result?.ok || !Array.isArray(result.data)) return map;
  for (const row of result.data) {
    if (!row?.symbol) continue;
    map.set(
      row.symbol.toUpperCase(),
      row.ok ? { ok: true, ...row.data } : { ok: false, error: row.error || "Abruf fehlgeschlagen" },
    );
  }
  return map;
}

function lookupQuote(quotes, symbol) {
  if (!symbol) return null;
  if (quotes instanceof Map) return quotes.get(symbol.toUpperCase()) ?? null;
  if (quotes && typeof quotes === "object") return quotes[symbol.toUpperCase()] ?? quotes[symbol] ?? null;
  return null;
}

/**
 * Sammelt die Symbole, die für eine Bewertung abgerufen werden müssen.
 * Standardmäßig nur die mit Bestand — eine vollständig verkaufte Position
 * braucht keinen aktuellen Kurs mehr.
 *
 * @param {object} investments
 * @param {{onlyHeld?: boolean}} options
 * @returns {string[]} eindeutig, in stabiler Reihenfolge
 */
export function collectQuoteSymbols(investments, { onlyHeld = true } = {}) {
  const assets = Array.isArray(investments?.assets) ? investments.assets : [];
  if (!onlyHeld) {
    return [...new Set(assets.map(quoteSymbolFor).filter(Boolean))];
  }

  const held = new Set();
  for (const pos of calcPositions(investments)) {
    if (pos.isOpen) held.add(pos.assetId);
  }
  return [
    ...new Set(
      assets
        .filter((a) => held.has(a.id))
        .map(quoteSymbolFor)
        .filter(Boolean),
    ),
  ];
}

function sortForProcessing(transactions) {
  // Die Reihenfolge entscheidet über die Durchschnittskosten. normalizeInvestments
  // sortiert bereits nach Datum; createdAt entscheidet innerhalb eines Tages.
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

/**
 * Berechnet alle Positionen aus den Transaktionen — der Kern des Ganzen.
 *
 * Zurück kommen auch geschlossene Positionen (Bestand 0), weil ihre
 * realisierten Gewinne und Ausschüttungen in der Gesamtrendite bleiben.
 * Die Positionsliste filtert über `isOpen`.
 *
 * @param {object} investments book.investments
 * @param {Map<string, object>|object} [quotes] Kurse in Buchwährung, aus quoteMapFromBatch
 * @returns {Array<object>} je (depotId, assetId) eine Position
 */
export function calcPositions(investments, quotes = null) {
  const depots = Array.isArray(investments?.depots) ? investments.depots : [];
  const assets = Array.isArray(investments?.assets) ? investments.assets : [];
  const transactions = Array.isArray(investments?.transactions) ? investments.transactions : [];

  const depotById = new Map(depots.map((d) => [d.id, d]));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  /** @type {Map<string, object>} */
  const positions = new Map();

  for (const tx of sortForProcessing(transactions)) {
    const asset = assetById.get(tx.assetId);
    const depot = depotById.get(tx.depotId);
    // normalizeInvestments wirft verwaiste Transaktionen raus; hier nur die Absicherung,
    // falls der Rechenkern einmal auf unnormalisierte Daten losgelassen wird.
    if (!asset || !depot) continue;

    const key = positionKey(tx.depotId, tx.assetId);
    let pos = positions.get(key);
    if (!pos) {
      pos = {
        key,
        depotId: depot.id,
        depotName: depot.name,
        assetId: asset.id,
        symbol: asset.symbol,
        quoteSymbol: quoteSymbolFor(asset),
        name: asset.name,
        assetClass: asset.assetClass,
        kind: asset.kind,
        metal: asset.metal,
        quoteCurrency: asset.quoteCurrency,
        unit: positionUnit(asset),
        quantity: 0,
        costBasis: 0,
        invested: 0,
        proceeds: 0,
        realizedGain: 0,
        dividends: 0,
        fees: 0,
        transactionCount: 0,
        firstDate: tx.date,
        lastDate: tx.date,
        hasOversell: false,
      };
      positions.set(key, pos);
    }

    const amounts = transactionAmounts(tx);
    const qty = normalizedQuantity(tx, asset);

    pos.transactionCount += 1;
    pos.fees += amounts.feeBase;
    if (tx.date < pos.firstDate) pos.firstDate = tx.date;
    if (tx.date > pos.lastDate) pos.lastDate = tx.date;

    if (tx.type === "buy") {
      pos.quantity += qty;
      pos.costBasis += amounts.netBase;
      pos.invested += amounts.netBase;
    } else if (tx.type === "sell") {
      // Durchschnittskosten: der verkaufte Anteil nimmt seinen Anteil an der
      // Kostenbasis mit. Wer mehr verkauft als er hält (fehlerhafte Daten),
      // bekommt den gesamten Rest angerechnet statt eines negativen Bestands.
      const sellQty = Math.min(qty, pos.quantity);
      if (qty - pos.quantity > QTY_EPSILON) pos.hasOversell = true;

      const costShare = pos.quantity > QTY_EPSILON ? pos.costBasis * (sellQty / pos.quantity) : pos.costBasis;

      pos.quantity -= sellQty;
      pos.costBasis -= costShare;
      pos.proceeds += amounts.netBase;
      pos.realizedGain += amounts.netBase - costShare;

      if (pos.quantity < QTY_EPSILON) {
        // Restbeträge aus der Gleitkomma-Division wegräumen, sonst zeigt eine
        // geschlossene Position eine Kostenbasis von 3e-14 an.
        pos.quantity = 0;
        pos.costBasis = 0;
      }
    } else if (tx.type === "dividend") {
      pos.dividends += amounts.netBase;
    }
  }

  return [...positions.values()].map((pos) => finalizePosition(pos, quotes));
}

function finalizePosition(pos, quotes) {
  const quote = lookupQuote(quotes, pos.quoteSymbol);
  const isOpen = pos.quantity > QTY_EPSILON;

  const priceOk = quote?.ok !== false && Number.isFinite(Number(quote?.price));
  const price = priceOk ? Number(quote.price) : null;
  const marketValue = priceOk && isOpen ? pos.quantity * price : priceOk ? 0 : null;

  const unrealizedGain = marketValue === null ? null : marketValue - pos.costBasis;
  const unrealizedGainPct =
    unrealizedGain === null || pos.costBasis <= 0 ? null : (unrealizedGain / pos.costBasis) * 100;

  const totalReturn =
    (unrealizedGain === null ? 0 : unrealizedGain) + pos.realizedGain + pos.dividends;
  const totalReturnPct = pos.invested > 0 ? (totalReturn / pos.invested) * 100 : null;

  return {
    ...pos,
    isOpen,
    avgCost: isOpen ? pos.costBasis / pos.quantity : null,
    price,
    priced: priceOk,
    quoteError: quote?.ok === false ? quote.error : null,
    quoteMissing: !quote,
    stale: quote?.stale === true,
    fetchedAt: quote?.fetchedAt ?? null,
    marketValue,
    unrealizedGain,
    unrealizedGainPct,
    // Gesamtrendite = nicht realisiert + realisiert + Ausschüttungen (Total Return).
    totalReturn,
    totalReturnPct,
  };
}

/**
 * Summiert Positionen zu einer Kennzahlenzeile — das Muster hinter allen
 * Summen (Depot, Gesamtdepot, Asset-Klasse).
 *
 * `marketValue` bleibt null, solange gar kein Kurs vorliegt; einzelne
 * unbewertete Positionen zählen als 0 und setzen `hasUnpriced`.
 *
 * @param {Array<object>} positions
 * @returns {object}
 */
export function summarizePositions(positions) {
  const list = Array.isArray(positions) ? positions : [];
  const open = list.filter((p) => p.isOpen);

  let marketValue = 0;
  let pricedCount = 0;
  let hasUnpriced = false;
  let stale = false;

  for (const p of open) {
    if (p.priced) {
      marketValue += p.marketValue || 0;
      pricedCount += 1;
      if (p.stale) stale = true;
    } else {
      hasUnpriced = true;
    }
  }

  const costBasis = open.reduce((s, p) => s + p.costBasis, 0);
  const realizedGain = list.reduce((s, p) => s + p.realizedGain, 0);
  const dividends = list.reduce((s, p) => s + p.dividends, 0);
  const invested = list.reduce((s, p) => s + p.invested, 0);
  const fees = list.reduce((s, p) => s + p.fees, 0);

  const valued = pricedCount > 0 || open.length === 0;
  const value = valued ? marketValue : null;
  const unrealizedGain = value === null ? null : value - costBasis;
  const unrealizedGainPct =
    unrealizedGain === null || costBasis <= 0 ? null : (unrealizedGain / costBasis) * 100;

  const totalReturn = (unrealizedGain === null ? 0 : unrealizedGain) + realizedGain + dividends;

  return {
    positionCount: open.length,
    marketValue: value,
    costBasis,
    invested,
    proceeds: list.reduce((s, p) => s + p.proceeds, 0),
    fees,
    realizedGain,
    dividends,
    unrealizedGain,
    unrealizedGainPct,
    totalReturn,
    totalReturnPct: invested > 0 ? (totalReturn / invested) * 100 : null,
    hasUnpriced,
    stale,
  };
}

/**
 * Die Vermögensübersicht: je Depot eine Summe, plus die zugehörigen Positionen.
 * Depots ohne Transaktionen erscheinen mit Wert 0 — sie sind angelegt und sollen
 * nicht unsichtbar sein.
 *
 * @param {object} investments
 * @param {Array<object>} positions Ergebnis von calcPositions
 * @returns {Array<{depotId: string, name: string, note: string, positions: Array<object>, summary: object}>}
 */
export function calcDepotSummaries(investments, positions) {
  const depots = Array.isArray(investments?.depots) ? investments.depots : [];
  const list = Array.isArray(positions) ? positions : [];

  return depots
    .map((depot) => {
      const own = list.filter((p) => p.depotId === depot.id);
      return {
        depotId: depot.id,
        name: depot.name,
        note: depot.note || "",
        positions: own.filter((p) => p.isOpen).sort(byValueDesc),
        closedPositions: own.filter((p) => !p.isOpen),
        summary: summarizePositions(own),
      };
    })
    .sort((a, b) => {
      const av = a.summary.marketValue ?? 0;
      const bv = b.summary.marketValue ?? 0;
      if (av !== bv) return bv - av;
      return a.name.localeCompare(b.name, "de");
    });
}

function byValueDesc(a, b) {
  const av = a.marketValue ?? 0;
  const bv = b.marketValue ?? 0;
  if (av !== bv) return bv - av;
  return String(a.name).localeCompare(String(b.name), "de");
}

/**
 * Allokation nach Asset-Klasse — die Daten hinter dem Donut.
 * Nur offene, bewertete Positionen; unbewertete würden die Anteile verfälschen.
 *
 * Je Klasse kommt die nicht realisierte G/V mit, gegen die Kostenbasis
 * derselben bewerteten Positionen gerechnet — sonst stünde neben einem Wert
 * ohne die unbewertete Position ein Einstand mit ihr.
 *
 * @param {Array<object>} positions
 * @returns {Array<{key: string, label: string, value: number, share: number,
 *   costBasis: number, unrealizedGain: number, unrealizedGainPct: number|null}>}
 */
export function calcAllocationByAssetClass(positions) {
  const buckets = new Map();
  for (const p of positions || []) {
    if (!p.isOpen || !p.priced) continue;
    const key = ASSET_CLASSES.includes(p.assetClass) ? p.assetClass : "other";
    const prev = buckets.get(key) || { value: 0, costBasis: 0 };
    prev.value += p.marketValue || 0;
    prev.costBasis += p.costBasis || 0;
    buckets.set(key, prev);
  }
  return sharesOf(
    [...buckets.entries()].map(([key, { value, costBasis }]) => {
      const unrealizedGain = value - costBasis;
      return {
        key,
        label: ASSET_CLASS_LABELS[key] || ASSET_CLASS_LABELS.other,
        value,
        costBasis,
        unrealizedGain,
        unrealizedGainPct: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : null,
      };
    }),
  );
}

/**
 * Allokation nach Depot — dieselbe Form wie calcAllocationByAssetClass,
 * damit beide dieselbe Donut-Komponente füllen können.
 *
 * @param {Array<object>} positions
 * @returns {Array<{key: string, label: string, value: number, share: number}>}
 */
export function calcAllocationByDepot(positions) {
  const buckets = new Map();
  for (const p of positions || []) {
    if (!p.isOpen || !p.priced) continue;
    const prev = buckets.get(p.depotId) || { key: p.depotId, label: p.depotName, value: 0 };
    prev.value += p.marketValue || 0;
    buckets.set(p.depotId, prev);
  }
  return sharesOf([...buckets.values()]);
}

function sharesOf(rows) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows
    .map((r) => ({ ...r, share: total > 0 ? (r.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Erzeugt einen Tages-Snapshot des Depotwerts (Beschluss F).
 *
 * Gibt null zurück, sobald auch nur eine offene Position unbewertet ist: eine
 * zu tiefe Tagessumme bleibt für immer in der Verlaufskurve stehen und ist
 * später nicht mehr als Fehler erkennbar. Kein Punkt ist besser als ein falscher.
 *
 * @param {Array<object>} depotSummaries Ergebnis von calcDepotSummaries
 * @param {{date: string, currency: string}} meta
 * @returns {object|null}
 */
export function buildSnapshot(depotSummaries, { date, currency }) {
  const rows = Array.isArray(depotSummaries) ? depotSummaries : [];
  const incomplete = rows.some((d) => d.summary.hasUnpriced || d.summary.marketValue === null);
  if (incomplete) return null;

  return {
    date,
    currency,
    total: rows.reduce((s, d) => s + d.summary.marketValue, 0),
    byDepot: rows.map((d) => ({ depotId: d.depotId, value: d.summary.marketValue })),
  };
}

/**
 * Trägt einen Snapshot ein: höchstens einer pro Tag, der neue gewinnt.
 * @param {Array<object>} snapshots
 * @param {object} snapshot
 * @returns {Array<object>} neue, nach Datum sortierte Liste
 */
export function upsertSnapshot(snapshots, snapshot) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  if (!snapshot?.date) return list;
  return [...list.filter((s) => s.date !== snapshot.date), snapshot].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Transaktionen einer Position, neueste zuerst — für die Detailansicht.
 * @param {object} investments
 * @param {string} depotId
 * @param {string} assetId
 * @returns {Array<object>}
 */
export function transactionsForPosition(investments, depotId, assetId) {
  const list = Array.isArray(investments?.transactions) ? investments.transactions : [];
  return list
    .filter((t) => t.depotId === depotId && t.assetId === assetId)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/**
 * Inhaltlicher Vergleich zweier Snapshots — der Wächter vor Schreib-Schleifen.
 *
 * Der Snapshot-Schreiber läuft nach jeder Bewertung. Ohne diesen Vergleich
 * würde jeder Durchlauf das Buch speichern, das gespeicherte Buch eine neue
 * Berechnung auslösen und der View endlos im Kreis schreiben.
 *
 * Verglichen wird auf Cent-Genauigkeit: Gleitkommasummen derselben Eingaben
 * sind zwar bitgleich, ein neu abgerufener Kurs ändert den Wert aber echt —
 * und genau dann soll der Tagespunkt aktualisiert werden.
 *
 * @param {object|null} a
 * @param {object|null} b
 * @returns {boolean}
 */
export function sameSnapshot(a, b) {
  if (!a || !b) return false;
  if (a.date !== b.date || a.currency !== b.currency) return false;
  if (!nearlyEqual(a.total, b.total)) return false;

  const rowsA = Array.isArray(a.byDepot) ? a.byDepot : [];
  const rowsB = Array.isArray(b.byDepot) ? b.byDepot : [];
  if (rowsA.length !== rowsB.length) return false;

  const byId = new Map(rowsB.map((r) => [r.depotId, r.value]));
  return rowsA.every((r) => byId.has(r.depotId) && nearlyEqual(r.value, byId.get(r.depotId)));
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

/**
 * Kennzahlen der Verlaufskurve: erster und letzter Punkt plus die Veränderung
 * dazwischen. Bei weniger als zwei Punkten gibt es keine Veränderung — `null`,
 * nicht 0, sonst behauptet die Karte eine Entwicklung, die niemand gemessen hat.
 *
 * @param {Array<object>} snapshots nach Datum sortiert (upsertSnapshot garantiert das)
 * @returns {{count: number, first: object|null, last: object|null, change: number|null, changePct: number|null}}
 */
export function summarizeSnapshots(snapshots) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  const first = list[0] || null;
  const last = list.length > 0 ? list[list.length - 1] : null;

  if (list.length < 2) {
    return { count: list.length, first, last, change: null, changePct: null };
  }

  const change = last.total - first.total;
  return {
    count: list.length,
    first,
    last,
    change,
    changePct: first.total > 0 ? (change / first.total) * 100 : null,
  };
}

/** Zeiträume des Verlaufs; die Monatswerte sind Kalendermonate, keine 30-Tage-Blöcke. */
export const HISTORY_RANGES = ["1m", "3m", "6m", "12m", "ytd", "all"];

const RANGE_MONTHS = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 };

/**
 * Verschiebt ein ISO-Datum um ganze Kalendermonate zurück. Ein Monatsende,
 * das es im Zielmonat nicht gibt, fällt auf dessen letzten Tag (31.03. → 28.02.)
 * statt in den Folgemonat zu überlaufen. Gerechnet in UTC, damit keine
 * Sommerzeitumstellung einen Tag verschluckt.
 *
 * @param {string} iso "YYYY-MM-DD"
 * @param {number} months
 * @returns {string}
 */
export function shiftMonthsBack(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - months, d));
  if (date.getUTCDate() !== d) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

/**
 * Die Snapshots eines Zeitraums für die Verlaufskurve.
 *
 * Anker ist der letzte Snapshot, nicht die Uhr: das hält die Funktion rein und
 * zeigt auch nach längerer Pause die letzten Wochen. YTD meint entsprechend
 * das Jahr des letzten Snapshots.
 *
 * Der letzte Punkt vor dem Fensterbeginn kommt mit, damit die Linie am linken
 * Rand beginnt statt mitten im Fenster. `domainStart` ist der Fensterbeginn,
 * frühestens aber der erste Snapshot — eine kurze Historie soll die Achse
 * nicht mit Leere füllen.
 *
 * @param {Array<object>} snapshots nach Datum sortiert
 * @param {string} range einer von HISTORY_RANGES
 * @returns {{rows: Array<object>, domainStart: string|null}}
 */
export function windowSnapshots(snapshots, range) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  if (list.length === 0) return { rows: [], domainStart: null };

  const firstDate = list[0].date;
  const lastDate = list[list.length - 1].date;
  let start = null;
  if (range === "ytd") start = `${lastDate.slice(0, 4)}-01-01`;
  else if (RANGE_MONTHS[range]) start = shiftMonthsBack(lastDate, RANGE_MONTHS[range]);

  if (!start || start <= firstDate) return { rows: list, domainStart: firstDate };

  const idx = list.findIndex((s) => s.date >= start);
  return { rows: list.slice(Math.max(0, idx - 1)), domainStart: start };
}

/**
 * Alle Transaktionen als flache Zeilen für die Transaktionstabelle —
 * angereichert um Depot- und Wertpapiernamen, die in der Transaktion selbst
 * nur als Id stehen.
 *
 * `cashFlowBase` ist der Geldfluss aus Sicht des Haushalts: Käufe negativ,
 * Verkäufe und Ausschüttungen positiv. Damit ist die Spalte summierbar und
 * eine Zeile ohne Vorzeichen nie mehrdeutig.
 *
 * Verwaiste Zeilen (Depot oder Asset gelöscht) fallen raus — dieselbe Regel
 * wie im Rechenkern.
 *
 * @param {object} investments
 * @returns {Array<object>} neueste zuerst
 */
export function listTransactions(investments) {
  const depotById = new Map((investments?.depots || []).map((d) => [d.id, d]));
  const assetById = new Map((investments?.assets || []).map((a) => [a.id, a]));
  const list = Array.isArray(investments?.transactions) ? investments.transactions : [];

  return list
    .map((tx) => {
      const depot = depotById.get(tx.depotId);
      const asset = assetById.get(tx.assetId);
      if (!depot || !asset) return null;

      const amounts = transactionAmounts(tx);
      const sign = tx.type === "buy" ? -1 : 1;

      return {
        ...tx,
        depotName: depot.name,
        name: asset.name,
        symbol: asset.symbol,
        quoteSymbol: quoteSymbolFor(asset),
        assetClass: asset.assetClass,
        kind: asset.kind,
        gross: amounts.gross,
        net: amounts.net,
        netBase: amounts.netBase,
        feeBase: amounts.feeBase,
        cashFlowBase: sign * amounts.netBase,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
}
