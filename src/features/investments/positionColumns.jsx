import React from "react";
import { formatDateDE } from "../../utils/hbUtils.js";
import { ASSET_CLASS_LABELS } from "../../utils/investmentModel.js";
import {
  formatFetchedAt,
  formatPercent,
  formatQuantity,
  gainClass,
} from "../../utils/investmentFormat.js";

// Farbe je Anlageklasse. Die Werte stehen als CSS-Variablen im Stylesheet,
// damit Hell- und Dunkelmodus eigene Töne bekommen. Für SVG-Füllungen (Donut)
// gibt es die aufgelösten Werte in `useThemeColors()`.
export const ASSET_CLASS_COLORS = {
  etf: "var(--inv-class-etf)",
  stock: "var(--inv-class-stock)",
  metal: "var(--inv-class-metal)",
  crypto: "var(--inv-class-crypto)",
  other: "var(--inv-class-other)",
};

export function assetClassColor(assetClass) {
  return ASSET_CLASS_COLORS[assetClass] || ASSET_CLASS_COLORS.other;
}

/**
 * Vorbelegung: acht Spalten, die die Frage „was habe ich, was ist es wert und
 * wie steht es da" beantworten. Der Rest ist zuschaltbar — dieselbe Dichte wie
 * in der Rückstellungs-Tabelle.
 */
export const DEFAULT_POSITION_COLUMNS = [
  "name", "symbol", "quantity", "avgCost", "price", "marketValue",
  "unrealizedGain", "unrealizedGainPct",
];

