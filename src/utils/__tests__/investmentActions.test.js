import { describe, it, expect } from 'vitest';
import {
  addAsset,
  addDepot,
  addTransaction,
  countAssetTransactions,
  countDepotTransactions,
  findAssetBySymbol,
  removeAsset,
  removeDepot,
  removeTransaction,
  updateAsset,
  updateDepot,
  updateTransaction,
} from '../investmentActions.js';
import { emptyInvestments } from '../investmentModel.js';

// --- Fixtures -------------------------------------------------------------

/** Baut eine Struktur mit einem Depot, einem ETF und einem Kauf. */
function seeded() {
  const withDepot = addDepot(emptyInvestments(), { name: 'Swissquote' });
  const withAsset = addAsset(withDepot.investments, {
    symbol: 'vwrl.sw',
    name: 'Vanguard FTSE All-World',
    assetClass: 'etf',
    quoteCurrency: 'CHF',
  });
  const withTx = addTransaction(withAsset.investments, {
    depotId: withDepot.depot.id,
    assetId: withAsset.asset.id,
    type: 'buy',
    date: '2026-03-14',
    quantity: 10,
    price: 100,
    fee: 5,
    currency: 'CHF',
    fxRate: 1,
  });
  return {
    investments: withTx.investments,
    depot: withDepot.depot,
    asset: withAsset.asset,
    transaction: withTx.transaction,
  };
}

// --- Depots ---------------------------------------------------------------

describe('addDepot', () => {
  it('legt ein Depot mit frischer id an', () => {
    const res = addDepot(emptyInvestments(), { name: 'Zu Hause', note: 'Tresor' });
    expect(res.depot.id).toMatch(/^dep_/);
    expect(res.investments.depots).toHaveLength(1);
    expect(res.investments.depots[0].name).toBe('Zu Hause');
    expect(res.investments.depots[0].note).toBe('Tresor');
  });

  it('lehnt einen leeren Namen ab', () => {
    expect(addDepot(emptyInvestments(), { name: '   ' })).toBeNull();
  });

  it('verträgt undefined als Ausgangsstruktur', () => {
    const res = addDepot(undefined, { name: 'Bankschließfach' });
    expect(res.investments.depots).toHaveLength(1);
    expect(res.investments.transactions).toEqual([]);
  });
});

describe('updateDepot', () => {
  it('benennt um, ohne die id zu ändern', () => {
    const { investments, depot } = seeded();
    const next = updateDepot(investments, depot.id, { name: 'Neon Invest', id: 'gekapert' });
    expect(next.depots[0].id).toBe(depot.id);
    expect(next.depots[0].name).toBe('Neon Invest');
  });
});

describe('removeDepot', () => {
  it('löscht das Depot samt seiner Transaktionen, Assets bleiben', () => {
    const { investments, depot } = seeded();
    const next = removeDepot(investments, depot.id);
    expect(next.depots).toHaveLength(0);
    expect(next.transactions).toHaveLength(0);
    expect(next.assets).toHaveLength(1);
  });

  it('lässt fremde Depots unberührt', () => {
    const { investments, depot } = seeded();
    const second = addDepot(investments, { name: 'Zu Hause' });
    const next = removeDepot(second.investments, depot.id);
    expect(next.depots.map((d) => d.id)).toEqual([second.depot.id]);
  });
});

// --- Assets ---------------------------------------------------------------

describe('addAsset', () => {
  it('normalisiert das Symbol auf Großbuchstaben', () => {
    const res = addAsset(emptyInvestments(), { symbol: 'aapl', name: 'Apple', assetClass: 'stock' });
    expect(res.asset.symbol).toBe('AAPL');
    expect(res.created).toBe(true);
  });

  it('gibt bei bekanntem Symbol den vorhandenen Stammsatz zurück', () => {
    const { investments, asset } = seeded();
    const res = addAsset(investments, { symbol: 'VWRL.SW', name: 'Doppelgänger' });
    expect(res.created).toBe(false);
    expect(res.asset.id).toBe(asset.id);
    expect(res.investments.assets).toHaveLength(1);
  });

  it('lehnt ein Metall ohne erkennbares Metall ab', () => {
    expect(addAsset(emptyInvestments(), { symbol: 'GC=F', kind: 'metal' })).toBeNull();
  });
});

