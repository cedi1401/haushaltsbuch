// Kursversorgung des Investment-Views.
//
// Hält die Kurs-Map, die der Rechenkern (calcPositions) erwartet, und löst die
// beiden in Beschluss E festgelegten Aktualisierungen aus: automatisch beim
// Öffnen des Views und über den manuellen Knopf.
//
// Der Cache liegt im Main-Prozess (15-min-TTL, SQLite-Persistenz). Deshalb darf
// hier ruhig bei jedem Symbolwechsel abgerufen werden — ein Abruf innerhalb der
// TTL kostet keinen Netzverkehr. Nur der manuelle Knopf umgeht den Cache.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchQuotes, marketDataAvailable } from "../dal/marketdata.js";
import { collectQuoteSymbols, quoteMapFromBatch } from "../utils/investmentUtils.js";

const EMPTY_QUOTES = new Map();

/**
 * @param {object} investments book.investments
 * @param {string} baseCurrency Zielwährung des Buchs
 * @returns {{
 *   quotes: Map<string, object>, loading: boolean, error: string|null,
 *   lastUpdated: string|null, oldestFetchedAt: string|null, hasStale: boolean,
 *   available: boolean, refresh: (opts?: {bypassCache?: boolean}) => Promise<void>
 * }}
 */
export function useInvestmentQuotes(investments, baseCurrency) {
  const symbols = useMemo(() => collectQuoteSymbols(investments), [investments]);
  // Die Symbolliste ist bei jedem Render ein neues Array. Der String daraus ist
  // die eigentliche Abhängigkeit — sonst liefe der Abruf endlos im Kreis.
  const symbolKey = symbols.join(",");

  const [quotes, setQuotes] = useState(EMPTY_QUOTES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Zählt die Abrufe durch: eine verspätete Antwort eines älteren Abrufs darf
  // ein neueres Ergebnis nicht überschreiben.
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(
    async ({ bypassCache = false } = {}) => {
      const list = symbolKey ? symbolKey.split(",") : [];
      if (!list.length) {
        setQuotes(EMPTY_QUOTES);
        setError(null);
        return;
      }
      if (!marketDataAvailable) {
        setError("Marktdaten sind nur in der Desktop-App verfügbar.");
        return;
      }

      const token = ++requestRef.current;
      setLoading(true);
      setError(null);

      const result = await fetchQuotes(list, baseCurrency, { bypassCache });

      if (!mountedRef.current || token !== requestRef.current) return;

      if (!result.ok) {
        setError(result.error || "Kurse konnten nicht abgerufen werden.");
        setLoading(false);
        return;
      }

      setQuotes(quoteMapFromBatch(result));
      setLastUpdated(new Date().toISOString());
      setLoading(false);
    },
    [symbolKey, baseCurrency],
  );

  // Beim Öffnen des Views und immer dann, wenn eine neue Position dazukommt.
  // Der Abruf ist genau die Art von Synchronisation mit einem externen System,
  // für die Effects da sind. Das eine zusätzliche Rendern durch `setLoading(true)`
  // ist beabsichtigt — ohne dieses Rendern gäbe es keinen Ladezustand.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Ältester Abrufzeitpunkt über alle Kurse — das ist der ehrliche „Stand vom …".
  // Ein einzelner veralteter Kurs soll die Anzeige nicht frischer aussehen lassen,
  // als sie ist.
  const { oldestFetchedAt, hasStale } = useMemo(() => {
    let oldest = null;
    let stale = false;
    for (const q of quotes.values()) {
      if (q?.ok === false) continue;
      if (q?.stale) stale = true;
      const ts = q?.fetchedAt;
      if (typeof ts === "string" && (oldest === null || ts < oldest)) oldest = ts;
    }
    return { oldestFetchedAt: oldest, hasStale: stale };
  }, [quotes]);

  return {
    quotes,
    loading,
    error,
    lastUpdated,
    oldestFetchedAt,
    hasStale,
    available: marketDataAvailable,
    refresh,
  };
}

export default useInvestmentQuotes;
