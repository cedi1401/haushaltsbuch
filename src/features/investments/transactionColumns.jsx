import React from "react";
import { formatCurrency, formatDateDE } from "../../utils/hbUtils.js";
import { TRANSACTION_TYPE_LABELS } from "../../utils/investmentModel.js";
import { formatFetchedAt, formatQuantity, formatQuotePrice } from "../../utils/investmentFormat.js";

/**
 * Vorbelegung: die sieben Spalten, die eine Buchung beantwortbar machen —
 * wann, was, wo, wie viel, zu welchem Preis und was unterm Strich floss.
 * Alles Weitere (Gebühr, Brutto, Währung, Wechselkurs, Notiz, Erfassung) ist
 * zuschaltbar.
 */
export const DEFAULT_TRANSACTION_COLUMNS = [
  "date", "type", "asset", "depot", "quantity", "price", "amount",
];

/** Summe eines Feldes; nicht-endliche Werte zählen nicht mit. */
function sumBy(rows, pick) {
  let sum = 0;
  for (const row of rows) {
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

/**
 * Spaltendefinitionen der Transaktionstabelle.
 *
 * Zeilen sind die Objekte aus `listTransactions()` — Transaktion plus Depot-
 * und Wertpapiername. Beträge in Buchwährung laufen über `fmt`, Beträge in
 * Handelswährung über `formatCurrency(n, row.currency)`: `fmt` beschriftet mit
 * der Buchwährung und wiese einen Dollarpreis als Franken aus.
 *
 * Bewusst ohne Farbe auf Art und Betrag: Ein Kauf ist kein Verlust. Grün und
 * Rot bleiben in diesem View ausschließlich für Gewinn/Verlust reserviert —
 * dieselbe Regel wie bei den Klassenfarben der Positionsliste. Die Richtung
 * des Geldflusses trägt das Vorzeichen.
 *
 * @param {{fmt: (n: number) => string, baseCurrency: string, depotAccent: Map<string, string>}} ctx
 */
export function transactionColumnCatalog({ fmt, baseCurrency, depotAccent }) {
  return [
    {
      id: "date",
      label: "Datum",
      shrink: true,
      alwaysVisible: true,
      sortValue: (row) => row.date,
      render: (row) => formatDateDE(row.date),
      summarize: (rows) => `${rows.length} Buchung${rows.length === 1 ? "" : "en"}`,
    },
    {
      id: "type",
      label: "Art",
      shrink: true,
      sortValue: (row) => TRANSACTION_TYPE_LABELS[row.type] || "",
      render: (row) => TRANSACTION_TYPE_LABELS[row.type] || row.type,
    },
    {
      id: "asset",
      label: "Position",
      alwaysVisible: true,
      maxWidth: 240,
      sortValue: (row) => String(row.name || "").toLowerCase(),
      render: (row) => (
        <>
          {row.name}
          <span className="hb-inv-sub"> · {row.quoteSymbol}</span>
        </>
      ),
    },
    {
      id: "depot",
      label: "Depot",
      maxWidth: 160,
      sortValue: (row) => String(row.depotName || "").toLowerCase(),
      // Derselbe Farbpunkt wie im Sektionsband der Positionsliste und im Donut:
      // die Farbe hängt am Depot, nicht an seinem Rang in irgendeiner Liste.
      render: (row) => (
        <span className="hb-inv-class">
          <span className="hb-cat-dot" style={{ background: depotAccent.get(row.depotId) }} />
          {row.depotName}
        </span>
      ),
    },
    {
      id: "quantity",
      label: "Menge",
      align: "right",
      // Bei einer Ausschüttung ist quantity = 1 und price der Gesamtbetrag
      // (Datenmodell, Abschnitt 7). „1 Stk" wäre dort eine Falschaussage.
      sortValue: (row) => (row.type === "dividend" ? null : row.quantity),
      render: (row) => (row.type === "dividend" ? null : formatQuantity(row.quantity, row.unit)),
    },
    {
      id: "price",
      label: "Preis",
      align: "right",
      sortValue: (row) => (row.type === "dividend" ? null : row.price),
      render: (row) =>
        row.type === "dividend" ? null : (
          <>
            {formatQuotePrice(row.price, row.currency)}
            {row.unit !== "pcs" && <span className="hb-inv-sub"> je {row.unit}</span>}
          </>
        ),
    },
    {
      id: "amount",
      label: "Betrag",
      align: "right",
      alwaysVisible: true,
      sortValue: (row) => row.cashFlowBase,
      // Immer in Buchwährung, mit Vorzeichen: Kauf ist ein Abfluss, Verkauf und
      // Ausschüttung sind Zuflüsse. Bei Fremdwährung steht der Originalbetrag
      // mit ISO-Code darunter — der Kurs selbst nur im title, er interessiert
      // deutlich seltener.
      render: (row) => {
        const foreign = row.currency !== baseCurrency;
        return (
          <span
            title={
              foreign
                ? `Wechselkurs vom ${formatDateDE(row.date)}: ${row.fxRate}`
                : undefined
            }
          >
            {row.cashFlowBase > 0 ? "+" : ""}
            {fmt(row.cashFlowBase)}
            {foreign && (
              <span className="hb-inv-sub"> · {formatCurrency(row.net, row.currency)}</span>
            )}
          </span>
        );
      },
      // Die Summe ist der Nettogeldfluss des gewählten Filters: was eingesetzt
      // wurde, abzüglich dessen, was zurückkam.
      summarize: (rows) => {
        const total = sumBy(rows, (r) => r.cashFlowBase);
        return `${total > 0 ? "+" : ""}${fmt(total)}`;
      },
    },
    {
      id: "fee",
      label: "Gebühr",
      align: "right",
      sortValue: (row) => row.fee,
      render: (row) => (row.fee > 0 ? formatCurrency(row.fee, row.currency) : null),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.feeBase)),
    },
    {
      id: "gross",
      label: "Brutto",
      align: "right",
      sortValue: (row) => row.gross,
      render: (row) => formatCurrency(row.gross, row.currency),
    },
    {
      id: "currency",
      label: "Währung",
      shrink: true,
      sortValue: (row) => row.currency,
      render: (row) => row.currency,
    },
    {
      id: "fxRate",
      label: "Wechselkurs",
      align: "right",
      sortValue: (row) => row.fxRate,
      // Bei Buchwährung steht dort immer 1 — das ist keine Information.
      render: (row) =>
        row.currency === baseCurrency ? null : (
          <span title={`Kurs vom ${formatDateDE(row.date)}`}>
            1 {row.currency} = {formatQuotePrice(row.fxRate, baseCurrency)}
          </span>
        ),
    },
    {
      id: "note",
      label: "Notiz",
      maxWidth: 200,
      sortValue: (row) => String(row.note || "").toLowerCase(),
      render: (row) => (row.note ? <span title={row.note}>{row.note}</span> : null),
    },
    {
      id: "createdAt",
      label: "Erfasst am",
      sortValue: (row) => row.createdAt,
      render: (row) => formatFetchedAt(row.createdAt),
    },
  ];
}

/**
 * Der Katalog mit angewandter Vorbelegung — dasselbe zweistufige Muster wie
 * bei der Positionsliste: `alwaysVisible` allein genügt `useTableColumns`
 * nicht, der Ausgangszustand entsteht ausschließlich aus `defaultVisible`.
 *
 * @param {{fmt: (n: number) => string, baseCurrency: string, depotAccent: Map<string, string>}} ctx
 */
export function buildTransactionColumns(ctx) {
  const defaults = new Set(DEFAULT_TRANSACTION_COLUMNS);
  return transactionColumnCatalog(ctx).map((col) => ({
    ...col,
    defaultVisible: defaults.has(col.id),
  }));
}
