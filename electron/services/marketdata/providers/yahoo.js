// electron/services/marketdata/providers/yahoo.js
// Yahoo Finance (unofficial) — provider for stock and ETF prices.
// Base URL: https://query1.finance.yahoo.com/v8/finance/chart
//
// IMPORTANT: This is an UNOFFICIAL API with no guarantees of stability.
// The response format may change at any time. Robust error handling is mandatory.
// Always convert USD → target currency via converter.js (Yahoo always returns USD).
//
// This provider is designed to be easily replaceable:
// export { fetchPrice } — any module with the same signature can substitute it.

import { convert } from '../currency/converter.js';

// Yahoo Finance sometimes requires a User-Agent to avoid 429/401 responses
const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts the current market price from a Yahoo Finance v8 response.
 * Handles multiple possible response structures defensively.
 *
 * @param {object} json Raw Yahoo Finance JSON response
 * @returns {number | null}
 */
function extractPrice(json) {
  try {
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    // Primary: regularMarketPrice in meta
    const metaPrice = result?.meta?.regularMarketPrice;
    if (typeof metaPrice === 'number' && metaPrice > 0) return metaPrice;

    // Fallback: last close price from indicators
    const closes = result?.indicators?.quote?.[0]?.close;
    if (Array.isArray(closes) && closes.length > 0) {
      const lastClose = closes.filter((v) => v != null).at(-1);
      if (typeof lastClose === 'number') return lastClose;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetches the current price for a stock or ETF ticker from Yahoo Finance.
 * Price is always returned in the asset's traded currency (usually USD),
 * then converted to targetCurrency via converter.js.
 *
 * @param {string} ticker Yahoo Finance symbol (e.g. 'AAPL', 'MSFT', 'SPY', 'VWRL.L')
 * @param {string} targetCurrency ISO-4217 (e.g. 'CHF')
 * @returns {Promise<{ price: number, currency: string, source: string, originalPrice: number, originalCurrency: string, fxRate: number }>}
 */
export async function fetchPrice(ticker, targetCurrency) {
  const url = `${BASE_URL}/${encodeURIComponent(ticker)}`;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
        },
      });

      if (!res.ok) {
        throw new Error(`Yahoo Finance HTTP ${res.status} for ${ticker}`);
      }

      const json = await res.json();

      // Check for API-level error
      const apiError = json?.chart?.error;
      if (apiError) {
        throw new Error(`Yahoo Finance API error for ${ticker}: ${apiError.description || JSON.stringify(apiError)}`);
      }

      const rawPrice = extractPrice(json);
      if (rawPrice === null) {
        throw new Error(`Yahoo Finance: could not extract price for ${ticker}`);
      }

      // Determine the currency Yahoo reported (from meta.currency, e.g. 'USD', 'GBp')
      const reportedCurrency = json?.chart?.result?.[0]?.meta?.currency || 'USD';

      // Normalize GBp (pence) → GBP
      let originalCurrency = reportedCurrency;
      let originalPrice = rawPrice;
      if (reportedCurrency === 'GBp') {
        originalCurrency = 'GBP';
        originalPrice = rawPrice / 100;
      }

      // Convert from original currency to target currency
      const { convertedAmount, fxRate } = await convert(originalPrice, originalCurrency, targetCurrency);

      return {
        price: convertedAmount,
        currency: targetCurrency.toUpperCase(),
        source: 'yahoo',
        originalPrice,
        originalCurrency,
        fxRate,
      };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`Yahoo Finance: failed after ${MAX_RETRIES} retries for ${ticker}`);
}
