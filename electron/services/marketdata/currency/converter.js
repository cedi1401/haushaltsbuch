// electron/services/marketdata/currency/converter.js
// Central currency conversion service using Frankfurter App for FX rates.
// FX rates are cached per day to avoid redundant API calls.

import { fetchFxRate } from '../providers/frankfurter.js';
import { getCachedFxRate, setCachedFxRate } from './fxCache.js';

/**
 * Converts an amount from one currency to another.
 * Uses day-cached FX rates from Frankfurter App.
 *
 * Note: Frankfurter does NOT support crypto as source currencies (BTC, ETH, etc.).
 * For crypto, use provider-side direct currency targeting (e.g. CoinGecko's vs_currencies).
 *
 * @param {number} amount
 * @param {string} fromCurrency ISO-4217 (e.g. 'USD')
 * @param {string} toCurrency   ISO-4217 (e.g. 'CHF')
 * @returns {Promise<{ convertedAmount: number, fxRate: number }>}
 */
export async function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: amount, fxRate: 1.0 };
  }

  // Check cache first
  let rate = getCachedFxRate(fromCurrency, toCurrency);

  if (rate === null) {
    rate = await fetchFxRate(fromCurrency, toCurrency);
    setCachedFxRate(fromCurrency, toCurrency, rate);
  }

  return {
    convertedAmount: amount * rate,
    fxRate: rate,
  };
}
