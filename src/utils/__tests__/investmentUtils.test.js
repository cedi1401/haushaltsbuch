import { describe, it, expect } from 'vitest';
import { GRAMS_PER_TROY_OUNCE, METAL_SYMBOLS } from '../investmentModel.js';
import {
  buildSnapshot,
  calcAllocationByAssetClass,
  calcAllocationByDepot,
  calcDepotSummaries,
  calcPositions,
  collectQuoteSymbols,
  normalizedQuantity,
  positionKey,
  positionUnit,
  quoteMapFromBatch,
  quoteSymbolFor,
  summarizePositions,
  transactionAmounts,
  transactionsForPosition,
  upsertSnapshot,
} from '../investmentUtils.js';

// --- Fixtures -------------------------------------------------------------

const DEPOT_A = { id: 'dep_a', name: 'Swissquote', note: '', createdAt: '2026-01-01T00:00:00.000Z' };
const DEPOT_B = { id: 'dep_b', name: 'Zu Hause', note: 'Tresor', createdAt: '2026-01-01T00:00:00.000Z' };

const ETF = {
  id: 'ast_etf',
  symbol: 'VWRL.SW',
  name: 'Vanguard FTSE All-World',
  assetClass: 'etf',
  quoteCurrency: 'CHF',
  kind: 'security',
  metal: null,
};
const STOCK = {
  id: 'ast_stock',
  symbol: 'AAPL',
  name: 'Apple',
  assetClass: 'stock',
  quoteCurrency: 'USD',
  kind: 'security',
  metal: null,
};
const GOLD = {
  id: 'ast_gold',
  symbol: METAL_SYMBOLS.gold,
  name: 'Gold',
  assetClass: 'metal',
  quoteCurrency: 'USD',
  kind: 'metal',
  metal: 'gold',
};

let seq = 0;
function tx(fields) {
  seq += 1;
  return {
    id: `itx_${seq}`,
    depotId: DEPOT_A.id,
    assetId: ETF.id,
    type: 'buy',
    date: '2026-03-01',
    quantity: 1,
    unit: 'pcs',
    price: 100,
    fee: 0,
    currency: 'CHF',
    fxRate: 1,
    note: '',
    createdAt: `2026-03-01T00:00:${String(seq).padStart(2, '0')}.000Z`,
    ...fields,
  };
}

function book(transactions, { depots = [DEPOT_A, DEPOT_B], assets = [ETF, STOCK, GOLD] } = {}) {
  return { depots, assets, transactions, snapshots: [] };
}

function only(positions) {
  expect(positions).toHaveLength(1);
  return positions[0];
}

// --- transactionAmounts ---------------------------------------------------

describe('transactionAmounts', () => {
  it('rechnet die Gebühr beim Kauf auf den Aufwand', () => {
    const a = transactionAmounts(tx({ type: 'buy', quantity: 10, price: 100, fee: 9 }));
    expect(a.gross).toBe(1000);
    expect(a.net).toBe(1009);
  });

  it('zieht die Gebühr beim Verkauf vom Erlös ab', () => {
    const a = transactionAmounts(tx({ type: 'sell', quantity: 10, price: 100, fee: 9 }));
    expect(a.net).toBe(991);
  });

  it('zieht die Gebühr auch bei der Ausschüttung ab', () => {
    const a = transactionAmounts(tx({ type: 'dividend', quantity: 1, price: 50, fee: 2 }));
    expect(a.net).toBe(48);
  });

  it('rechnet mit dem gespeicherten fxRate in die Buchwährung um', () => {
    const a = transactionAmounts(tx({ type: 'buy', quantity: 10, price: 100, fee: 5, currency: 'USD', fxRate: 0.9 }));
    expect(a.grossBase).toBeCloseTo(900, 10);
    expect(a.feeBase).toBeCloseTo(4.5, 10);
    expect(a.netBase).toBeCloseTo(904.5, 10);
  });

  it('fällt bei fehlendem fxRate auf 1 zurück', () => {
    const a = transactionAmounts({ type: 'buy', quantity: 2, price: 10, fee: 0 });
    expect(a.netBase).toBe(20);
  });
});

// --- Einheiten ------------------------------------------------------------

