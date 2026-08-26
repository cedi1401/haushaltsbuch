import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTableColumns } from "../hooks/useTableColumns.js";
import ColumnsFlyout from "./ColumnsFlyout.jsx";
import { IconChevron } from "./icons.jsx";

// Stabile Identität für den Ausgangszustand — ein Literal im useState-Aufruf
// wäre bei jedem Render ein neues Set.
const EMPTY_SET = new Set();

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
 *     maxWidth,                 // px ⇒ Text wird gedeckelt und mit … gekürzt
 *     alwaysVisible,            // true ⇒ im Flyout ausgegraut + angehakt
 *     defaultVisible,           // Teil der Vorbelegung (Ausgangszustand)
 *     sortValue: (row) => …,    // null sortiert immer ans Ende
 *     render: (row) => node,    // null/undefined/"" ⇒ „—"
 *     summarize: (rows) => node // fehlt ⇒ Summenzelle bleibt leer
 *   }
 *
 * Sektion (vom View vorbereitet):
 *   { key, label, accent, rows }         // rows brauchen je eine `id`
 *
 * `label === null` heißt: kein Gliederungsband. `accent` ist eine beliebige
 * CSS-Farbe (im Rücklagen-View eine var(--group-accent-N)) und färbt Punkt und
 * 3-px-Kante.
 *
 * `renderDetail(row, hiddenColumns)` ist optional. Wird es übergeben, bekommt
 * die Tabelle links eine Chevron-Spalte und jede Zeile lässt sich aufklappen;
 * fehlt es, gibt es die Spalte nicht. `hiddenColumns` sind die gerade
 * abgewählten Spalten in Katalogreihenfolge — der Detailbereich kann damit
 * genau das nachliefern, was in der Tabelle nicht steht, ohne dass der View die
 * Spaltenauswahl selbst kennen müsste.
 *
 * `label` wird zum `aria-label` der Tabelle. Ohne Beschriftung kündigt ein
 * Screenreader nur „Tabelle" an; ein <caption> wäre die Alternative, würde aber
 * die sichtbare Überschrift des Views doppeln.
 *
 * Bewusst nicht vorgesehen: Zeilen-Auswahl, Filter, Paginierung, onRowClick,
 * Dichte-Option, renderEmpty (Leerzustände liegen im View), getRowId.
 */
