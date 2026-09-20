// Data Access Layer für Marktdaten — kapselt den IPC-Aufruf in den Main-Prozess.
// Analog zu storage.js: die React-Seite ruft nur diese Funktionen auf.
//
// Ohne Electron gibt es keine Marktdaten: Im Browser blockiert CORS den Yahoo-Abruf
// und der nötige User-Agent-Header ist ein Forbidden Header. Statt daran zu scheitern,
// meldet der Browser-Zweig das ausdrücklich.

import makeLogger from "../utils/logger.js";

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
const log = makeLogger('dal/marketdata');

const UNAVAILABLE = {
  ok: false,
  error: 'Marktdaten sind nur in der Desktop-App verfügbar (kein Electron erkannt).',
};

/**
 * Holt den aktuellen Kurs eines Symbols, umgerechnet in die Zielwährung.
 *
 * @param {string} symbol z.B. 'AAPL', 'VWRL.SW', 'GC=F'
 * @param {string} targetCurrency ISO-4217, z.B. 'CHF'
 * @param {{ bypassCache?: boolean }} options
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
export async function fetchQuote(symbol, targetCurrency, options = {}) {
  if (!isElectron) return UNAVAILABLE;
  try {
    return await window.electronAPI.marketdata.quote(symbol, targetCurrency, options);
  } catch (err) {
    log.error('fetchQuote fehlgeschlagen', err);
    return { ok: false, error: err?.message || 'IPC-Aufruf fehlgeschlagen' };
  }
}

/**
 * Holt den Kursverlauf eines Symbols.
 *
 * @param {string} symbol
 * @param {{ interval?: string, range?: string }} options
 */
export async function fetchHistory(symbol, options = {}) {
  if (!isElectron) return UNAVAILABLE;
  try {
    return await window.electronAPI.marketdata.history(symbol, options);
  } catch (err) {
    log.error('fetchHistory fehlgeschlagen', err);
    return { ok: false, error: err?.message || 'IPC-Aufruf fehlgeschlagen' };
  }
}

/**
 * Sucht Symbole nach Freitext.
 *
 * @param {string} query
 */
export async function searchSymbols(query) {
  if (!isElectron) return UNAVAILABLE;
  try {
    return await window.electronAPI.marketdata.search(query);
  } catch (err) {
    log.error('searchSymbols fehlgeschlagen', err);
    return { ok: false, error: err?.message || 'IPC-Aufruf fehlgeschlagen' };
  }
}

export const marketDataAvailable = isElectron;