describe('Einheiten', () => {
  it('bewertet Wertpapiere in Stück und Metalle in Feinunzen', () => {
    expect(positionUnit(ETF)).toBe('pcs');
    expect(positionUnit(GOLD)).toBe('oz');
  });

  it('rechnet Gramm-Mengen auf Feinunzen um, Stückzahlen nicht', () => {
    expect(normalizedQuantity(tx({ quantity: 100, unit: 'g' }), GOLD)).toBeCloseTo(100 / GRAMS_PER_TROY_OUNCE, 10);
    expect(normalizedQuantity(tx({ quantity: 3, unit: 'oz' }), GOLD)).toBe(3);
    expect(normalizedQuantity(tx({ quantity: 12, unit: 'pcs' }), ETF)).toBe(12);
  });

  it('bewertet Metalle immer über das Future-Symbol', () => {
    expect(quoteSymbolFor(GOLD)).toBe('GC=F');
    expect(quoteSymbolFor({ ...GOLD, symbol: 'IRGENDWAS' })).toBe('GC=F');
    expect(quoteSymbolFor(ETF)).toBe('VWRL.SW');
  });
});

// --- Bestand und Kostenbasis ---------------------------------------------

describe('calcPositions — Bestand und Kostenbasis', () => {
  it('bildet eine Position aus einem einzelnen Kauf', () => {
    const pos = only(calcPositions(book([tx({ quantity: 10, price: 100, fee: 9 })])));
    expect(pos.key).toBe(positionKey(DEPOT_A.id, ETF.id));
    expect(pos.quantity).toBe(10);
    expect(pos.costBasis).toBe(1009);
    expect(pos.avgCost).toBeCloseTo(100.9, 10);
    expect(pos.isOpen).toBe(true);
  });

  it('mittelt die Kosten über mehrere Käufe', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 10, price: 100 }),
          tx({ date: '2026-02-10', quantity: 10, price: 120 }),
        ]),
      ),
    );
    expect(pos.quantity).toBe(20);
    expect(pos.costBasis).toBe(2200);
    expect(pos.avgCost).toBe(110);
  });

  it('nimmt beim Teilverkauf den anteiligen Durchschnittspreis mit', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 10, price: 100 }),
          tx({ date: '2026-02-10', quantity: 10, price: 120 }),
          tx({ date: '2026-03-10', type: 'sell', quantity: 5, price: 130, fee: 5 }),
        ]),
      ),
    );
    // Kostenbasis 2200 bei 20 Stück → 550 für 5 Stück. Erlös 650 − 5 Gebühr.
    expect(pos.quantity).toBe(15);
    expect(pos.costBasis).toBe(1650);
    expect(pos.avgCost).toBe(110);
    expect(pos.proceeds).toBe(645);
    expect(pos.realizedGain).toBe(95);
  });

  it('schliesst die Position beim Vollverkauf sauber ab', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 3, price: 100 }),
          tx({ date: '2026-02-10', type: 'sell', quantity: 3, price: 150 }),
        ]),
      ),
    );
    expect(pos.quantity).toBe(0);
    expect(pos.costBasis).toBe(0);
    expect(pos.isOpen).toBe(false);
    expect(pos.avgCost).toBeNull();
    expect(pos.realizedGain).toBe(150);
  });

  it('lässt beim Verkauf in Teilschritten keinen Gleitkomma-Rest stehen', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 1, price: 300 }),
          tx({ date: '2026-02-10', type: 'sell', quantity: 1 / 3, price: 300 }),
          tx({ date: '2026-02-11', type: 'sell', quantity: 1 / 3, price: 300 }),
          tx({ date: '2026-02-12', type: 'sell', quantity: 1 / 3, price: 300 }),
        ]),
      ),
    );
    expect(pos.quantity).toBe(0);
    expect(pos.costBasis).toBe(0);
    expect(pos.isOpen).toBe(false);
  });

  it('meldet einen Verkauf über den Bestand hinaus, statt negativ zu werden', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 5, price: 100 }),
          tx({ date: '2026-02-10', type: 'sell', quantity: 8, price: 110 }),
        ]),
      ),
    );
    expect(pos.quantity).toBe(0);
    expect(pos.hasOversell).toBe(true);
    // Erlös der 8 Stück abzüglich der gesamten Kostenbasis von 500.
    expect(pos.realizedGain).toBe(380);
  });

  it('verarbeitet Transaktionen nach Datum, nicht nach Eingabereihenfolge', () => {
    const late = tx({ date: '2026-02-10', quantity: 10, price: 120 });
    const early = tx({ date: '2026-01-10', quantity: 10, price: 100 });
    const sell = tx({ date: '2026-03-10', type: 'sell', quantity: 10, price: 130 });
    // Nachträglich erfasster Kauf: steht hinten in der Liste, gehört aber nach vorn.
    const pos = only(calcPositions(book([late, sell, early])));
    expect(pos.costBasis).toBe(1100);
    expect(pos.realizedGain).toBe(200);
  });

  it('hält denselben Titel in zwei Depots getrennt', () => {
    const positions = calcPositions(
      book([
        tx({ depotId: DEPOT_A.id, quantity: 10, price: 100 }),
        tx({ depotId: DEPOT_B.id, quantity: 10, price: 200 }),
      ]),
    );
    expect(positions).toHaveLength(2);
    const a = positions.find((p) => p.depotId === DEPOT_A.id);
    const b = positions.find((p) => p.depotId === DEPOT_B.id);
    expect(a.avgCost).toBe(100);
    expect(b.avgCost).toBe(200);
  });

  it('ignoriert Transaktionen ohne passendes Depot oder Asset', () => {
    const positions = calcPositions(
      book([tx({ depotId: 'dep_weg' }), tx({ assetId: 'ast_weg' }), tx({ quantity: 1, price: 10 })]),
    );
    expect(positions).toHaveLength(1);
    expect(positions[0].costBasis).toBe(10);
  });

  it('rechnet Fremdwährungskäufe mit dem Kurs von damals', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ assetId: STOCK.id, date: '2026-01-10', quantity: 10, price: 200, fee: 5, currency: 'USD', fxRate: 0.9 }),
          tx({ assetId: STOCK.id, date: '2026-02-10', quantity: 10, price: 200, fee: 5, currency: 'USD', fxRate: 0.8 }),
        ]),
      ),
    );
    // 2005 × 0.9 + 2005 × 0.8 — der heutige Kurs spielt hier bewusst keine Rolle.
    expect(pos.costBasis).toBeCloseTo(1804.5 + 1604, 10);
  });

  it('lässt Ausschüttungen den Bestand unberührt', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 10, price: 100 }),
          tx({ date: '2026-02-10', type: 'dividend', quantity: 1, price: 42, fee: 2 }),
        ]),
      ),
    );
    expect(pos.quantity).toBe(10);
    expect(pos.costBasis).toBe(1000);
    expect(pos.dividends).toBe(40);
  });

  it('summiert Gramm- und Unzen-Käufe desselben Metalls in Feinunzen', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ assetId: GOLD.id, date: '2026-01-10', quantity: 100, unit: 'g', price: 75, currency: 'USD', fxRate: 0.9 }),
          tx({ assetId: GOLD.id, date: '2026-02-10', quantity: 2, unit: 'oz', price: 2400, currency: 'USD', fxRate: 0.9 }),
        ]),
      ),
    );
    expect(pos.unit).toBe('oz');
    expect(pos.quantity).toBeCloseTo(100 / GRAMS_PER_TROY_OUNCE + 2, 10);
    expect(pos.costBasis).toBeCloseTo((7500 + 4800) * 0.9, 10);
  });

  it('merkt sich erste und letzte Transaktion sowie deren Anzahl', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-05-10', quantity: 1, price: 10 }),
          tx({ date: '2026-01-10', quantity: 1, price: 10 }),
        ]),
      ),
    );
    expect(pos.firstDate).toBe('2026-01-10');
    expect(pos.lastDate).toBe('2026-05-10');
    expect(pos.transactionCount).toBe(2);
  });
});

