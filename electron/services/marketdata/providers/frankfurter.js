// electron/services/marketdata/providers/frankfurter.js
// Frankfurter App API — used for precious metal prices (XAU, XAG, XPT) and FX rates.
// Base URL: https://api.frankfurter.app
// No API key required. Rate limit: effectively unlimited.

const BASE_URL = 'https://api.frankfurter.app';
const TIMEOUT_MS = 10000;

/**
 * Fetches a price or FX rate from Frankfurter App.
 * @param {string} from Symbol or currency to convert from (e.g. 'XAU', 'USD')
 * @param {string} to   Target currency (e.g. 'CHF', 'EUR')
 * @returns {Promise<number>} The rate (e.g. 1701.20 for XAU→CHF)
 */
async function fetchRate(from, to) {
  const url = `${BASE_URL}/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Frankfurter HTTP ${res.status}`);
    }

    const json = await res.json();
    const rate = json?.rates?.[to];

    if (typeof rate !== 'number') {
      throw new Error(`Frankfurter: missing rate for ${from}→${to} in response`);
    }

    return rate;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a precious metal price in the target currency.
 * Supported symbols: XAU (Gold), XAG (Silver), XPT (Platinum)
 *
 * @param {string} symbol Metal symbol: 'XAU' | 'XAG' | 'XPT'
 * @param {string} targetCurrency ISO-4217 currency (e.g. 'CHF')
 * @returns {Promise<{ price: number, currency: string, source: string, originalPrice: number, originalCurrency: string, fxRate: number }>}
 */
export async function fetchPrice(symbol, targetCurrency) {
  const rate = await fetchRate(symbol, targetCurrency);

  return {
    price: rate,
    currency: targetCurrency,
    source: 'frankfurter',
    originalPrice: rate,
    originalCurrency: targetCurrency,
    fxRate: 1.0,
  };
}

/**
 * Fetches an FX rate between two fiat currencies.
 * Used by currency/converter.js.
 *
 * @param {string} from ISO-4217 source currency
 * @param {string} to   ISO-4217 target currency
 * @returns {Promise<number>}
 */
export async function fetchFxRate(from, to) {
  if (from === to) return 1.0;
  return fetchRate(from, to);
}
