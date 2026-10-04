import { describe, it, expect } from 'vitest';
import {
  ASSET_CLASSES,
  GRAMS_PER_TROY_OUNCE,
  METAL_SYMBOLS,
  emptyInvestments,
  makeAsset,
  makeDepot,
  makeInvestmentTransaction,
  normalizeAsset,
  normalizeDepot,
  normalizeInvestmentTransaction,
  normalizeInvestments,
  normalizeSnapshot,
  toTroyOunces,
} from '../investmentModel.js';

// Basisdaten für die Tests: ein Depot, ein ETF, ein Metall.
const DEPOT = { id: 'dep_1', name: 'Swissquote', createdAt: '2026-01-01T00:00:00.000Z' };
const ETF = {
  id: 'ast_1',
  symbol: 'VWRL.SW',
  name: 'Vanguard FTSE All-World',
  assetClass: 'etf',
  quoteCurrency: 'CHF',
  kind: 'security',
  metal: null,
};
const GOLD = {
  id: 'ast_2',
  symbol: METAL_SYMBOLS.gold,
  name: 'Gold',
  assetClass: 'metal',
  quoteCurrency: 'USD',
  kind: 'metal',
  metal: 'gold',
};

function buyOf(overrides = {}) {
  return {
    id: 'itx_1',
    depotId: 'dep_1',
    assetId: 'ast_1',
    type: 'buy',
    date: '2026-03-14',
    quantity: 120,
    unit: 'pcs',
    price: 112.4,
    fee: 9,
    currency: 'CHF',
    fxRate: 1,
    createdAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

// ─── emptyInvestments ──────────────────────────────────────────────────────

describe('emptyInvestments', () => {
  it('returns all four collections as empty arrays', () => {
    expect(emptyInvestments()).toEqual({
      depots: [],
      assets: [],
      transactions: [],
      snapshots: [],
    });
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = emptyInvestments();
    a.depots.push({});
    expect(emptyInvestments().depots).toEqual([]);
  });
});

// ─── toTroyOunces ──────────────────────────────────────────────────────────

describe('toTroyOunces', () => {
  it('converts grams to troy ounces', () => {
    expect(toTroyOunces(GRAMS_PER_TROY_OUNCE, 'g')).toBeCloseTo(1, 10);
    expect(toTroyOunces(100, 'g')).toBeCloseTo(3.215, 3);
  });

  it('passes ounces through unchanged', () => {
    expect(toTroyOunces(2.5, 'oz')).toBe(2.5);
  });

  it('returns 0 for non-numeric input', () => {
    expect(toTroyOunces('abc', 'g')).toBe(0);
    expect(toTroyOunces(undefined, 'oz')).toBe(0);
  });
});

// ─── normalizeDepot ────────────────────────────────────────────────────────

describe('normalizeDepot', () => {
  it('keeps a valid depot', () => {
    expect(normalizeDepot(DEPOT)).toEqual({ ...DEPOT, note: '' });
  });

  it('rejects a depot without a name', () => {
    expect(normalizeDepot({ id: 'dep_1', name: '   ' })).toBe(null);
    expect(normalizeDepot({ id: 'dep_1' })).toBe(null);
    expect(normalizeDepot(null)).toBe(null);
    expect(normalizeDepot([])).toBe(null);
  });

  it('generates an id when missing', () => {
    expect(normalizeDepot({ name: 'Zu Hause' }).id).toMatch(/^dep_/);
  });

  it('trims the name and caps its length', () => {
    const result = normalizeDepot({ name: `  ${'x'.repeat(80)}  ` });
    expect(result.name).toHaveLength(50);
  });
});

// ─── normalizeAsset ────────────────────────────────────────────────────────

describe('normalizeAsset', () => {
  it('keeps a valid security', () => {
    expect(normalizeAsset(ETF)).toEqual(ETF);
  });

  it('uppercases the symbol and the quote currency', () => {
    const result = normalizeAsset({ symbol: 'vwrl.sw', quoteCurrency: 'chf' });
    expect(result.symbol).toBe('VWRL.SW');
    expect(result.quoteCurrency).toBe('CHF');
  });

  it('rejects an asset without a symbol', () => {
    expect(normalizeAsset({ name: 'Ohne Symbol' })).toBe(null);
  });

  it('rejects a metal asset without a recognised metal', () => {
    expect(normalizeAsset({ symbol: 'GC=F', kind: 'metal', metal: 'platinum' })).toBe(null);
  });

  it('defaults the asset class of a metal to "metal"', () => {
    const result = normalizeAsset({ symbol: 'SI=F', kind: 'metal', metal: 'silver' });
    expect(result.assetClass).toBe('metal');
  });

  it('falls back to "other" for an unknown asset class', () => {
    const result = normalizeAsset({ symbol: 'AAPL', assetClass: 'bond' });
    expect(result.assetClass).toBe('other');
    expect(ASSET_CLASSES).toContain(result.assetClass);
  });

  it('keeps "crypto" as an asset class', () => {
    const result = normalizeAsset({ symbol: 'BTC-USD', assetClass: 'crypto' });
    expect(result.assetClass).toBe('crypto');
  });

  it('uses the symbol as name when none is given', () => {
    expect(normalizeAsset({ symbol: 'AAPL' }).name).toBe('AAPL');
  });

  it('clears the metal field on a security', () => {
    expect(normalizeAsset({ symbol: 'AAPL', kind: 'security', metal: 'gold' }).metal).toBe(null);
  });
});

// ─── normalizeInvestmentTransaction ────────────────────────────────────────

describe('normalizeInvestmentTransaction', () => {
  it('keeps a valid buy', () => {
    expect(normalizeInvestmentTransaction(buyOf())).toEqual({ ...buyOf(), note: '' });
  });

  it('rejects an unknown transaction type', () => {
    expect(normalizeInvestmentTransaction(buyOf({ type: 'split' }))).toBe(null);
  });

  it('rejects a missing depot or asset reference', () => {
    expect(normalizeInvestmentTransaction(buyOf({ depotId: '' }))).toBe(null);
    expect(normalizeInvestmentTransaction(buyOf({ assetId: undefined }))).toBe(null);
  });

  it('rejects an invalid date', () => {
    expect(normalizeInvestmentTransaction(buyOf({ date: '14.03.2026' }))).toBe(null);
    expect(normalizeInvestmentTransaction(buyOf({ date: '2026-02-30' }))).toBe(null);
    expect(normalizeInvestmentTransaction(buyOf({ date: '2026-13-01' }))).toBe(null);
  });

  it('accepts a date in the past', () => {
    expect(normalizeInvestmentTransaction(buyOf({ date: '2019-07-01' })).date).toBe('2019-07-01');
  });

  it('rejects a quantity of zero or below', () => {
    expect(normalizeInvestmentTransaction(buyOf({ quantity: 0 }))).toBe(null);
    expect(normalizeInvestmentTransaction(buyOf({ quantity: -5 }))).toBe(null);
  });

  it('allows a price of zero but rejects a negative one', () => {
    expect(normalizeInvestmentTransaction(buyOf({ price: 0 })).price).toBe(0);
    expect(normalizeInvestmentTransaction(buyOf({ price: -1 }))).toBe(null);
  });

  it('defaults a missing or negative fee to 0', () => {
    expect(normalizeInvestmentTransaction(buyOf({ fee: undefined })).fee).toBe(0);
    expect(normalizeInvestmentTransaction(buyOf({ fee: -3 })).fee).toBe(0);
  });

  it('defaults a missing fx rate to 1', () => {
    expect(normalizeInvestmentTransaction(buyOf({ fxRate: undefined })).fxRate).toBe(1);
    expect(normalizeInvestmentTransaction(buyOf({ fxRate: 0 })).fxRate).toBe(1);
  });

  it('keeps a stored historical fx rate', () => {
    expect(normalizeInvestmentTransaction(buyOf({ fxRate: 0.8123 })).fxRate).toBe(0.8123);
  });

  it('normalises a dividend to quantity 1, unit pcs', () => {
    const result = normalizeInvestmentTransaction(
      buyOf({ type: 'dividend', quantity: 120, unit: 'g', price: 87.5 })
    );
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('pcs');
    expect(result.price).toBe(87.5);
  });

  it('keeps gram and ounce units', () => {
    expect(normalizeInvestmentTransaction(buyOf({ unit: 'g' })).unit).toBe('g');
    expect(normalizeInvestmentTransaction(buyOf({ unit: 'oz' })).unit).toBe('oz');
  });

  it('falls back to pcs for an unknown unit', () => {
    expect(normalizeInvestmentTransaction(buyOf({ unit: 'kg' })).unit).toBe('pcs');
  });
});

// ─── normalizeSnapshot ─────────────────────────────────────────────────────

describe('normalizeSnapshot', () => {
  it('keeps a valid snapshot', () => {
    const snap = {
      date: '2026-09-20',
      currency: 'CHF',
      total: 50750,
      byDepot: [{ depotId: 'dep_1', value: 42300 }],
    };
    expect(normalizeSnapshot(snap)).toEqual(snap);
  });

  it('rejects an invalid date or total', () => {
    expect(normalizeSnapshot({ date: 'gestern', total: 1 })).toBe(null);
    expect(normalizeSnapshot({ date: '2026-09-20', total: 'viel' })).toBe(null);
  });

  it('drops malformed byDepot rows', () => {
    const result = normalizeSnapshot({
      date: '2026-09-20',
      total: 100,
      byDepot: [{ depotId: 'dep_1', value: 100 }, { value: 50 }, null],
    });
    expect(result.byDepot).toEqual([{ depotId: 'dep_1', value: 100 }]);
  });
});

// ─── normalizeInvestments ──────────────────────────────────────────────────

describe('normalizeInvestments', () => {
  it('returns the empty structure for missing or malformed input', () => {
    expect(normalizeInvestments(undefined)).toEqual(emptyInvestments());
    expect(normalizeInvestments(null)).toEqual(emptyInvestments());
    expect(normalizeInvestments([])).toEqual(emptyInvestments());
    expect(normalizeInvestments('nope')).toEqual(emptyInvestments());
  });

  it('is idempotent', () => {
    const once = normalizeInvestments({
      depots: [DEPOT],
      assets: [ETF],
      transactions: [buyOf()],
      snapshots: [{ date: '2026-09-20', currency: 'CHF', total: 10, byDepot: [] }],
    });
    expect(normalizeInvestments(once)).toEqual(once);
  });

  it('drops transactions whose depot or asset no longer exists', () => {
    const result = normalizeInvestments({
      depots: [DEPOT],
      assets: [ETF],
      transactions: [
        buyOf(),
        buyOf({ id: 'itx_2', depotId: 'dep_gone' }),
        buyOf({ id: 'itx_3', assetId: 'ast_gone' }),
      ],
    });
    expect(result.transactions.map((t) => t.id)).toEqual(['itx_1']);
  });

  it('forces pcs on securities and oz on metals', () => {
    const result = normalizeInvestments({
      depots: [DEPOT],
      assets: [ETF, GOLD],
      transactions: [
        buyOf({ id: 'itx_sec', assetId: 'ast_1', unit: 'g' }),
        buyOf({ id: 'itx_met', assetId: 'ast_2', unit: 'pcs' }),
        buyOf({ id: 'itx_gram', assetId: 'ast_2', unit: 'g' }),
      ],
    });
    const byId = Object.fromEntries(result.transactions.map((t) => [t.id, t.unit]));
    expect(byId.itx_sec).toBe('pcs');
    expect(byId.itx_met).toBe('oz');
    expect(byId.itx_gram).toBe('g');
  });

  it('sorts transactions by date ascending', () => {
    const result = normalizeInvestments({
      depots: [DEPOT],
      assets: [ETF],
      transactions: [
        buyOf({ id: 'c', date: '2026-05-01' }),
        buyOf({ id: 'a', date: '2019-01-15' }),
        buyOf({ id: 'b', date: '2026-03-14' }),
      ],
    });
    expect(result.transactions.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only the last snapshot per day', () => {
    const result = normalizeInvestments({
      snapshots: [
        { date: '2026-09-20', total: 100, byDepot: [] },
        { date: '2026-09-20', total: 250, byDepot: [] },
        { date: '2026-09-19', total: 90, byDepot: [] },
      ],
    });
    expect(result.snapshots.map((s) => [s.date, s.total])).toEqual([
      ['2026-09-19', 90],
      ['2026-09-20', 250],
    ]);
  });

  it('drops depots and assets that are unusable', () => {
    const result = normalizeInvestments({
      depots: [DEPOT, { id: 'dep_x' }],
      assets: [ETF, { id: 'ast_x' }],
    });
    expect(result.depots).toHaveLength(1);
    expect(result.assets).toHaveLength(1);
  });
});

// ─── make* Factories ───────────────────────────────────────────────────────

describe('make* factories', () => {
  it('makeDepot generates an id and a timestamp', () => {
    const depot = makeDepot({ name: 'Bankschließfach' });
    expect(depot.id).toMatch(/^dep_/);
    expect(depot.name).toBe('Bankschließfach');
    expect(Number.isNaN(Date.parse(depot.createdAt))).toBe(false);
  });

  it('makeAsset generates an id', () => {
    expect(makeAsset({ symbol: 'AAPL' }).id).toMatch(/^ast_/);
  });

  it('makeInvestmentTransaction generates an id', () => {
    const tx = makeInvestmentTransaction({
      depotId: 'dep_1',
      assetId: 'ast_1',
      type: 'buy',
      date: '2026-03-14',
      quantity: 1,
      price: 10,
    });
    expect(tx.id).toMatch(/^itx_/);
  });

  it('returns null when the factory input stays unusable', () => {
    expect(makeDepot({})).toBe(null);
    expect(makeAsset({})).toBe(null);
    expect(makeInvestmentTransaction({})).toBe(null);
  });
});