// --- Bewertung mit Kursen -------------------------------------------------

describe('calcPositions — Bewertung', () => {
  const quotes = quoteMapFromBatch({
    ok: true,
    data: [
      { symbol: 'VWRL.SW', ok: true, data: { price: 130, currency: 'CHF', stale: false, fetchedAt: '2026-09-20T10:00:00.000Z' } },
      { symbol: 'GC=F', ok: true, data: { price: 2700, currency: 'CHF', stale: true, fetchedAt: '2026-09-19T10:00:00.000Z' } },
      { symbol: 'AAPL', ok: false, error: 'Unbekanntes Symbol' },
    ],
  });

  it('bewertet eine Position mit dem übergebenen Kurs', () => {
    const pos = only(calcPositions(book([tx({ quantity: 10, price: 100, fee: 9 })]), quotes));
    expect(pos.priced).toBe(true);
    expect(pos.price).toBe(130);
    expect(pos.marketValue).toBe(1300);
    expect(pos.unrealizedGain).toBe(291);
    expect(pos.unrealizedGainPct).toBeCloseTo((291 / 1009) * 100, 10);
  });

  it('bewertet Metalle je Feinunze', () => {
    const pos = only(
      calcPositions(
        book([tx({ assetId: GOLD.id, quantity: GRAMS_PER_TROY_OUNCE, unit: 'g', price: 80 })]),
        quotes,
      ),
    );
    expect(pos.marketValue).toBeCloseTo(2700, 8);
    expect(pos.stale).toBe(true);
    expect(pos.fetchedAt).toBe('2026-09-19T10:00:00.000Z');
  });

  it('meldet einen fehlgeschlagenen Abruf, statt mit 0 zu bewerten', () => {
    const pos = only(calcPositions(book([tx({ assetId: STOCK.id, quantity: 5, price: 100 })]), quotes));
    expect(pos.priced).toBe(false);
    expect(pos.marketValue).toBeNull();
    expect(pos.unrealizedGain).toBeNull();
    expect(pos.quoteError).toBe('Unbekanntes Symbol');
  });

  it('lässt ohne Kurse alles unbewertet', () => {
    const pos = only(calcPositions(book([tx({ quantity: 5, price: 100 })])));
    expect(pos.priced).toBe(false);
    expect(pos.quoteMissing).toBe(true);
    expect(pos.marketValue).toBeNull();
  });

  it('zählt nicht realisiert, realisiert und Ausschüttungen zur Gesamtrendite', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 20, price: 100 }),
          tx({ date: '2026-02-10', type: 'sell', quantity: 10, price: 150 }),
          tx({ date: '2026-03-10', type: 'dividend', quantity: 1, price: 60 }),
        ]),
        quotes,
      ),
    );
    // Bestand 10 zu 1000 Kosten, Kurs 130 → 300 nicht realisiert, 500 realisiert, 60 Ausschüttung.
    expect(pos.unrealizedGain).toBe(300);
    expect(pos.realizedGain).toBe(500);
    expect(pos.totalReturn).toBe(860);
    expect(pos.totalReturnPct).toBeCloseTo((860 / 2000) * 100, 10);
  });

  it('behält geschlossene Positionen mit ihrem realisierten Ergebnis', () => {
    const pos = only(
      calcPositions(
        book([
          tx({ date: '2026-01-10', quantity: 10, price: 100 }),
          tx({ date: '2026-02-10', type: 'sell', quantity: 10, price: 150 }),
        ]),
        quotes,
      ),
    );
    expect(pos.isOpen).toBe(false);
    expect(pos.marketValue).toBe(0);
    expect(pos.totalReturn).toBe(500);
  });
});

