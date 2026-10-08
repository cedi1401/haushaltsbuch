import React, { useMemo, useState } from "react";
import { Card, CardContent, Button, RangeTabs } from "../../components/ui.jsx";
import DataTable from "../../components/DataTable.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";
import { IconDelete, IconEdit, IconPlus } from "../../components/icons.jsx";
import { formatCurrency, formatDateDE, formatSigned } from "../../utils/hbUtils.js";
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
 * Spalten der Transaktionstabelle. Beträge laufen über `fmt`, deshalb eine
 * Fabrik — wie `positionColumnCatalog`.
 *
 * Datum, Position und Betrag sind fest: der Betrag muss die letzte sichtbare
 * Spalte bleiben, weil sie das Aktions-Overlay trägt.
 *
 * @param {{fmt: (n: number) => string, baseCurrency: string, depotAccent: Map<string, string>}} ctx
 */
function transactionColumnCatalog({ fmt, baseCurrency, depotAccent }) {
  return [
    {
      id: "date",
      label: "Datum",
      alwaysVisible: true,
      defaultVisible: true,
      shrink: true,
      sortValue: (row) => row.date,
      render: (row) => formatDateDE(row.date),
      summarize: () => "Summe",
    },
    {
      id: "type",
      label: "Art",
      defaultVisible: true,
      shrink: true,
      sortValue: (row) => TRANSACTION_TYPE_LABELS[row.type] || row.type,
      render: (row) => TRANSACTION_TYPE_LABELS[row.type] || row.type,
    },
    {
      id: "asset",
      label: "Position",
      alwaysVisible: true,
      defaultVisible: true,
      maxWidth: 320,
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
      defaultVisible: true,
      maxWidth: 180,
      sortValue: (row) => String(row.depotName || "").toLowerCase(),
      // Punkt und Name inline statt als Flex-Zeile: nur so greift die Ellipse
      // des gedeckelten Blocks.
      render: (row) => (
        <>
          <span className="hb-cat-dot hb-inv-tx-dot" style={{ background: depotAccent.get(row.depotId) }} />
          {row.depotName}
        </>
      ),
    },
    {
      id: "quantity",
      label: "Menge",
      align: "right",
      defaultVisible: true,
      // Bei einer Ausschüttung ist quantity = 1 und price der Gesamtbetrag
      // (Datenmodell, Abschnitt 7). „1 Stk" wäre dort eine Falschaussage.
      sortValue: (row) => (row.type === "dividend" ? null : row.quantity),
      render: (row) =>
        row.type === "dividend" ? null : formatQuantity(row.quantity, row.unit, row.assetClass),
    },
    {
      id: "price",
      label: "Preis",
      align: "right",
      defaultVisible: true,
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
      defaultVisible: true,
      sortValue: (row) => row.cashFlowBase,
      // Immer in Buchwährung, mit Vorzeichen. Bei Fremdwährung steht der
      // Originalbetrag davor, der Kurs im Tooltip — davor und nicht dahinter,
      // weil das Aktions-Overlay den rechten Rand der Zelle verdeckt.
      render: (row) => (
        <>
          {row.currency !== baseCurrency && (
            <HbTooltip
              inline
              focusable={false}
              text={`Wechselkurs vom ${formatDateDE(row.date)}: ${row.fxRate}`}
            >
              <span className="hb-inv-sub">{formatCurrency(row.net, row.currency)} · </span>
            </HbTooltip>
          )}
          {formatSigned(fmt, row.cashFlowBase)}
        </>
      ),
      // Netto-Geldfluss aller gefilterten Buchungen, auch der eingeklappten.
      summarize: (rows) =>
        formatSigned(fmt, rows.reduce((sum, row) => sum + (Number(row.cashFlowBase) || 0), 0)),
    },
  ];
}

/**
 * Alle Buchungen als `DataTable` — fünf Zeilen Vorschau, „Weitere anzeigen",
 * Bearbeiten/Löschen beim Überfahren. Filter und „Erfassen" sitzen im
 * Toolbar-Streifen der Tabelle, neben der Spaltenauswahl.
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

  const columns = useMemo(
    () => transactionColumnCatalog({ fmt, baseCurrency, depotAccent }),
    [fmt, baseCurrency, depotAccent],
  );
  const sections = useMemo(() => [{ key: "all", label: null, rows }], [rows]);

  function changeFilter(next) {
    setFilter(next);
    setShowAll(false);
  }

  return (
    <Card>
      <CardContent>
        <DataTable
          columns={columns}
          sections={sections}
          storageKey="hb.investments.transactions"
          defaultSort={{ columnId: "date", dir: "desc" }}
          label="Transaktionen"
          bounded={false}
          maxRows={showAll ? undefined : PREVIEW_ROWS}
          emptyText="Keine Buchung dieser Art erfasst."
          toolbar={
            <>
              <div className="hb-title-group">
                <h3 className="hb-card-title">Transaktionen</h3>
                <span className="hb-info-pill">
                  {rows.length === transactions.length
                    ? `${transactions.length} Buchung${transactions.length === 1 ? "" : "en"}`
                    : `${rows.length} von ${transactions.length}`}
                </span>
              </div>
              <div className="hb-dt-toolbar-end">
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
            </>
          }
          renderRowActions={(row) => (
            <>
              <button
                type="button"
                className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                onClick={() => onEdit(row)}
                title="Bearbeiten"
                aria-label="Bearbeiten"
              >
                <IconEdit />
              </button>
              <button
                type="button"
                className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle hb-icon-btn--danger"
                onClick={() => onDelete(row)}
                title="Löschen"
                aria-label="Löschen"
              >
                <IconDelete />
              </button>
            </>
          )}
        />

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
