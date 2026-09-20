import { vi, describe, it, expect, beforeEach } from 'vitest';

// Yahoo und die Datenbank werden ersetzt: der Test prüft die Cache-Kette
// (Speicher → SQLite → Netz) und das Offline-Verhalten, nicht die Fremdsysteme.
vi.mock('../../../electron/services/marketdata/yahoo.js', () => ({
  fetchQuote: vi.fn(),
  fetchHistory: vi.fn(),
  searchSymbols: vi.fn(),
}));

vi.mock('../../../electron/services/marketdata/priceStore.js', () => ({
  readPrice: vi.fn(),
  writePrice: vi.fn(),
  clearStoredPrices: vi.fn(),
}));

import { getQuote, getQuotes, clearCache } from '../../../electron/services/marketdata/index.js';
import { fetchQuote } from '../../../electron/services/marketdata/yahoo.js';
import { readPrice, writePrice } from '../../../electron/services/marketdata/priceStore.js';

function quoteOf(overrides = {}) {
  return {
    price: 112.4,
    currency: 'CHF',
    symbol: 'VWRL.SW',
    exchangeName: 'SIX',
    marketTime: '2026-09-20T15:30:00.000Z',
    raw: { some: 'meta' },
    ...overrides,
  };
}

function storedOf(ageMinutes, overrides = {}) {
  return {
    symbol: 'VWRL.SW',
    price: 110,
    currency: 'CHF',
    exchangeName: 'SIX',
    marketTime: '2026-09-19T15:30:00.000Z',
    fetchedAt: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readPrice.mockReturnValue(null);
  clearCache();
  // clearCache ruft den gemockten Store auf — Zähler danach zurücksetzen.
  vi.clearAllMocks();
  readPrice.mockReturnValue(null);
});

describe('getQuote — Cache-Kette', () => {
  it('fetches from the network when nothing is cached', async () => {
    fetchQuote.mockResolvedValue(quoteOf());

    const result = await getQuote('VWRL.SW', 'CHF');

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(result.price).toBe(112.4);
    expect(result.cached).toBe(false);
    expect(result.stale).toBe(false);
  });

  it('persists every fresh quote', async () => {
    fetchQuote.mockResolvedValue(quoteOf());

    await getQuote('VWRL.SW', 'CHF');

    expect(writePrice).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'VWRL.SW', price: 112.4 }));
  });

  it('serves the second call from memory without hitting the network', async () => {
    fetchQuote.mockResolvedValue(quoteOf());

    await getQuote('VWRL.SW', 'CHF');
    const second = await getQuote('VWRL.SW', 'CHF');

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    expect(second.price).toBe(112.4);
  });

  it('uses a fresh database entry instead of the network', async () => {
    readPrice.mockReturnValue(storedOf(5));

    const result = await getQuote('VWRL.SW', 'CHF');

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(result.price).toBe(110);
    expect(result.cached).toBe(true);
    expect(result.stale).toBe(false);
  });

  it('refetches once the database entry is older than the TTL', async () => {
    readPrice.mockReturnValue(storedOf(20));
    fetchQuote.mockResolvedValue(quoteOf());

    const result = await getQuote('VWRL.SW', 'CHF');

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(result.price).toBe(112.4);
    expect(result.cached).toBe(false);
  });

  it('bypasses both cache levels when asked to', async () => {
    readPrice.mockReturnValue(storedOf(1));
    fetchQuote.mockResolvedValue(quoteOf());

    const result = await getQuote('VWRL.SW', 'CHF', { bypassCache: true });

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(result.price).toBe(112.4);
  });
});