// --- quoteMapFromBatch ----------------------------------------------------

describe('quoteMapFromBatch', () => {
  it('trennt erfolgreiche von fehlgeschlagenen Zeilen', () => {
    const map = quoteMapFromBatch({
      ok: true,
      data: [
        { symbol: 'vwrl.sw', ok: true, data: { price: 130 } },
        { symbol: 'AAPL', ok: false, error: 'kaputt' },
      ],
    });
    expect(map.get('VWRL.SW')).toMatchObject({ ok: true, price: 130 });
    expect(map.get('AAPL')).toEqual({ ok: false, error: 'kaputt' });
  });

  it('gibt bei einem fehlgeschlagenen Stapel eine leere Map zurück', () => {
    expect(quoteMapFromBatch({ ok: false, error: 'offline' }).size).toBe(0);
    expect(quoteMapFromBatch(null).size).toBe(0);
  });
});

// --- collectQuoteSymbols --------------------------------------------------

describe('collectQuoteSymbols', () => {
  it('liefert nur Symbole mit Bestand, jedes einmal', () => {
    const investments = book([
      tx({ depotId: DEPOT_A.id, quantity: 10, price: 100 }),
      tx({ depotId: DEPOT_B.id, quantity: 5, price: 100 }),
      tx({ assetId: GOLD.id, quantity: 1, unit: 'oz', price: 2000 }),
      tx({ assetId: STOCK.id, date: '2026-01-10', quantity: 5, price: 100 }),
      tx({ assetId: STOCK.id, date: '2026-02-10', type: 'sell', quantity: 5, price: 100 }),
    ]);
    expect(collectQuoteSymbols(investments)).toEqual(['VWRL.SW', 'GC=F']);
  });

  it('liefert auf Wunsch alle Symbole der Stammdaten', () => {
    expect(collectQuoteSymbols(book([]), { onlyHeld: false })).toEqual(['VWRL.SW', 'AAPL', 'GC=F']);
  });
});

