// electron/services/marketdata/index.js
// Öffentliche API des Marktdaten-Moduls. Die IPC-Handler in main.js nutzen ausschliesslich
// diesen Einstiegspunkt.
//
// Yahoo ist die einzige Quelle — auch für die Währungsumrechnung (Symbol '<VON><NACH>=X').
// Dadurch gibt es genau eine Antwortform zu parsen und keine zweite API, die ausfallen kann.

import { fetchQuote, fetchHistory, searchSymbols } from './yahoo.js';
import { readPrice, writePrice, clearStoredPrices } from './priceStore.js';

// Wie lange ein Kurs als frisch gilt. Bewusst kein Tages-Cache mehr: der View
// aktualisiert beim Öffnen, und ein Tages-Cache würde beim zweiten Öffnen am
// selben Tag gar nichts mehr abrufen. 15 Minuten halten die Kurse aktuell,
// ohne Yahoo bei jedem Klick erneut anzufragen.
const QUOTE_TTL_MS = 15 * 60 * 1000;

// Pause zwischen zwei echten Netzabrufen eines Stapels. Ohne Drosselung
// antwortet Yahoo bei vielen Positionen mit HTTP 429 — genau die Falle, an der
// der erste Investment-View gescheitert ist.
const BATCH_DELAY_MS = 250;

// Zweite Cache-Ebene vor der Datenbank: spart den SQLite-Zugriff innerhalb
// einer Sitzung. Der persistente Cache in priceStore.js überlebt den Neustart.
const memoryCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFresh(fetchedAt) {
  const t = Date.parse(fetchedAt);
  return Number.isFinite(t) && Date.now() - t < QUOTE_TTL_MS;
}

/** Bringt einen Cache-Eintrag in dieselbe Form, die fetchQuote liefert. */
function storedToQuote(stored) {
  return {
    price: stored.price,
    currency: stored.currency,
    symbol: stored.symbol,
    exchangeName: stored.exchangeName,
    marketTime: stored.marketTime,
    raw: null, // Rohdaten werden nicht persistiert — nur die Testbench zeigt sie an.
  };
}

/**
 * Holt einen Kurs über die Cache-Kette Speicher → Datenbank → Netz.
 *
 * Schlägt der Netzabruf fehl, wird der letzte bekannte Kurs als `stale`
 * zurückgegeben statt zu werfen. Ohne Netz zeigt die App damit den letzten
 * Stand mit Zeitpunkt statt einer Lücke. Nur wenn auch der Cache leer ist,
 * schlägt der Abruf durch.
 *
 * @returns {Promise<{quote: object, cached: boolean, stale: boolean,
 *                    fetchedAt: string, error: string|null}>}
 */
async function getCachedQuote(symbol, bypassCache) {
  if (!bypassCache) {
    const mem = memoryCache.get(symbol);
    if (mem && isFresh(mem.fetchedAt)) {
      return { quote: mem.quote, cached: true, stale: false, fetchedAt: mem.fetchedAt, error: null };
    }

    const stored = readPrice(symbol);
    if (stored && isFresh(stored.fetchedAt)) {
      const quote = storedToQuote(stored);
      memoryCache.set(symbol, { quote, fetchedAt: stored.fetchedAt });
      return { quote, cached: true, stale: false, fetchedAt: stored.fetchedAt, error: null };
    }
  }

  try {
    const quote = await fetchQuote(symbol);
    const fetchedAt = new Date().toISOString();
    writePrice(quote);
    memoryCache.set(symbol, { quote, fetchedAt });
    return { quote, cached: false, stale: false, fetchedAt, error: null };
  } catch (err) {
    const stored = readPrice(symbol);
    if (!stored) throw err;
    return {
      quote: storedToQuote(stored),
      cached: true,
      stale: true,
      fetchedAt: stored.fetchedAt,
      error: err?.message || 'Abruf fehlgeschlagen',
    };
  }
}

/**
 * Ermittelt den Umrechnungskurs zwischen zwei Währungen via Yahoo-FX-Symbol.
 * Gibt 1 zurück, wenn beide Währungen identisch sind.
 */
async function getFxRate(from, to, bypassCache) {
  if (from === to) return { rate: 1, fxSymbol: null, cached: false, stale: false };
  const fxSymbol = `${from}${to}=X`;
  const { quote, cached, stale } = await getCachedQuote(fxSymbol, bypassCache);
  return { rate: quote.price, fxSymbol, cached, stale };
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
  const { quote, cached, stale, fetchedAt, error } = await getCachedQuote(symbol, bypassCache);

  let fx = { rate: 1, fxSymbol: null, stale: false };
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
    // Ein veralteter Umrechnungskurs macht auch den umgerechneten Betrag veraltet.
    stale: stale || fx.stale,
    fetchedAt,
    staleReason: error,
    meta: quote.raw,
  };
}

/**
 * Holt mehrere Kurse nacheinander — der Weg, auf dem der Investment-View seine
 * Positionen aktualisiert.
 *
 * Bewusst sequentiell statt Promise.all: parallele Abrufe vieler Symbole führen
 * zuverlässig zu HTTP 429. Zwischen echten Netzabrufen liegt eine kurze Pause,
 * bei Cache-Treffern nicht.
 *
 * Ein einzelnes fehlgeschlagenes Symbol bricht den Stapel nicht ab, sondern
 * erscheint als Zeile mit `ok: false` — eine delistete Position soll den Rest
 * des Depots nicht unsichtbar machen.
 *
 * @param {string[]} symbols
 * @param {string} targetCurrency
 * @param {{ bypassCache?: boolean }} options
 * @returns {Promise<Array<{symbol: string, ok: boolean, data?: object, error?: string}>>}
 */
export async function getQuotes(symbols, targetCurrency, { bypassCache = false } = {}) {
  const unique = [...new Set((symbols || []).filter(Boolean))];
  const results = [];

  for (const symbol of unique) {
    try {
      const data = await getQuote(symbol, targetCurrency, { bypassCache });
      results.push({ symbol, ok: true, data });
      if (!data.cached) await sleep(BATCH_DELAY_MS);
    } catch (err) {
      results.push({ symbol, ok: false, error: err?.message || 'Unbekannter Fehler' });
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

export async function getHistory(symbol, options) {
  return fetchHistory(symbol, options);
}

export async function search(query) {
  return searchSymbols(query);
}

/** Leert Speicher- und Datenbank-Cache vollständig. */
export function clearCache() {
  memoryCache.clear();
  clearStoredPrices();
}