export default function DataTable({
  columns,
  sections,
  storageKey,
  defaultSort,
  renderDetail,
  label,
}) {
  const { visibleIds, toggle, reset } = useTableColumns(storageKey, columns);
  const visible = useMemo(() => {
    const chosen = new Set(visibleIds);
    return columns.filter((c) => chosen.has(c.id));
  }, [columns, visibleIds]);

  // Katalogreihenfolge, nicht Auswahlreihenfolge — der Detailbereich liest sich
  // dadurch immer gleich, egal in welcher Reihenfolge Spalten abgewählt wurden.
  const hiddenColumns = useMemo(() => {
    const chosen = new Set(visibleIds);
    return columns.filter((c) => !chosen.has(c.id));
  }, [columns, visibleIds]);

  // Mehrere Zeilen dürfen offen sein: ein Klick schließt nie etwas anderes,
  // und zwei Positionen lassen sich nebeneinander lesen.
  const [expanded, setExpanded] = useState(EMPTY_SET);
  function toggleDetail(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // Ein Klick irgendwo in der Zeile klappt auf — außer er galt einem
  // Bedienelement. Ohne diese Ausnahme schaltete der Chevron-Button zweimal
  // (einmal selbst, einmal über die Zeile) und bliebe damit wirkungslos, und
  // eine Aktion in einer Zelle klappte nebenbei den Detailbereich mit auf.
  function handleRowClick(e, id) {
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    // Wer einen Betrag mit der Maus markiert, lässt am Ende in der Zeile los —
    // das ist kein Klick auf die Zeile. Ein gewöhnlicher Klick hebt eine
    // bestehende Markierung vorher auf, die Prüfung greift also nur beim Ziehen.
    if (window.getSelection?.()?.toString()) return;
    toggleDetail(id);
  }

  // Die Chevron-Spalte zählt bei jedem colSpan mit (Band, Detailzeile).
  const colCount = visible.length + (renderDetail ? 1 : 0);

  const [sort, setSort] = useState(defaultSort ?? null);
  const sortCol = useMemo(
    () => (sort ? columns.find((c) => c.id === sort.columnId) : null) ?? null,
    [columns, sort]
  );

  // Erster Klick immer aufsteigend, zweiter absteigend — keine typabhängige
  // Startrichtung. Die wäre für eine Differenz-Spalte ohnehin nicht eindeutig:
  // der schlimmste Fall ist dort der kleinste Wert, nicht der größte.
  function toggleSort(id) {
    setSort((prev) =>
      prev?.columnId === id && prev.dir === "asc"
        ? { columnId: id, dir: "desc" }
        : { columnId: id, dir: "asc" }
    );
  }

  // Sortiert wird INNERHALB jeder Sektion — die Gliederung nach Gruppen ist die
  // äußere Ordnung und bleibt bestehen.
  const sortedSections = useMemo(
    () => sections.map((s) => ({ ...s, rows: sortRows(s.rows, sortCol, sort?.dir) })),
    [sections, sortCol, sort?.dir]
  );

  // Die Summenzeile liest alle Zeilen der Tabelle, nicht die einer Sektion —
  // sie beantwortet die Frage „wie viel muss insgesamt in den Töpfen liegen".
  const allRows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  const scrollRef = useScrollRoom();

  return (
    <div className="hb-dt">
      {/* Außerhalb von .hb-dt-scroll: innerhalb wanderte der Streifen beim
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
      <div className="hb-dt-scroll" ref={scrollRef}>
        <table
          className={"hb-dt-table" + (renderDetail ? " hb-dt-table--expandable" : "")}
          aria-label={label}
        >
          <thead>
            <tr>
              {renderDetail && <th scope="col" className="hb-dt-chevron-col" aria-label="Details" />}
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
            <tbody
              key={section.key}
              // Die Gruppenfarbe steht einmal an der Sektion statt an jeder
              // Zeile; die Kante an td:first-child liest sie von hier.
              style={section.accent ? { "--hb-dt-accent": section.accent } : undefined}
            >
              {section.label !== null && section.label !== undefined && (
                <tr className="hb-dt-band">
                  <td colSpan={colCount}>
                    <div className="hb-dt-band-inner">
                      {section.accent && (
                        <span className="hb-cat-dot" style={{ background: section.accent }} />
                      )}
                      <span className="hb-dt-band-name">{section.label}</span>
                      <span className="hb-dt-band-count">
                        {section.rows.length} Position{section.rows.length === 1 ? "" : "en"}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {section.rows.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={"hb-dt-row" + (isOpen ? " hb-dt-row--open" : "")}
                      onClick={renderDetail ? (e) => handleRowClick(e, row.id) : undefined}
                    >
                      {renderDetail && (
                        <td className="hb-dt-chevron-col">
                          <button
                            type="button"
                            className={"hb-dt-chevron" + (isOpen ? " hb-dt-chevron--open" : "")}
                            onClick={() => toggleDetail(row.id)}
                            aria-expanded={isOpen}
                            // Nur im offenen Zustand: aria-controls darf laut
                            // Spec nur auf ein Element zeigen, das es im DOM
                            // auch gibt — die Detailzeile wird zugeklappt
                            // ausgehängt, nicht versteckt.
                            aria-controls={isOpen ? `hb-dt-detail-${row.id}` : undefined}
                            aria-label={isOpen ? "Details zuklappen" : "Details aufklappen"}
                          >
                            <IconChevron />
                          </button>
                        </td>
                      )}
                      {visible.map((col) => (
                        <Cell key={col.id} col={col} row={row} />
                      ))}
                    </tr>
                    {isOpen && (
                      <tr className="hb-dt-detail-row" id={`hb-dt-detail-${row.id}`}>
                        <td colSpan={colCount}>{renderDetail(row, hiddenColumns)}</td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          ))}
          <tfoot>
            <tr className="hb-dt-summary">
              {renderDetail && <td className="hb-dt-chevron-col" />}
              {visible.map((col, i) => (
                <td
                  key={col.id}
                  // Die erste sichtbare Spalte trägt die Beschriftung der
                  // Summenzeile („N Positionen"), nicht einen Wert. Sie bekommt
                  // dafür eine eigene Klasse statt sich im CSS auf
                  // `td:first-child` zu verlassen: das ist bei aufklappbarer
                  // Tabelle die leere Chevron-Zelle, und die Beschriftung
                  // stünde dann fett zwischen den Summen.
                  className={
                    [col.align === "right" ? "hb-dt-num" : null, i === 0 ? "hb-dt-summary-label" : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
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
 * Misst, wie viel Fensterhöhe unterhalb der Oberkante des Scrollkastens noch
 * übrig ist, und legt das Ergebnis als `--hb-dt-room` auf dem Kasten ab. Das
 * CSS zieht davon `--hb-dt-gap` ab (was unter der Tabelle noch folgt) und macht
 * daraus die `max-height`.
 *
 * Warum überhaupt gemessen wird: Über der Tabelle stehen je nach Zustand
 * Toolbar-Streifen, Hinweisstreifen und Karten-Padding. Ein fester
 * `calc(100vh - X)` ist deshalb entweder zu groß — dann steht die Summenzeile
 * unter dem Fensterrand und die Seite bekommt eine zweite Bildlaufleiste neben
 * der des Kastens — oder zu klein, dann bleibt unter der Karte Luft und die
 * innere Leiste erscheint früher als nötig. Sitzt der Wert dagegen genau,
 * scrollt ausschließlich die Tabelle, und Kopf- wie Summenzeile bleiben
 * stehen: das ist der eigentliche Zweck von P6.3.
 *
 * Gemessen wird der Abstand zum *Dokumentanfang* (`+ scrollY`), nicht der
 * aktuelle Abstand zum Fensterrand — sonst schrumpfte der Kasten mit jedem
 * Scrollen weiter. `clientHeight` statt `innerHeight`, weil eine waagrechte
 * Bildlaufleiste des Dokuments (schmales Fenster, `.hb-page-container` hat
 * 1600 px Mindestbreite) sonst nicht abgezogen würde.
 *
 * Bewusst ohne ResizeObserver: Der Effekt läuft nach jedem Render und damit
 * auch dann, wenn der Hinweisstreifen des Views auf- oder zugeht; für alles
 * Übrige genügt `resize`. Der Vergleich mit dem zuletzt geschriebenen Wert
 * hält die Schreibzugriffe aus dem Layout-Pfad heraus.
 */
function useScrollRoom() {
  const ref = useRef(null);
  const lastRoom = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const room = Math.round(document.documentElement.clientHeight - top);
      if (room === lastRoom.current) return;
      lastRoom.current = room;
      el.style.setProperty("--hb-dt-room", `${room}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  return ref;
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
 *
 * `col.maxWidth` deckelt die Spalte. Nötig, weil alle Zellen `nowrap` tragen:
 * ohne Deckel dehnt ein einziger langer Wert die Tabelle über die Fensterbreite
 * hinaus, und dann verschwinden die rechten Spalten für ALLE Zeilen hinter der
 * waagrechten Bildlaufleiste. Der Deckel sitzt am inneren Block und nicht am
 * <td>: bei `table-layout: auto` ist eine max-width auf der Zelle für den
 * Browser nur ein Hinweis, den er zugunsten des Inhalts überstimmen darf.
 */
/**
 * Setzt den Tooltip einer gedeckelten Zelle — aber nur, wenn der Text wirklich
 * gekürzt ist. Ein pauschaler `title` ließe bei jedem kurzen Namen einen
 * Tooltip aufgehen, der nichts nachliefert, was nicht schon dasteht. Ob gekürzt
 * wurde, weiß erst das Layout, deshalb wird beim Überfahren gemessen.
 */
function setClampTitle(e) {
  const el = e.currentTarget;
  if (el.scrollWidth > el.clientWidth) el.title = el.textContent;
  else el.removeAttribute("title");
}

function Cell({ col, row }) {
  const value = col.render(row);
  const empty = value === null || value === undefined || value === "";
  const content = empty ? <span className="hb-dt-dash">—</span> : value;
  return (
    <td className={col.align === "right" ? "hb-dt-num" : undefined}>
      {col.maxWidth ? (
        <span
          className="hb-dt-clamp"
          style={{ maxWidth: col.maxWidth }}
          onMouseEnter={setClampTitle}
        >
          {content}
        </span>
      ) : (
        content
      )}
    </td>
  );
}