// --- Summen und Depots ----------------------------------------------------

describe('summarizePositions', () => {
  const quotes = quoteMapFromBatch({
    ok: true,
    data: [
      { symbol: 'VWRL.SW', ok: true, data: { price: 130 } },
      { symbol: 'AAPL', ok: false, error: 'kaputt' },
    ],
  });

  it('summiert Wert, Kostenbasis und Gewinn über Positionen', () => {
    const positions = calcPositions(
      book([
        tx({ depotId: DEPOT_A.id, quantity: 10, price: 100 }),
        tx({ depotId: DEPOT_B.id, quantity: 10, price: 90 }),
      ]),
      quotes,
    );
    const sum = summarizePositions(positions);
    expect(sum.positionCount).toBe(2);
    expect(sum.marketValue).toBe(2600);
    expect(sum.costBasis).toBe(1900);
    expect(sum.unrealizedGain).toBe(700);
    expect(sum.hasUnpriced).toBe(false);
  });

  it('markiert unbewertete Positionen, statt sie als 0 einzurechnen', () => {
    const positions = calcPositions(
      book([tx({ quantity: 10, price: 100 }), tx({ assetId: STOCK.id, quantity: 10, price: 50 })]),
      quotes,
    );
    const sum = summarizePositions(positions);
    expect(sum.marketValue).toBe(1300);
    expect(sum.hasUnpriced).toBe(true);
  });

  it('liefert für eine leere Liste eine Null-Zeile statt null', () => {
    const sum = summarizePositions([]);
    expect(sum.marketValue).toBe(0);
    expect(sum.positionCount).toBe(0);
    expect(sum.totalReturnPct).toBeNull();
  });
});

describe('calcDepotSummaries', () => {
  const quotes = quoteMapFromBatch({ ok: true, data: [{ symbol: 'VWRL.SW', ok: true, data: { price: 130 } }] });

  it('gruppiert nach Depot und sortiert nach Wert', () => {
    const investments = book([
      tx({ depotId: DEPOT_A.id, quantity: 5, price: 100 }),
      tx({ depotId: DEPOT_B.id, quantity: 20, price: 100 }),
    ]);
    const rows = calcDepotSummaries(investments, calcPositions(investments, quotes));
    expect(rows.map((r) => r.depotId)).toEqual([DEPOT_B.id, DEPOT_A.id]);
    expect(rows[0].summary.marketValue).toBe(2600);
    expect(rows[0].positions).toHaveLength(1);
  });

  it('zeigt ein Depot ohne Transaktionen mit Wert 0', () => {
    const investments = book([tx({ depotId: DEPOT_A.id, quantity: 5, price: 100 })]);
    const rows = calcDepotSummaries(investments, calcPositions(investments, quotes));
    const empty = rows.find((r) => r.depotId === DEPOT_B.id);
    expect(empty.summary.marketValue).toBe(0);
    expect(empty.positions).toEqual([]);
  });

  it('nimmt geschlossene Positionen aus der Liste, behält sie aber in der Summe', () => {
    const investments = book([
      tx({ depotId: DEPOT_A.id, date: '2026-01-10', quantity: 10, price: 100 }),
      tx({ depotId: DEPOT_A.id, date: '2026-02-10', type: 'sell', quantity: 10, price: 150 }),
    ]);
    const rows = calcDepotSummaries(investments, calcPositions(investments, quotes));
    const depot = rows.find((r) => r.depotId === DEPOT_A.id);
    expect(depot.positions).toEqual([]);
    expect(depot.closedPositions).toHaveLength(1);
    expect(depot.summary.realizedGain).toBe(500);
  });
});

// --- Allokation -----------------------------------------------------------

