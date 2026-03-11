// electron/services/marketdata/currency/fxCache.js
// Cache for FX rates (24h validity). Cache-Key: fx_{from}_{to}_{dateKey}

import { getDb } from '../../../database/db.js';

const memCache = new Map();

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildKey(from, to) {
  return `fx_${from}_${to}_${todayKey()}`;
}

/**
 * Returns cached FX rate or null on miss.
 * @param {string} from ISO-4217 currency (e.g. 'USD')
 * @param {string} to   ISO-4217 currency (e.g. 'CHF')
 * @returns {number | null}
 */
export function getCachedFxRate(from, to) {
  if (from === to) return 1.0;

  const key = buildKey(from, to);

  if (memCache.has(key)) return memCache.get(key);

  try {
    const row = getDb().getCachedPrice(key);
    if (row) {
      memCache.set(key, row.price);
      return row.price;
    }
  } catch {
    // DB not available
  }

  return null;
}

/**
 * Stores an FX rate in memory and SQLite.
 */
export function setCachedFxRate(from, to, rate) {
  const dateKey = todayKey();
  const key = buildKey(from, to);

  memCache.set(key, rate);

  try {
    getDb().setCachedPrice(key, `${from}/${to}`, dateKey, rate, to, 'frankfurter');
  } catch {
    // DB not available
  }
}

/**
 * Invalidates all FX rates for a given target currency (e.g. on baseCurrency change).
 */
export function invalidateFxRatesForCurrency(toCurrency) {
  for (const key of memCache.keys()) {
    if (key.includes(`_${toCurrency}_`)) {
      memCache.delete(key);
    }
  }
}

export function invalidateAllFxRates() {
  memCache.clear();
}
