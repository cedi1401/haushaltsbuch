// electron/services/marketdata/index.js
// Public API for the marketdata service module.
// All IPC handlers in main.js use this as their entry point.

import { fetchPrice } from './dispatcher.js';
import { invalidateAllPrices, invalidatePrice, setCachedPrice } from './cache.js';
import { invalidateAllFxRates } from './currency/fxCache.js';
export { startScheduler, stopScheduler, triggerManualUpdate } from './scheduler.js';

/**
 * Fetches current market prices for a list of assets.
 * Returns an array of results in the same order as the input assets.
 * Individual failures are returned as error entries (not thrown).
 *
 * @param {Array<{ id: string, marketSymbol: string, marketAssetType: string }>} assets
 * @param {string} baseCurrency ISO-4217 (e.g. 'CHF')
 * @returns {Promise<Array<{ assetId: string, success: boolean, price?: number, ... }>>}
 */
export async function fetchPricesForAssets(assets, baseCurrency) {
  const results = await Promise.allSettled(
    assets.map(async (asset) => {
      if (!asset.marketSymbol || !asset.marketAssetType) {
        return {
          assetId: asset.id,
          success: false,
          error: 'Kein Markt-Symbol oder Markt-Typ konfiguriert',
          lastUpdated: new Date().toISOString(),
        };
      }

      const priceData = await fetchPrice(asset, baseCurrency);
      return {
        assetId: asset.id,
        success: true,
        ...priceData,
        lastUpdated: new Date().toISOString(),
      };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      assetId: assets[i].id,
      success: false,
      error: r.reason?.message || 'Unbekannter Fehler',
      lastUpdated: new Date().toISOString(),
    };
  });
}

/**
 * Sets a manual price override for an asset (test/debug mode).
 * Clears the cache for the symbol so the override takes effect immediately.
 *
 * @param {string} symbol
 * @param {number} price
 * @param {string} currency
 */
export function overridePrice(symbol, price, currency) {
  invalidatePrice(symbol);
  setCachedPrice(symbol, { price, currency, source: 'manual-override' });
}

/**
 * Invalidates all price and FX rate caches.
 * Call this when the user changes the baseCurrency of a book.
 */
export function invalidateAllCaches() {
  invalidateAllPrices();
  invalidateAllFxRates();
}