describe('Allokation', () => {
  const quotes = quoteMapFromBatch({
    ok: true,
    data: [
      { symbol: 'VWRL.SW', ok: true, data: { price: 100 } },
      { symbol: 'GC=F', ok: true, data: { price: 2000 } },
      { symbol: 'AAPL', ok: false, error: 'kaputt' },
    ],
  });

  const investments = book([
    tx({ depotId: DEPOT_A.id, quantity: 30, price: 100 }),
    tx({ depotId: DEPOT_B.id, assetId: GOLD.id, quantity: 5, unit: 'oz', price: 1800 }),
    tx({ depotId: DEPOT_A.id, assetId: STOCK.id, quantity: 10, price: 100 }),
  ]);

  it('gruppiert nach Asset-Klasse und rechnet Anteile', () => {
    const rows = calcAllocationByAssetClass(calcPositions(investments, quotes));
    expect(rows.map((r) => r.key)).toEqual(['metal', 'etf']);
    expect(rows[0]).toMatchObject({ label: 'Edelmetall', value: 10000 });
    expect(rows[0].share).toBeCloseTo(76.923, 3);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 10);
  });

  it('lässt unbewertete Positionen aus der Allokation heraus', () => {
    const rows = calcAllocationByAssetClass(calcPositions(investments, quotes));
    expect(rows.some((r) => r.key === 'stock')).toBe(false);
  });

  it('gruppiert in derselben Form nach Depot', () => {
    const rows = calcAllocationByDepot(calcPositions(investments, quotes));
    expect(rows.map((r) => r.label)).toEqual(['Zu Hause', 'Swissquote']);
    expect(rows[1].value).toBe(3000);
  });

  it('gibt ohne bewertete Positionen eine leere Liste zurück', () => {
    expect(calcAllocationByAssetClass(calcPositions(investments))).toEqual([]);
  });
});

// --- Snapshots ------------------------------------------------------------

describe('Snapshots', () => {
  const quotes = quoteMapFromBatch({ ok: true, data: [{ symbol: 'VWRL.SW', ok: true, data: { price: 130 } }] });

  it('baut einen Snapshot aus den Depotsummen', () => {
    const investments = book([
      tx({ depotId: DEPOT_A.id, quantity: 10, price: 100 }),
      tx({ depotId: DEPOT_B.id, quantity: 10, price: 100 }),
    ]);
    const rows = calcDepotSummaries(investments, calcPositions(investments, quotes));
    const snap = buildSnapshot(rows, { date: '2026-09-20', currency: 'CHF' });
    expect(snap.total).toBe(2600);
    expect(snap.byDepot).toHaveLength(2);
    expect(snap.currency).toBe('CHF');
  });

  it('schreibt keinen Snapshot, solange kein Kurs vorliegt', () => {
    const investments = book([tx({ quantity: 10, price: 100 })]);
    const rows = calcDepotSummaries(investments, calcPositions(investments));
    expect(buildSnapshot(rows, { date: '2026-09-20', currency: 'CHF' })).toBeNull();
  });

  it('hält höchstens einen Snapshot pro Tag und sortiert nach Datum', () => {
    const a = { date: '2026-09-19', currency: 'CHF', total: 100, byDepot: [] };
    const b = { date: '2026-09-20', currency: 'CHF', total: 200, byDepot: [] };
    const bNeu = { date: '2026-09-20', currency: 'CHF', total: 250, byDepot: [] };
    const list = upsertSnapshot(upsertSnapshot([b], a), bNeu);
    expect(list.map((s) => s.date)).toEqual(['2026-09-19', '2026-09-20']);
    expect(list[1].total).toBe(250);
  });
});

// --- transactionsForPosition ---------------------------------------------

describe('transactionsForPosition', () => {
  it('liefert nur die Transaktionen der Position, neueste zuerst', () => {
    const investments = book([
      tx({ depotId: DEPOT_A.id, date: '2026-01-10', quantity: 1, price: 10 }),
      tx({ depotId: DEPOT_A.id, date: '2026-03-10', quantity: 1, price: 10 }),
      tx({ depotId: DEPOT_B.id, date: '2026-02-10', quantity: 1, price: 10 }),
    ]);
    const rows = transactionsForPosition(investments, DEPOT_A.id, ETF.id);
    expect(rows.map((t) => t.date)).toEqual(['2026-03-10', '2026-01-10']);
  });
});
