// electron/services/marketdata/index.js
// Öffentliche API des Marktdaten-Moduls. Die IPC-Handler in main.js nutzen ausschliesslich
// diesen Einstiegspunkt.
//
// Yahoo ist die einzige Quelle — auch für die Währungsumrechnung (Symbol '<VON><NACH>=X').
// Dadurch gibt es genau eine Antwortform zu parsen und keine zweite API, die ausfallen kann.

import { fetchQuote, fetchHistory, searchSymbols } from './yahoo.js';

// Tages-Cache im Arbeitsspeicher. Bewusst keine Persistenz in dieser Phase:
// Ein Neustart soll den Zustand zurücksetzen, damit Tests reproduzierbar bleiben.
const priceCache = new Map();

function cacheKey(symbol) {
  return `${symbol}_${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Holt einen Kurs über den Tages-Cache.
 * @returns {Promise<{ quote: object, cached: boolean }>}
 */
async function getCachedQuote(symbol, bypassCache) {
  const key = cacheKey(symbol);
  if (!bypassCache && priceCache.has(key)) {
    return { quote: priceCache.get(key), cached: true };
  }
  const quote = await fetchQuote(symbol);
  priceCache.set(key, quote);
  return { quote, cached: false };
}

/**
 * Ermittelt den Umrechnungskurs zwischen zwei Währungen via Yahoo-FX-Symbol.
 * Gibt 1 zurück, wenn beide Währungen identisch sind.
 */
async function getFxRate(from, to, bypassCache) {
  if (from === to) return { rate: 1, fxSymbol: null, cached: false };
  const fxSymbol = `${from}${to}=X`;
  const { quote, cached } = await getCachedQuote(fxSymbol, bypassCache);
  return { rate: quote.price, fxSymbol, cached };
}

/**
 * Holt den Kurs eines Symbols und rechnet ihn in die Zielwährung um.
 *
 * Originalpreis, FX-Kurs und umgerechneter Preis werden alle drei zurückgegeben,
 * damit in der Testbench sichtbar ist, welcher Schritt fehlschlägt.
 *
 * @param {string} symbol
 * @param {string} targetCurrency ISO-4217, z.B. 'CHF'
 * @param {{ bypassCache?: boolean }} options
 */
export async function getQuote(symbol, targetCurrency, { bypassCache = false } = {}) {
  const target = String(targetCurrency || 'CHF').toUpperCase();
  const { quote, cached } = await getCachedQuote(symbol, bypassCache);

  let fx = { rate: 1, fxSymbol: null };
  let fxError = null;
  try {
    fx = await getFxRate(quote.currency, target, bypassCache);
  } catch (err) {
    // Der Kurs selbst steht bereits fest — nur die Umrechnung fehlt.
    // Das wird gemeldet, statt den ganzen Abruf scheitern zu lassen.
    fxError = err?.message || 'Umrechnung fehlgeschlagen';
  }

  return {
    symbol: quote.symbol,
    exchangeName: quote.exchangeName,
    marketTime: quote.marketTime,
    originalPrice: quote.price,
    originalCurrency: quote.currency,
    fxSymbol: fx.fxSymbol,
    fxRate: fxError ? null : fx.rate,
    fxError,
    price: fxError ? null : quote.price * fx.rate,
    currency: target,
    cached,
    meta: quote.raw,
  };
}

export async function getHistory(symbol, options) {
  return fetchHistory(symbol, options);
}

export async function search(query) {
  return searchSymbols(query);
}

/** Leert den Tages-Cache vollständig. */
export function clearCache() {
  priceCache.clear();
}
