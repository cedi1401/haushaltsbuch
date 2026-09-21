import React, { useMemo, useState } from "react";
import { Card, CardContent, RangeTabs } from "../../components/ui.jsx";
import DataTable from "../../components/DataTable.jsx";
import OverflowMenu from "../../components/OverflowMenu.jsx";
import { buildTransactionColumns } from "./transactionColumns.jsx";

const FILTER_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "buy", label: "Kauf" },
  { value: "sell", label: "Verkauf" },
  { value: "dividend", label: "Ausschüttung" },
];

/**
 * Alle Buchungen als flache Tabelle — eine Sektion ohne Band.
 *
 * Bewusst ohne Detailbereich: Eine Transaktion hat rund zwölf Felder, die alle
 * als Spalte erreichbar sind. Ein Detailbereich zeigte dieselben Werte ein
 * zweites Mal. Die Positionsliste braucht ihn, weil sie Aggregate zeigt und
 * Einzelbuchungen nachliefert; hier gibt es nichts nachzuliefern.
 *
 * @param {object} props
 * @param {Array<object>} props.transactions Ergebnis von listTransactions
 * @param {Map<string, string>} props.depotAccent depotId -> Akzentfarbe
 * @param {(tx: object) => void} props.onEdit
 * @param {(tx: object) => void} props.onDelete
 * @param {(n: number) => string} props.fmt
 * @param {string} props.baseCurrency
 */
export default function TransactionsCard({
  transactions,
  depotAccent,
  onEdit,
  onDelete,
  fmt,
  baseCurrency,
}) {
  const [filter, setFilter] = useState("all");

  const columns = useMemo(
    () => buildTransactionColumns({ fmt, baseCurrency, depotAccent }),
    [fmt, baseCurrency, depotAccent],
  );

  const rows = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.type === filter)),
    [transactions, filter],
  );

  // Eine Sektion ohne Label heißt „kein Gliederungsband" (siehe DataTable).
  const sections = useMemo(() => [{ key: "all", label: null, rows }], [rows]);

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
          toolbar={
            <>
              <h3 className="hb-card-title">Transaktionen</h3>
              <span className="hb-muted" style={{ fontSize: 12 }}>
                {rows.length === transactions.length
                  ? `${transactions.length} Buchung${transactions.length === 1 ? "" : "en"}`
                  : `${rows.length} von ${transactions.length}`}
              </span>
              <RangeTabs
                options={FILTER_OPTIONS}
                value={filter}
                onChange={setFilter}
                ariaLabel="Art filtern"
              />
            </>
          }
          renderRowActions={(row) => (
            <OverflowMenu
              buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              label={`Aktionen für die Buchung vom ${row.date}`}
              items={[
                { label: "Bearbeiten", onClick: () => onEdit(row) },
                { label: "Löschen", danger: true, onClick: () => onDelete(row) },
              ]}
            />
          )}
        />
        {rows.length === 0 && (
          <div className="hb-muted" style={{ fontSize: 13, padding: "12px 4px 0" }}>
            Keine Buchung dieser Art erfasst.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