describe('getQuote — Offline-Verhalten', () => {
  it('falls back to the last known price and marks it stale', async () => {
    const stored = storedOf(600);
    readPrice.mockReturnValue(stored);
    fetchQuote.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await getQuote('VWRL.SW', 'CHF');

    expect(result.price).toBe(110);
    expect(result.stale).toBe(true);
    expect(result.staleReason).toContain('ENOTFOUND');
    // Der Zeitpunkt des Altbestands trägt die Anzeige "Stand vom ..." in der UI.
    expect(result.fetchedAt).toBe(stored.fetchedAt);
  });

  it('does not overwrite the cache with a failed fetch', async () => {
    readPrice.mockReturnValue(storedOf(600));
    fetchQuote.mockRejectedValue(new Error('offline'));

    await getQuote('VWRL.SW', 'CHF');

    expect(writePrice).not.toHaveBeenCalled();
  });

  it('throws when the network fails and nothing was ever cached', async () => {
    readPrice.mockReturnValue(null);
    fetchQuote.mockRejectedValue(new Error('Symbol bei Yahoo nicht gefunden (HTTP 404)'));

    await expect(getQuote('NOPE', 'CHF')).rejects.toThrow('HTTP 404');
  });

  it('marks the result stale when only the fx rate is outdated', async () => {
    // Kurs frisch aus dem Netz, Umrechnungskurs nur noch als Altbestand verfügbar.
    fetchQuote.mockImplementation(async (symbol) => {
      if (symbol === 'USDCHF=X') throw new Error('offline');
      return quoteOf({ symbol: 'AAPL', currency: 'USD', price: 200 });
    });
    readPrice.mockImplementation((symbol) =>
      symbol === 'USDCHF=X'
        ? { symbol, price: 0.8, currency: 'CHF', exchangeName: '', marketTime: null, fetchedAt: new Date(Date.now() - 86400000).toISOString() }
        : null
    );

    const result = await getQuote('AAPL', 'CHF');

    expect(result.price).toBeCloseTo(160, 6);
    expect(result.stale).toBe(true);
  });
});

describe('getQuote — Währungsumrechnung', () => {
  it('skips the fx lookup when the currency already matches', async () => {
    fetchQuote.mockResolvedValue(quoteOf());

    const result = await getQuote('VWRL.SW', 'CHF');

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(result.fxSymbol).toBe(null);
    expect(result.fxRate).toBe(1);
  });

  it('converts through the fx symbol and reports both prices', async () => {
    fetchQuote.mockImplementation(async (symbol) =>
      symbol === 'USDCHF=X'
        ? quoteOf({ symbol, price: 0.85, currency: 'CHF' })
        : quoteOf({ symbol: 'AAPL', price: 200, currency: 'USD' })
    );

    const result = await getQuote('AAPL', 'CHF');

    expect(result.originalPrice).toBe(200);
    expect(result.originalCurrency).toBe('USD');
    expect(result.fxSymbol).toBe('USDCHF=X');
    expect(result.price).toBeCloseTo(170, 6);
    expect(result.currency).toBe('CHF');
  });

  it('keeps the original price when the conversion fails', async () => {
    fetchQuote.mockImplementation(async (symbol) => {
      if (symbol === 'USDCHF=X') throw new Error('FX nicht verfügbar');
      return quoteOf({ symbol: 'AAPL', price: 200, currency: 'USD' });
    });

    const result = await getQuote('AAPL', 'CHF');

    expect(result.originalPrice).toBe(200);
    expect(result.price).toBe(null);
    expect(result.fxError).toContain('FX nicht verfügbar');
  });
});

describe('getQuotes — Stapelabruf', () => {
  it('returns one row per symbol', async () => {
    readPrice.mockReturnValue(storedOf(1));

    const results = await getQuotes(['VWRL.SW', 'AAPL'], 'CHF');

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.symbol)).toEqual(['VWRL.SW', 'AAPL']);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('deduplicates repeated symbols', async () => {
    readPrice.mockReturnValue(storedOf(1));

    const results = await getQuotes(['VWRL.SW', 'VWRL.SW', 'VWRL.SW'], 'CHF');

    expect(results).toHaveLength(1);
  });

  it('keeps going when a single symbol fails', async () => {
    // Nur das kaputte Symbol scheitert — ohne Cache-Reserve, damit es durchschlägt.
    readPrice.mockImplementation((symbol) => (symbol === 'KAPUTT' ? null : storedOf(1, { symbol })));
    fetchQuote.mockRejectedValue(new Error('Symbol bei Yahoo nicht gefunden (HTTP 404)'));

    const results = await getQuotes(['VWRL.SW', 'KAPUTT', 'AAPL'], 'CHF');

    expect(results).toHaveLength(3);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toContain('HTTP 404');
    expect(results[2].ok).toBe(true);
  });

  it('ignores empty input', async () => {
    expect(await getQuotes([], 'CHF')).toEqual([]);
    expect(await getQuotes(undefined, 'CHF')).toEqual([]);
  });

  it('fetches sequentially, not in parallel', async () => {
    let running = 0;
    let maxParallel = 0;
    fetchQuote.mockImplementation(async () => {
      running += 1;
      maxParallel = Math.max(maxParallel, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return quoteOf();
    });

    await getQuotes(['AAA', 'BBB'], 'CHF');

    expect(maxParallel).toBe(1);
  });
});
