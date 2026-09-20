import React, { useState } from "react";
import { fetchQuote, fetchHistory, searchSymbols, marketDataAvailable } from "../dal/marketdata.js";

// Debug-Oberfläche zum Prüfen der Marktdaten-Abrufe. Bewusst roh gehalten:
// Dieser View dient dem Nachweis, dass das Backend trägt — nicht der Gestaltung.
// Er ist nur im Dev-Modus erreichbar (siehe NavDrawer.jsx).

// Live verifizierte Symbole: decken Handelswährung = Zielwährung, Fremdwährung,
// Edelmetall, FX und den Fehlerfall ab.
const TEST_SYMBOLS = [
  { symbol: "AAPL", note: "Aktie, USD" },
  { symbol: "VWRL.SW", note: "ETF, CHF (Schweizer Börse)" },
  { symbol: "4GLD.DE", note: "Gold-ETC, EUR" },
  { symbol: "GC=F", note: "Gold-Future, USD" },
  { symbol: "USDCHF=X", note: "Wechselkurs" },
  { symbol: "QUATSCH123", note: "muss sauber fehlschlagen" },
];

const box = {
  border: "1px solid var(--hb-border, #d0d0d0)",
  borderRadius: 6,
  padding: 12,
  marginBottom: 12,
};

const mono = {
  fontFamily: "Consolas, 'Courier New', monospace",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: 320,
  overflow: "auto",
  margin: 0,
};

