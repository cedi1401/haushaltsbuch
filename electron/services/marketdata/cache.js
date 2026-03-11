// electron/services/marketdata/cache.js
// In-memory + SQLite price cache. Cache-Key: {symbol}_{dateKey}, validity: 24 hours.

import { getDb } from '../../database/db.js';

// In-memory primary layer for fast repeated lookups within a session
const memCache = new Map();

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCacheKey(symbol, dateKey) {
  return `${symbol}_${dateKey}`;
}

/**
 * Returns cached price data for today or null on miss.
 * @returns {{ price: number, currency: string, source: string } | null}
 */
export function getCachedPrice(symbol) {
  const dateKey = todayKey();
  const cacheKey = buildCacheKey(symbol, dateKey);

  // Check in-memory first
  if (memCache.has(cacheKey)) {
    return memCache.get(cacheKey);
  }

  // Check SQLite
  try {
    const row = getDb().getCachedPrice(cacheKey);
    if (row) {
      const entry = { price: row.price, currency: row.currency, source: row.source };
      memCache.set(cacheKey, entry);
      return entry;
    }
  } catch {
    // DB not available yet — ignore
  }

  return null;
}

/**
 * Stores a price result in memory and SQLite.
 * @param {string} symbol
 * @param {{ price: number, currency: string, source: string }} data
 */
export function setCachedPrice(symbol, data) {
  const dateKey = todayKey();
  const cacheKey = buildCacheKey(symbol, dateKey);

  memCache.set(cacheKey, data);

  try {
    getDb().setCachedPrice(cacheKey, symbol, dateKey, data.price, data.currency, data.source);
  } catch {
    // DB not available — in-memory only
  }
}

/**
 * Removes a specific symbol from the cache (e.g. after manual override).
 */
export function invalidatePrice(symbol) {
  const dateKey = todayKey();
  const cacheKey = buildCacheKey(symbol, dateKey);
  memCache.delete(cacheKey);
}

/**
 * Clears all in-memory entries (e.g. when baseCurrency changes).
 */
export function invalidateAllPrices() {
  memCache.clear();
}
