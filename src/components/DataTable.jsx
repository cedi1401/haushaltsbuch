import React, { useMemo, useState } from "react";
import { useTableColumns } from "../hooks/useTableColumns.js";
import ColumnsFlyout from "./ColumnsFlyout.jsx";

/**
 * Generische Tabelle. Fachfrei: sie kennt weder Rücklagen noch Währungen.
 *
 * Leitentscheidung: Die Tabelle kennt **keine Gruppierung**, sie bekommt fertige
 * Sektionen. Damit bleibt die fachliche Ordnung (Reihenfolge der Gruppen, „Ohne
 * Gruppe" ans Ende, Farbzuweisung) vollständig im aufrufenden View. Der
 * ungruppierte Fall ist genau eine Sektion mit `label: null`.
 *
 * Spaltendefinition:
 *   {
 *     id,                       // Persistenz- und Sortierschlüssel
 *     label,
 *     align,                    // "right" ⇒ rechtsbündig + tabular-nums
 *     alwaysVisible,            // true ⇒ im Flyout ausgegraut + angehakt
 *     defaultVisible,           // Teil der Vorbelegung (Ausgangszustand)
 *     sortValue: (row) => …,    // null sortiert immer ans Ende
 *     render: (row) => node,    // null/undefined/"" ⇒ „—"
 *     summarize: (rows) => node // fehlt ⇒ Summenzelle bleibt leer
 *   }
 *
 * Sektion (vom View vorbereitet):
 *   { key, label, accent, meta, rows }   // rows brauchen je eine `id`
 *
 * Bewusst nicht vorgesehen: Zeilen-Auswahl, Filter, Paginierung, onRowClick,
 * Dichte-Option, renderEmpty (Leerzustände liegen im View), getRowId.
 */
export default function DataTable({ columns, sections, storageKey, defaultSort }) {
  const { visibleIds, toggle, reset } = useTableColumns(storageKey, columns);
  const visible = useMemo(() => {
    const chosen = new Set(visibleIds);
    return columns.filter((c) => chosen.has(c.id));
  }, [columns, visibleIds]);

  const [sort, setSort] = useState(defaultSort ?? null);
  const sortCol = useMemo(
    () => (sort ? columns.find((c) => c.id === sort.columnId) : null) ?? null,
    [columns, sort]
  );

  // Erster Klick immer aufsteigend, zweiter absteigend — keine typabhängige
  // Startrichtung. Die wäre für eine Differenz-Spalte ohnehin nicht eindeutig:
  // der schlimmste Fall ist dort der kleinste Wert, nicht der grösste.
  function toggleSort(id) {
    setSort((prev) =>
      prev?.columnId === id && prev.dir === "asc"
        ? { columnId: id, dir: "desc" }
        : { columnId: id, dir: "asc" }
    );
  }

  // Sortiert wird INNERHALB jeder Sektion — die Gliederung nach Gruppen ist die
  // äussere Ordnung und bleibt bestehen.
  const sortedSections = useMemo(
    () => sections.map((s) => ({ ...s, rows: sortRows(s.rows, sortCol, sort?.dir) })),
    [sections, sortCol, sort?.dir]
  );

  // Die Summenzeile liest alle Zeilen der Tabelle, nicht die einer Sektion —
  // sie beantwortet die Frage „wie viel muss insgesamt in den Töpfen liegen".
  const allRows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  return (
    <div className="hb-dt">
      {/* Ausserhalb von .hb-dt-scroll: innerhalb wanderte der Streifen beim
          horizontalen Scrollen mit den Spalten nach links aus und der
          Spalten-Button verschwände. */}
      <div className="hb-dt-toolbar">
        <ColumnsFlyout
          columns={columns}
          visibleIds={visibleIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>
      <div className="hb-dt-scroll">
        <table className="hb-dt-table">
          <thead>
            <tr>
              {visible.map((col) => {
                const active = sort?.columnId === col.id;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={col.align === "right" ? "hb-dt-num" : undefined}
                  >
                    <button
                      type="button"
                      className="hb-dt-th-btn"
                      onClick={() => toggleSort(col.id)}
                    >
                      <span>{col.label}</span>
                      <SortArrow active={active} dir={sort?.dir} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          {sortedSections.map((section) => (
            <tbody key={section.key}>
              {section.rows.map((row) => (
                <tr key={row.id} className="hb-dt-row">
                  {visible.map((col) => (
                    <td
                      key={col.id}
                      className={col.align === "right" ? "hb-dt-num" : undefined}
                    >
                      <Cell col={col} row={row} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="hb-dt-summary">
              {visible.map((col) => (
                <td
                  key={col.id}
                  className={col.align === "right" ? "hb-dt-num" : undefined}
                >
                  {col.summarize ? col.summarize(allRows) : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * Sortiert eine Sektion. Zwei Regeln, die nicht verhandelbar sind:
 * `null` landet immer am Ende — auch absteigend, sonst stünden die Positionen
 * ohne Turnus bei jedem zweiten Klick oben; und bei Gleichstand bleibt die
 * Eingangsreihenfolge erhalten (Array.sort ist zwar seit ES2019 stabil, aber
 * die Umkehrung über `-cmp` wäre es ohne den Index-Tiebreak nicht).
 */
function sortRows(rows, col, dir) {
  if (!col) return rows;
  const keyed = rows.map((row, i) => ({
    row,
    i,
    key: col.sortValue ? col.sortValue(row) : null,
  }));
  keyed.sort((a, b) => {
    const aNull = a.key === null || a.key === undefined || a.key === "";
    const bNull = b.key === null || b.key === undefined || b.key === "";
    if (aNull && bNull) return a.i - b.i;
    if (aNull) return 1;
    if (bNull) return -1;
    const cmp =
      typeof a.key === "number" && typeof b.key === "number"
        ? a.key - b.key
        : String(a.key).localeCompare(String(b.key), "de");
    if (cmp === 0) return a.i - b.i;
    return dir === "desc" ? -cmp : cmp;
  });
  return keyed.map((x) => x.row);
}

/**
 * Richtungspfeil. Sichtbar nur an der aktiven Spalte; an der überfahrenen
 * blendet ihn `.hb-dt-th-btn:hover` halbtransparent ein (CSS).
 */
function SortArrow({ active, dir }) {
  const down = active && dir === "desc";
  return (
    <svg
      className={"hb-dt-sort-arrow" + (active ? " hb-dt-sort-arrow--active" : "")}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={down ? "M3 4.5L6 7.5L9 4.5" : "M3 7.5L6 4.5L9 7.5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Eine Zelle. Leere Werte bekommen ein „—" statt leer zu bleiben — sonst sieht
 * eine Position ohne Turnus aus wie ein Darstellungsfehler.
 */
function Cell({ col, row }) {
  const value = col.render(row);
  if (value === null || value === undefined || value === "") {
    return <span className="hb-dt-dash">—</span>;
  }
  return value;
}
