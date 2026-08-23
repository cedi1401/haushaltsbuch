import React from "react";

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
 *     defaultVisible,           // Teil der Vorbelegung
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
export default function DataTable({ columns, sections }) {
  const visible = columns.filter((c) => c.defaultVisible);

  // Die Summenzeile liest alle Zeilen der Tabelle, nicht die einer Sektion —
  // sie beantwortet die Frage „wie viel muss insgesamt in den Töpfen liegen".
  const allRows = sections.flatMap((s) => s.rows);

  return (
    <div className="hb-dt">
      <div className="hb-dt-scroll">
        <table className="hb-dt-table">
          <thead>
            <tr>
              {visible.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={col.align === "right" ? "hb-dt-num" : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((section) => (
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