/** Summe eines Feldes; `null` zählt nicht mit (unbewertet ist nicht wertlos). */
function sumBy(rows, pick) {
  let sum = 0;
  for (const row of rows) {
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

/**
 * Statuspillen hinter dem Namen. Der Text steht in der Pille — die Farbe ist
 * zusätzliche Kodierung, nie die einzige.
 */
function statusPills(row) {
  const pills = [];
  if (row.quoteError) {
    pills.push({ key: "error", cls: "hb-inv-pill--error", label: "Kurs fehlt", title: row.quoteError });
  } else if (row.quoteMissing) {
    pills.push({
      key: "nodata",
      cls: "hb-inv-pill--nodata",
      label: "Nicht bewertet",
      title: "Für diese Position wurde noch kein Kurs abgerufen.",
    });
  } else if (row.stale) {
    pills.push({
      key: "stale",
      cls: "hb-inv-pill--stale",
      label: "Kurs veraltet",
      title: `Letzter bekannter Kurs vom ${formatFetchedAt(row.fetchedAt)} — die App war offline.`,
    });
  }
  if (row.hasOversell) {
    pills.push({
      key: "oversell",
      cls: "hb-inv-pill--error",
      label: "Daten prüfen",
      title:
        "Es wurde mehr verkauft als vorhanden war. Der Bestand steht auf 0, " +
        "die Kostenbasis wurde vollständig angerechnet.",
    });
  }
  return pills;
}

/** Einheit hinter Kurs und Einstand — bei Metallen „je oz", sonst nichts. */
function perUnitNote(row) {
  return row.unit === "pcs" ? null : <span className="hb-inv-sub"> je {row.unit}</span>;
}

/**
 * Alle Spaltendefinitionen der Positionsliste — der volle Satz.
 *
 * Zeilen sind die Objekte aus `calcPositions()`, erweitert um `id` (= `key`)
 * und `share` (Anteil am Gesamtdepotwert) — beides setzt der View. Beträge
 * laufen ausnahmslos über `fmt`, deshalb ist der Katalog eine Fabrik.
 *
 * @param {{fmt: (n: number) => string, baseCurrency: string}} ctx
 */
export function positionColumnCatalog({ fmt, baseCurrency }) {
  return [
    {
      id: "name",
      label: "Position",
      alwaysVisible: true,
      // Ohne Deckel schiebt ein langer Fondsname die rechten Spalten für alle
      // Zeilen aus dem Sichtfeld.
      maxWidth: 260,
      sortValue: (row) => String(row.name || "").toLowerCase(),
      render: (row) => (
        <span className="hb-inv-name">
          <span className="hb-inv-name-text">{row.name}</span>
          {statusPills(row).map((p) => (
            <span key={p.key} className={`hb-badge hb-inv-pill ${p.cls}`} title={p.title}>
              {p.label}
            </span>
          ))}
        </span>
      ),
      // Kein Betrag, aber die Summenzelle ganz links — dort liest sich die
      // Anzahl als Beschriftung des Totals.
      summarize: (rows) => {
        const unpriced = rows.filter((r) => !r.priced).length;
        const text = `${rows.length} Position${rows.length === 1 ? "" : "en"}`;
        return unpriced > 0 ? (
          <>
            {text} <span className="hb-muted">({unpriced} ohne Kurs)</span>
          </>
        ) : (
          text
        );
      },
    },
    {
      id: "symbol",
      label: "Symbol",
      shrink: true,
      sortValue: (row) => String(row.quoteSymbol || ""),
      // Bei Metallen steht hier das Future-Symbol, unter dem tatsächlich
      // bewertet wird — nicht ein abweichender Eintrag aus den Stammdaten.
      render: (row) => <span className="hb-inv-symbol">{row.quoteSymbol}</span>,
    },
    {
      id: "quantity",
      label: "Bestand",
      align: "right",
      sortValue: (row) => row.quantity,
      render: (row) => formatQuantity(row.quantity, row.unit, row.assetClass),
    },
    {
      id: "avgCost",
      label: "Ø Einstand",
      align: "right",
      sortValue: (row) => row.avgCost,
      render: (row) =>
        row.avgCost === null ? null : (
          <>
            {fmt(row.avgCost)}
            {perUnitNote(row)}
          </>
        ),
    },
    {
      id: "price",
      label: "Kurs",
      align: "right",
      sortValue: (row) => row.price,
      render: (row) => {
        if (row.price === null) return null;
        // Der Kurs steht in Buchwährung — die Handelswährung gehört trotzdem
        // sichtbar dazu, sonst sieht ein FX-Fehler wie ein Kurssturz aus.
        const foreign = row.quoteCurrency && row.quoteCurrency !== baseCurrency;
        return (
          <>
            {fmt(row.price)}
            {perUnitNote(row)}
            {foreign && <span className="hb-inv-sub"> · aus {row.quoteCurrency}</span>}
          </>
        );
      },
    },
    {
      id: "marketValue",
      label: "Wert",
      align: "right",
      alwaysVisible: true,
      sortValue: (row) => row.marketValue,
      render: (row) => (row.marketValue === null ? null : fmt(row.marketValue)),
      summarize: (rows) => {
        const priced = rows.filter((r) => r.priced);
        // Keine einzige bewertete Position: „—" statt einer Null, die wie ein
        // Totalverlust aussähe.
        if (!priced.length) return <span className="hb-muted">—</span>;
        return fmt(sumBy(priced, (r) => r.marketValue));
      },
    },
    {
      id: "unrealizedGain",
      label: "G/V",
      align: "right",
      sortValue: (row) => row.unrealizedGain,
      render: (row) =>
        row.unrealizedGain === null ? null : (
          <span className={gainClass(row.unrealizedGain)}>
            {row.unrealizedGain > 0 ? "+" : ""}
            {fmt(row.unrealizedGain)}
          </span>
        ),
      summarize: (rows) => {
        const priced = rows.filter((r) => r.priced);
        if (!priced.length) return <span className="hb-muted">—</span>;
        const total = sumBy(priced, (r) => r.unrealizedGain);
        return (
          <span className={gainClass(total)}>
            {total > 0 ? "+" : ""}
            {fmt(total)}
          </span>
        );
      },
    },
    {
      id: "unrealizedGainPct",
      label: "G/V %",
      align: "right",
      sortValue: (row) => row.unrealizedGainPct,
      render: (row) =>
        row.unrealizedGainPct === null ? null : (
          <span className={gainClass(row.unrealizedGainPct)}>
            {formatPercent(row.unrealizedGainPct)}
          </span>
        ),
    },
    {
      id: "assetClass",
      label: "Klasse",
      sortValue: (row) => ASSET_CLASS_LABELS[row.assetClass] || "",
      // Derselbe Farbpunkt wie im Donut — die einzige Brücke, die Tabelle und
      // Chart als ein System lesbar macht.
      render: (row) => (
        <span className="hb-inv-class">
          <span className="hb-cat-dot" style={{ background: assetClassColor(row.assetClass) }} />
          {ASSET_CLASS_LABELS[row.assetClass] || ASSET_CLASS_LABELS.other}
        </span>
      ),
    },
    {
      id: "share",
      label: "Anteil",
      align: "right",
      sortValue: (row) => row.share,
      render: (row) => (row.share === null ? null : formatPercent(row.share, { digits: 1, sign: false })),
    },
    {
      id: "dividends",
      label: "Ausschüttungen",
      align: "right",
      sortValue: (row) => row.dividends,
      render: (row) => (row.dividends > 0 ? fmt(row.dividends) : null),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.dividends)),
    },
    {
      id: "realizedGain",
      label: "Realisiert",
      align: "right",
      sortValue: (row) => row.realizedGain,
      render: (row) =>
        row.realizedGain === 0 ? null : (
          <span className={gainClass(row.realizedGain)}>
            {row.realizedGain > 0 ? "+" : ""}
            {fmt(row.realizedGain)}
          </span>
        ),
      summarize: (rows) => {
        const total = sumBy(rows, (r) => r.realizedGain);
        return (
          <span className={gainClass(total)}>
            {total > 0 ? "+" : ""}
            {fmt(total)}
          </span>
        );
      },
    },
    {
      id: "totalReturn",
      label: "Gesamtrendite",
      align: "right",
      sortValue: (row) => row.totalReturn,
      render: (row) => (
        <span className={gainClass(row.totalReturn)}>
          {row.totalReturn > 0 ? "+" : ""}
          {fmt(row.totalReturn)}
        </span>
      ),
    },
    {
      id: "lastDate",
      label: "Letzte Buchung",
      sortValue: (row) => row.lastDate,
      render: (row) => formatDateDE(row.lastDate),
    },
  ];
}

/**
 * Der Spaltenkatalog mit angewandter Vorbelegung.
 *
 * Dasselbe zweistufige Muster wie bei den Rückstellungen: der Katalog beschreibt
 * die Spalten, `DEFAULT_POSITION_COLUMNS` entscheidet, welche davon zu Beginn
 * sichtbar sind. `alwaysVisible` allein genügt nicht — `useTableColumns` leitet
 * den Ausgangszustand ausschließlich aus `defaultVisible` ab.
 *
 * @param {{fmt: (n: number) => string, baseCurrency: string}} ctx
 */
export function buildPositionColumns(ctx) {
  const defaults = new Set(DEFAULT_POSITION_COLUMNS);
  return positionColumnCatalog(ctx).map((col) => ({
    ...col,
    defaultVisible: defaults.has(col.id),
  }));
}
