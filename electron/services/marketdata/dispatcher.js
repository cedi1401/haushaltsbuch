// electron/services/marketdata/dispatcher.js
// Routes price fetch requests to the correct provider based on marketAssetType.
// Applies caching and handles fallback providers.

import { fetchPrice as fetchCoinGecko } from './providers/coingecko.js';
import { fetchPrice as fetchBinance } from './providers/binance.js';
import { fetchPrice as fetchYahoo } from './providers/yahoo.js';
import { fetchPrice as fetchFrankfurter } from './providers/frankfurter.js';
import { getCachedPrice, setCachedPrice } from './cache.js';

// Provider routing table
// Each entry: { primary: fn, fallback?: fn }
const PROVIDERS = {
  crypto: {
    primary: fetchCoinGecko,
    fallback: fetchBinance,
  },
  stock: {
    primary: fetchYahoo,
    fallback: null,
  },
  etf: {
    primary: fetchYahoo,
    fallback: null,
  },
  metal: {
    primary: fetchFrankfurter,
    fallback: null,
  },
};

/**
 * Fetches the current price for an asset, with caching and fallback handling.
 *
 * @param {{ marketSymbol: string, marketAssetType: string }} asset
 * @param {string} baseCurrency ISO-4217 (e.g. 'CHF')
 * @returns {Promise<{ price: number, currency: string, source: string, originalPrice: number, originalCurrency: string, fxRate: number }>}
 */
export async function fetchPrice(asset, baseCurrency) {
  const { marketSymbol, marketAssetType } = asset;

  if (!marketSymbol) {
    throw new Error('Asset has no marketSymbol set');
  }
  if (!marketAssetType) {
    throw new Error('Asset has no marketAssetType set');
  }

  const cacheKey = `${marketSymbol.toLowerCase()}_${baseCurrency.toLowerCase()}`;
  const cached = getCachedPrice(cacheKey);
  if (cached) {
    return cached;
  }

  const providerConfig = PROVIDERS[marketAssetType];
  if (!providerConfig) {
    throw new Error(`No provider configured for marketAssetType '${marketAssetType}'`);
  }

  let result = null;
  let primaryError = null;

  // Try primary provider
  try {
    result = await providerConfig.primary(marketSymbol, baseCurrency);
  } catch (err) {
    primaryError = err;
    console.warn(`[marketdata] Primary provider failed for ${marketSymbol} (${marketAssetType}): ${err.message}`);
  }

  // Try fallback if primary failed
  if (!result && providerConfig.fallback) {
    try {
      result = await providerConfig.fallback(marketSymbol, baseCurrency);
      console.log(`[marketdata] Fallback provider succeeded for ${marketSymbol}`);
    } catch (fallbackErr) {
      console.warn(`[marketdata] Fallback also failed for ${marketSymbol}: ${fallbackErr.message}`);
      throw primaryError || fallbackErr;
    }
  }

  if (!result) {
    throw primaryError || new Error(`No provider could fetch price for ${marketSymbol}`);
  }

  // Cache using composite key (symbol + currency) so currency changes bypass cache
  setCachedPrice(cacheKey, result);

  return result;
}
