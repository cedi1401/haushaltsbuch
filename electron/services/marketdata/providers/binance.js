// electron/services/marketdata/providers/binance.js
// Binance API — fallback provider for cryptocurrency prices.
// Base URL: https://api.binance.com/api/v3
// No API key required. Very high rate limit.
//
// Note: Binance delivers prices in USDT (approx. USD).
// FX conversion to the target currency is handled via converter.js.
//
// Symbol format: Binance uses pairs like 'BTCUSDT', 'ETHUSDT'.
// We map CoinGecko IDs to Binance symbols via a known map.

import { convert } from '../currency/converter.js';

const BASE_URL = 'https://api.binance.com/api/v3';
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

// Mapping: CoinGecko ID → Binance base symbol
const COINGECKO_TO_BINANCE = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  cardano: 'ADA',
  'binancecoin': 'BNB',
  ripple: 'XRP',
  polkadot: 'DOT',
  dogecoin: 'DOGE',
  'shiba-inu': 'SHIB',
  litecoin: 'LTC',
  avalanche: 'AVAX',
  chainlink: 'LINK',
  'uniswap': 'UNI',
  'matic-network': 'MATIC',
  'near': 'NEAR',
  'the-sandbox': 'SAND',
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches the current price for a coin from Binance.
 * The price is always in USDT and then converted to targetCurrency via converter.
 *
 * @param {string} coinId CoinGecko coin ID (e.g. 'bitcoin') — mapped to Binance symbol internally
 * @param {string} targetCurrency ISO-4217 (e.g. 'CHF')
 * @returns {Promise<{ price: number, currency: string, source: string, originalPrice: number, originalCurrency: string, fxRate: number }>}
 */
export async function fetchPrice(coinId, targetCurrency) {
  const baseSymbol = COINGECKO_TO_BINANCE[coinId];
  if (!baseSymbol) {
    throw new Error(`Binance: no symbol mapping for coinId '${coinId}'`);
  }

  const binanceSymbol = `${baseSymbol}USDT`;
  const url = `${BASE_URL}/ticker/price?symbol=${binanceSymbol}`;

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

      if (!res.ok) {
        throw new Error(`Binance HTTP ${res.status}`);
      }

      const json = await res.json();
      const usdtPrice = parseFloat(json?.price);

      if (!Number.isFinite(usdtPrice)) {
        throw new Error(`Binance: invalid price in response for ${binanceSymbol}`);
      }

      // Convert USDT → target currency (USDT ≈ USD for exchange purposes)
      const { convertedAmount, fxRate } = await convert(usdtPrice, 'USD', targetCurrency);

      return {
        price: convertedAmount,
        currency: targetCurrency.toUpperCase(),
        source: 'binance',
        originalPrice: usdtPrice,
        originalCurrency: 'USD',
        fxRate,
      };
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`Binance: failed after ${MAX_RETRIES} retries`);
}
