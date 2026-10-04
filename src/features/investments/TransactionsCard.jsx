import React, { useMemo, useState } from "react";
import { Card, CardContent, Button, RangeTabs } from "../../components/ui.jsx";
import { IconDelete, IconEdit, IconPlus } from "../../components/icons.jsx";
import { formatCurrency, formatDateDE } from "../../utils/hbUtils.js";
import { TRANSACTION_TYPE_LABELS } from "../../utils/investmentModel.js";
import { formatQuantity, formatQuotePrice } from "../../utils/investmentFormat.js";

const FILTER_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "buy", label: "Kauf" },
  { value: "sell", label: "Verkauf" },
  { value: "dividend", label: "Ausschüttung" },
];

const PREVIEW_ROWS = 5;

/**
 * Alle Buchungen als feste Tabelle — dasselbe Muster wie die Buchungslisten
 * in Dashboard und Topf-View: feste Spalten, fünf Zeilen, „Weitere anzeigen",
 * Bearbeiten/Löschen beim Überfahren.
 *
 * Bewusst ohne Farbe auf Art und Betrag: Ein Kauf ist kein Verlust. Grün und
 * Rot bleiben in diesem View für Gewinn/Verlust reserviert; die Richtung des
 * Geldflusses trägt das Vorzeichen.
 *
 * @param {object} props
 * @param {Array<object>} props.transactions Ergebnis von listTransactions (neueste zuerst)
 * @param {Map<string, string>} props.depotAccent depotId -> Akzentfarbe
 * @param {(tx: object) => void} props.onEdit
 * @param {(tx: object) => void} props.onDelete
 * @param {() => void} props.onAdd
 * @param {(n: number) => string} props.fmt
 * @param {string} props.baseCurrency
 */
export default function TransactionsCard({
  transactions,
  depotAccent,
  onEdit,
  onDelete,
  onAdd,
  fmt,
  baseCurrency,
}) {
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.type === filter)),
    [transactions, filter],
  );

  function changeFilter(next) {
    setFilter(next);
    setShowAll(false);
  }

  const visible = showAll ? rows : rows.slice(0, PREVIEW_ROWS);

  return (
    <Card>
      <CardContent>
        <div className="hb-row" style={{ alignItems: "center", marginBottom: 10, gap: 8 }}>
          <div className="hb-title-group">
            <h3 className="hb-card-title">Transaktionen</h3>
            <span className="hb-info-pill">
              {rows.length === transactions.length
                ? `${transactions.length} Buchung${transactions.length === 1 ? "" : "en"}`
                : `${rows.length} von ${transactions.length}`}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RangeTabs
              options={FILTER_OPTIONS}
              value={filter}
              onChange={changeFilter}
              ariaLabel="Art filtern"
            />
            <button
              type="button"
              className="hb-icon-btn"
              onClick={onAdd}
              title="Transaktion erfassen"
              aria-label="Transaktion erfassen"
            >
              <IconPlus />
            </button>
          </div>
        </div>

        <div className="hb-table-wrap">
          <table className="hb-table hb-entries-table hb-inv-tx-table">
            <thead>
              <tr>
                <th className="hb-col-date">Datum</th>
                <th className="hb-col-type">Art</th>
                <th className="hb-col-asset">Position</th>
                <th className="hb-col-depot">Depot</th>
                <th className="hb-col-qty hb-right">Menge</th>
                <th className="hb-col-price hb-right">Preis</th>
                <th className="hb-col-amount hb-right">Betrag</th>
                <th className="hb-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hb-muted">Keine Buchung dieser Art erfasst.</td>
                </tr>
              ) : (
                visible.map((row) => {
                  // Bei einer Ausschüttung ist quantity = 1 und price der
                  // Gesamtbetrag (Datenmodell, Abschnitt 7). „1 Stk" wäre dort
                  // eine Falschaussage.
                  const isDividend = row.type === "dividend";
                  const foreign = row.currency !== baseCurrency;
                  return (
                    <tr key={row.id}>
                      <td className="hb-col-date">{formatDateDE(row.date)}</td>
                      <td className="hb-col-type">{TRANSACTION_TYPE_LABELS[row.type] || row.type}</td>
                      <td className="hb-col-asset" title={`${row.name} · ${row.quoteSymbol}`}>
                        {row.name}
                        <span className="hb-inv-sub"> · {row.quoteSymbol}</span>
                      </td>
                      <td className="hb-col-depot" title={row.depotName}>
                        <span className="hb-inv-class">
                          <span className="hb-cat-dot" style={{ background: depotAccent.get(row.depotId) }} />
                          {row.depotName}
                        </span>
                      </td>
                      <td className="hb-col-qty hb-right">
                        {isDividend ? "—" : formatQuantity(row.quantity, row.unit, row.assetClass)}
                      </td>
                      <td className="hb-col-price hb-right">
                        {isDividend ? (
                          "—"
                        ) : (
                          <>
                            {formatQuotePrice(row.price, row.currency)}
                            {row.unit !== "pcs" && <span className="hb-inv-sub"> je {row.unit}</span>}
                          </>
                        )}
                      </td>
                      {/* Immer in Buchwährung, mit Vorzeichen. Bei Fremdwährung
                          steht der Originalbetrag dahinter, der Kurs im title. */}
                      <td
                        className="hb-col-amount hb-right"
                        title={foreign ? `Wechselkurs vom ${formatDateDE(row.date)}: ${row.fxRate}` : undefined}
                      >
                        <span className="hb-sign">{row.cashFlowBase > 0 ? "+" : row.cashFlowBase < 0 ? "−" : ""}</span>
                        <span className="hb-amount-value">{fmt(Math.abs(row.cashFlowBase))}</span>
                        {foreign && (
                          <span className="hb-inv-sub"> · {formatCurrency(row.net, row.currency)}</span>
                        )}
                      </td>
                      <td className="hb-col-actions">
                        <div className="hb-actions hb-actions-hover">
                          <button
                            type="button"
                            className="hb-icon-btn"
                            onClick={() => onEdit(row)}
                            title="Bearbeiten"
                            aria-label="Bearbeiten"
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="hb-icon-btn"
                            onClick={() => onDelete(row)}
                            title="Löschen"
                            aria-label="Löschen"
                          >
                            <IconDelete />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {rows.length > PREVIEW_ROWS && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <Button variant="outline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Weniger anzeigen" : `Weitere ${rows.length - PREVIEW_ROWS} anzeigen`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
