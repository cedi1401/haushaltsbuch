// electron/services/marketdata/priceStore.js
// Persistenz des Kurs-Caches. Dünne Schicht zwischen dem Marktdaten-Service und db.js.
//
// Zwei Aufgaben, die hier und nicht im Service liegen:
//
// 1. Jeder Datenbankfehler wird geschluckt. Ein beschädigter oder noch gar nicht
//    initialisierter Cache darf einen Kursabruf niemals scheitern lassen — er ist
//    Beschleunigung und Offline-Reserve, keine Voraussetzung.
// 2. Der Service kennt getDb() nicht. Dadurch bleibt er ohne laufende Datenbank
//    lauffähig (Tests, frischer Start vor initDatabase).

import { getDb } from '../../database/db.js';

// Letzte gemeldete Fehlermeldung. Ein defekter Cache erzeugt bei jedem Symbol
// denselben Fehler — ohne diese Sperre wären es pro Abruf dutzende identische
// Zeilen, in denen die eigentliche Ursache untergeht.
let lastLoggedError = null;

function withDb(fn, fallback) {
  try {
    const result = fn(getDb());
    lastLoggedError = null;
    return result;
  } catch (err) {
    // console.error, nicht warn: der Cache fällt hier vollständig aus, auch
    // wenn der Kursabruf selbst weiterläuft.
    const message = err?.message || String(err);
    if (message !== lastLoggedError) {
      lastLoggedError = message;
      console.error('[priceStore] Cache-Zugriff fehlgeschlagen — Kurse werden nicht zwischengespeichert:', message);
    }
    return fallback;
  }
}

/**
 * Liest den zuletzt gespeicherten Kurs eines Symbols.
 * @param {string} symbol
 * @returns {{symbol: string, price: number, currency: string, exchangeName: string,
 *            marketTime: string|null, fetchedAt: string}|null}
 */
export function readPrice(symbol) {
  return withDb((store) => store.getCachedPrice(symbol), null);
}

/**
 * Schreibt einen Kurs in den Cache. `fetchedAt` wird hier gesetzt, damit im
 * gesamten Cache dieselbe Zeitquelle gilt.
 * @param {{symbol: string, price: number, currency: string,
 *          exchangeName?: string, marketTime?: string|null}} quote
 */
export function writePrice(quote) {
  if (!quote?.symbol || typeof quote.price !== 'number') return;
  withDb((store) => {
    store.setCachedPrice({
      symbol: quote.symbol,
      price: quote.price,
      currency: quote.currency,
      exchangeName: quote.exchangeName,
      marketTime: quote.marketTime,
      fetchedAt: new Date().toISOString(),
    });
  }, undefined);
}

/** Leert den persistenten Cache vollständig. */
export function clearStoredPrices() {
  withDb((store) => store.clearPriceCache(), undefined);
}