describe('findAssetBySymbol', () => {
  it('findet unabhängig von Groß-/Kleinschreibung', () => {
    const { investments, asset } = seeded();
    expect(findAssetBySymbol(investments, ' vwrl.sw ').id).toBe(asset.id);
    expect(findAssetBySymbol(investments, 'UNBEKANNT')).toBeNull();
    expect(findAssetBySymbol(investments, '')).toBeNull();
  });
});

describe('updateAsset / removeAsset', () => {
  it('ändert die Stammdaten', () => {
    const { investments, asset } = seeded();
    const next = updateAsset(investments, asset.id, { name: 'All-World' });
    expect(next.assets[0].name).toBe('All-World');
  });

  it('löscht den Stammsatz samt seiner Transaktionen', () => {
    const { investments, asset } = seeded();
    const next = removeAsset(investments, asset.id);
    expect(next.assets).toHaveLength(0);
    expect(next.transactions).toHaveLength(0);
    expect(next.depots).toHaveLength(1);
  });
});

// --- Transaktionen --------------------------------------------------------

describe('addTransaction', () => {
  it('erfasst einen Kauf', () => {
    const { investments, transaction } = seeded();
    expect(transaction.id).toMatch(/^itx_/);
    expect(investments.transactions).toHaveLength(1);
    expect(investments.transactions[0].fee).toBe(5);
  });

  it('lehnt eine Transaktion ohne gültiges Datum ab', () => {
    const { investments, depot, asset } = seeded();
    const res = addTransaction(investments, {
      depotId: depot.id,
      assetId: asset.id,
      type: 'buy',
      date: '14.03.2026',
      quantity: 1,
      price: 1,
    });
    expect(res).toBeNull();
  });

  it('hält die Liste nach Datum sortiert', () => {
    const { investments, depot, asset } = seeded();
    const res = addTransaction(investments, {
      depotId: depot.id,
      assetId: asset.id,
      type: 'buy',
      date: '2026-01-05',
      quantity: 1,
      price: 90,
      currency: 'CHF',
      fxRate: 1,
    });
    expect(res.investments.transactions.map((t) => t.date)).toEqual(['2026-01-05', '2026-03-14']);
  });

  it('erzwingt bei Wertpapieren die Einheit Stück', () => {
    const { investments, depot, asset } = seeded();
    const res = addTransaction(investments, {
      depotId: depot.id,
      assetId: asset.id,
      type: 'buy',
      date: '2026-04-01',
      quantity: 2,
      unit: 'g',
      price: 100,
      currency: 'CHF',
      fxRate: 1,
    });
    expect(res.investments.transactions.at(-1).unit).toBe('pcs');
  });
});

describe('updateTransaction', () => {
  it('ändert Menge und Preis', () => {
    const { investments, transaction } = seeded();
    const next = updateTransaction(investments, transaction.id, { quantity: 20, price: 110 });
    expect(next.transactions[0].quantity).toBe(20);
    expect(next.transactions[0].price).toBe(110);
    expect(next.transactions[0].id).toBe(transaction.id);
  });

  it('verwirft eine unbrauchbare Änderung, statt die Zeile zu verlieren', () => {
    const { investments, transaction } = seeded();
    const next = updateTransaction(investments, transaction.id, { quantity: 0 });
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0].quantity).toBe(10);
  });

  it('ignoriert eine unbekannte id', () => {
    const { investments } = seeded();
    expect(updateTransaction(investments, 'itx_gibtsnicht', { price: 1 }).transactions).toHaveLength(1);
  });
});

describe('removeTransaction', () => {
  it('löscht genau eine Zeile', () => {
    const { investments, transaction } = seeded();
    const next = removeTransaction(investments, transaction.id);
    expect(next.transactions).toHaveLength(0);
    expect(next.assets).toHaveLength(1);
    expect(next.depots).toHaveLength(1);
  });
});

describe('Zähler für Löschwarnungen', () => {
  it('zählt Transaktionen je Depot und Asset', () => {
    const { investments, depot, asset } = seeded();
    expect(countDepotTransactions(investments, depot.id)).toBe(1);
    expect(countAssetTransactions(investments, asset.id)).toBe(1);
    expect(countDepotTransactions(investments, 'dep_fremd')).toBe(0);
    expect(countAssetTransactions(undefined, asset.id)).toBe(0);
  });
});