export default function MarketDebugView({ baseCurrency }) {
  const [symbol, setSymbol] = useState("AAPL");
  const [mode, setMode] = useState("quote");
  const [range, setRange] = useState("1y");
  const [interval, setIntervalValue] = useState("1mo");
  const [bypassCache, setBypassCache] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [batch, setBatch] = useState(null);

  async function runSingle() {
    setBusy(true);
    setResult(null);
    const started = performance.now();
    let response;
    if (mode === "history") {
      response = await fetchHistory(symbol, { interval, range });
    } else if (mode === "search") {
      response = await searchSymbols(symbol);
    } else {
      response = await fetchQuote(symbol, baseCurrency, { bypassCache });
    }
    setResult({ ...response, ms: Math.round(performance.now() - started), mode });
    setBusy(false);
  }

  async function runBatch() {
    setBusy(true);
    setBatch([]);
    const rows = [];
    for (const item of TEST_SYMBOLS) {
      const started = performance.now();
      const response = await fetchQuote(item.symbol, baseCurrency, { bypassCache: true });
      rows.push({
        ...item,
        ok: response.ok === true,
        price: response.data?.price ?? null,
        originalPrice: response.data?.originalPrice ?? null,
        originalCurrency: response.data?.originalCurrency ?? null,
        fxRate: response.data?.fxRate ?? null,
        error: response.error || response.data?.fxError || null,
        ms: Math.round(performance.now() - started),
      });
      setBatch([...rows]);
    }
    setBusy(false);
  }

  const data = result?.data;

  return (
    <div style={{ padding: 16, maxWidth: 1000 }}>
      <h2 style={{ marginTop: 0 }}>Marktdaten — Testbench</h2>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Prüft die Yahoo-Abrufe im Main-Prozess. Zielwährung: <strong>{baseCurrency}</strong>
      </p>

      {!marketDataAvailable && (
        <div style={{ ...box, borderColor: "#c44", color: "#c44" }}>
          Kein Electron erkannt — die Abrufe funktionieren nur in der Desktop-App
          (<code>npm run dev</code>), nicht im reinen Browser über <code>npm run preview</code>.
        </div>
      )}

      <div style={box}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder={mode === "search" ? "Suchbegriff" : "Symbol"}
            style={{ padding: 6, minWidth: 200 }}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) runSingle(); }}
          />
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 6 }}>
            <option value="quote">Kurs</option>
            <option value="history">Verlauf</option>
            <option value="search">Symbol-Suche</option>
          </select>

          {mode === "history" && (
            <>
              <select value={interval} onChange={(e) => setIntervalValue(e.target.value)} style={{ padding: 6 }}>
                {["1d", "1wk", "1mo"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={range} onChange={(e) => setRange(e.target.value)} style={{ padding: 6 }}>
                {["1mo", "3mo", "6mo", "1y", "5y", "max"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </>
          )}

          {mode === "quote" && (
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={bypassCache} onChange={(e) => setBypassCache(e.target.checked)} />
              Cache umgehen
            </label>
          )}

          <button type="button" onClick={runSingle} disabled={busy} style={{ padding: "6px 14px" }}>
            Abrufen
          </button>
          <button type="button" onClick={runBatch} disabled={busy} style={{ padding: "6px 14px" }}>
            Alle Testsymbole durchlaufen
          </button>
        </div>
      </div>

      {result && (
        <div style={box}>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: result.ok ? "#2a7" : "#c44" }}>
              {result.ok ? "Erfolg" : "Fehler"}
            </strong>
            {" · "}{result.ms} ms
            {data?.cached ? " · aus Cache" : ""}
          </div>

          {!result.ok && <div style={{ color: "#c44", marginBottom: 8 }}>{result.error}</div>}

          {result.ok && result.mode === "quote" && (
            <table style={{ borderSpacing: "12px 2px", marginBottom: 8 }}>
              <tbody>
                <tr><td>Symbol</td><td><strong>{data.symbol}</strong> · {data.exchangeName}</td></tr>
                <tr><td>Kurs original</td><td>{data.originalPrice} {data.originalCurrency}</td></tr>
                <tr>
                  <td>Umrechnung</td>
                  <td>{data.fxSymbol ? `${data.fxSymbol} = ${data.fxRate}` : "nicht nötig (gleiche Währung)"}</td>
                </tr>
                <tr>
                  <td>Kurs in {data.currency}</td>
                  <td><strong>{data.price != null ? data.price.toFixed(4) : "—"}</strong></td>
                </tr>
                <tr><td>Marktzeit</td><td>{data.marketTime || "—"}</td></tr>
                {data.fxError && <tr><td>FX-Fehler</td><td style={{ color: "#c44" }}>{data.fxError}</td></tr>}
              </tbody>
            </table>
          )}

          {result.ok && result.mode === "history" && (
            <div style={{ marginBottom: 8 }}>
              {data.points.length} Datenpunkte in {data.currency} · erster {data.points[0]?.date} · letzter{" "}
              {data.points.at(-1)?.date}
            </div>
          )}

          {result.ok && result.mode === "search" && (
            <div style={{ marginBottom: 8 }}>{data.length} Treffer</div>
          )}

          <details>
            <summary style={{ cursor: "pointer" }}>Rohantwort</summary>
            <pre style={mono}>{JSON.stringify(result.data ?? result, null, 2)}</pre>
          </details>
        </div>
      )}

      {batch && (
        <div style={box}>
          <strong>Sammel-Durchlauf</strong>
          <table style={{ width: "100%", borderSpacing: "8px 4px", marginTop: 8, textAlign: "left" }}>
            <thead>
              <tr>
                <th>Symbol</th><th>Erwartung</th><th>Status</th><th>Original</th><th>FX</th>
                <th>in {baseCurrency}</th><th>ms</th>
              </tr>
            </thead>
            <tbody>
              {batch.map((row) => (
                <tr key={row.symbol}>
                  <td><code>{row.symbol}</code></td>
                  <td style={{ opacity: 0.7 }}>{row.note}</td>
                  <td style={{ color: row.ok ? "#2a7" : "#c44" }}>{row.ok ? "OK" : "Fehler"}</td>
                  <td>{row.originalPrice != null ? `${row.originalPrice} ${row.originalCurrency}` : "—"}</td>
                  <td>{row.fxRate != null ? row.fxRate : "—"}</td>
                  <td>{row.price != null ? row.price.toFixed(2) : "—"}</td>
                  <td>{row.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {batch.some((r) => r.error) && (
            <ul style={{ color: "#c44", marginBottom: 0 }}>
              {batch.filter((r) => r.error).map((r) => (
                <li key={r.symbol}><code>{r.symbol}</code>: {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
