// electron/services/marketdata/yahoo.js
// Yahoo Finance (inoffiziell) — einzige Kursquelle für Aktien, ETFs, Edelmetalle und FX.
//
// WICHTIG: Der User-Agent-Header ist zwingend. Ohne ihn antwortet Yahoo mit HTTP 429.
// Deshalb muss dieses Modul im Main-Prozess laufen: Im Renderer ist "User-Agent" ein
// Forbidden Header (Chromium ignoriert das Setzen) und die Production-CSP in main.js
// (default-src 'self') blockiert externe Requests ohnehin.
//
// Bewusst ohne Retry: In der Debug-Testbench soll ein Fehler sofort sichtbar werden,
// statt nach mehreren stillen Versuchen verzögert aufzuschlagen.

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const TIMEOUT_MS = 12000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Führt einen GET-Request mit Timeout und den nötigen Headern aus.
 * Wirft mit sprechender Meldung — die Aufrufer fangen sie und reichen sie an die UI durch.
 */
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      // 429 ist der typische Fall bei fehlendem/abgelehntem User-Agent — explizit benennen,
      // weil genau daran der frühere Investment-View scheiterte.
      if (res.status === 429) {
        throw new Error('Yahoo drosselt die Anfragen (HTTP 429) — User-Agent fehlt oder zu viele Abrufe');
      }
      if (res.status === 404) {
        throw new Error('Symbol bei Yahoo nicht gefunden (HTTP 404)');
      }
      throw new Error(`Yahoo antwortete mit HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Zeitüberschreitung nach ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Liest den aktuellen Kurs aus einer Chart-Antwort.
 * Primär meta.regularMarketPrice, ersatzweise der letzte belegte Schlusskurs.
 */
function extractPrice(result) {
  const metaPrice = result?.meta?.regularMarketPrice;
  if (typeof metaPrice === 'number' && metaPrice > 0) return metaPrice;

  const closes = result?.indicators?.quote?.[0]?.close;
  if (Array.isArray(closes)) {
    const lastClose = closes.filter((v) => v != null).at(-1);
    if (typeof lastClose === 'number') return lastClose;
  }
  return null;
}

/**
 * Londoner Notierungen kommen in Pence ("GBp") statt Pfund — auf GBP normalisieren.
 */
function normalizeCurrency(price, currency) {
  if (currency === 'GBp') return { price: price / 100, currency: 'GBP' };
  return { price, currency: currency || 'USD' };
}

/**
 * Holt den aktuellen Kurs eines Symbols in seiner Handelswährung.
 *
 * @param {string} symbol z.B. 'AAPL', 'VWRL.SW', '4GLD.DE', 'GC=F', 'USDCHF=X'
 * @returns {Promise<{ price: number, currency: string, symbol: string, exchangeName: string, marketTime: string|null, raw: object }>}
 */
export async function fetchQuote(symbol) {
  const json = await getJson(`${CHART_URL}/${encodeURIComponent(symbol)}`);

  const apiError = json?.chart?.error;
  if (apiError) {
    throw new Error(apiError.description || `Unbekanntes Symbol: ${symbol}`);
  }

  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Keine Daten für ${symbol} erhalten`);
  }

  const rawPrice = extractPrice(result);
  if (rawPrice === null) {
    throw new Error(`Kurs für ${symbol} nicht auslesbar`);
  }

  const { price, currency } = normalizeCurrency(rawPrice, result?.meta?.currency);
  const marketTime = result?.meta?.regularMarketTime;

  return {
    price,
    currency,
    symbol: result?.meta?.symbol || symbol,
    exchangeName: result?.meta?.fullExchangeName || result?.meta?.exchangeName || '',
    marketTime: typeof marketTime === 'number' ? new Date(marketTime * 1000).toISOString() : null,
    raw: result.meta,
  };
}

/**
 * Holt den Kursverlauf eines Symbols. Derselbe Endpunkt wie fetchQuote,
 * nur mit interval/range — Grundlage für eine spätere Verlaufskurve.
 *
 * @param {string} symbol
 * @param {{ interval?: string, range?: string }} options interval z.B. '1d'|'1wk'|'1mo', range z.B. '1mo'|'1y'|'max'
 * @returns {Promise<{ symbol: string, currency: string, points: Array<{ date: string, close: number }> }>}
 */
export async function fetchHistory(symbol, { interval = '1mo', range = '1y' } = {}) {
  const url = `${CHART_URL}/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const json = await getJson(url);

  const apiError = json?.chart?.error;
  if (apiError) {
    throw new Error(apiError.description || `Unbekanntes Symbol: ${symbol}`);
  }

  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;

  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error(`Kein Verlauf für ${symbol} verfügbar`);
  }

  const rawCurrency = result?.meta?.currency;
  const isPence = rawCurrency === 'GBp';

  const points = timestamps
    .map((ts, i) => ({ ts, close: closes[i] }))
    .filter((p) => p.close != null)
    .map((p) => ({
      date: new Date(p.ts * 1000).toISOString().slice(0, 10),
      close: isPence ? p.close / 100 : p.close,
    }));

  return {
    symbol: result?.meta?.symbol || symbol,
    currency: isPence ? 'GBP' : rawCurrency || 'USD',
    points,
  };
}

/**
 * Sucht Symbole nach Freitext, damit Ticker nicht geraten werden müssen.
 *
 * @param {string} query z.B. 'vanguard ftse'
 * @returns {Promise<Array<{ symbol: string, name: string, type: string, exchange: string }>>}
 */
export async function searchSymbols(query) {
  const json = await getJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`);
  const quotes = Array.isArray(json?.quotes) ? json.quotes : [];

  return quotes
    .filter((q) => q?.symbol)
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || '',
      type: q.quoteType || '',
      exchange: q.exchDisp || q.exchange || '',
    }));
}
