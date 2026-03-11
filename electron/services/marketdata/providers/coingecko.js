// electron/services/marketdata/providers/coingecko.js
// CoinGecko API — primary provider for cryptocurrency prices.
// Base URL: https://api.coingecko.com/api/v3
// No API key required. Rate limit: ~30 req/min on the public API.
//
// Key advantage: supports target currency directly via vs_currencies,
// so no FX conversion is needed for most currencies (including CHF).

const BASE_URL = 'https://api.coingecko.com/api/v3';
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches the current price for a CoinGecko coin ID in the target currency.
 *
 * @param {string} coinId CoinGecko coin ID (e.g. 'bitcoin', 'ethereum', 'solana')
 * @param {string} targetCurrency ISO-4217 lowercase (e.g. 'chf', 'usd', 'eur')
 * @returns {Promise<{ price: number, currency: string, source: string, originalPrice: number, originalCurrency: string, fxRate: number }>}
 */
export async function fetchPrice(coinId, targetCurrency) {
  const currency = targetCurrency.toLowerCase();
  // CoinGecko delivers price directly in the target currency — no FX conversion needed
  const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${currency}`;

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
        headers: { 'Accept': 'application/json' },
      });

      if (res.status === 429) {
        // Rate limited — wait longer before retry
        clearTimeout(timer);
        await sleep(RETRY_DELAY_MS * 2);
        continue;
      }

      if (!res.ok) {
        throw new Error(`CoinGecko HTTP ${res.status}`);
      }

      const json = await res.json();
      const price = json?.[coinId]?.[currency];

      if (typeof price !== 'number') {
        throw new Error(`CoinGecko: no price for ${coinId} in ${currency}`);
      }

      return {
        price,
        currency: targetCurrency.toUpperCase(),
        source: 'coingecko',
        originalPrice: price,
        originalCurrency: targetCurrency.toUpperCase(),
        fxRate: 1.0,
      };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`CoinGecko: failed after ${MAX_RETRIES} retries`);
}
