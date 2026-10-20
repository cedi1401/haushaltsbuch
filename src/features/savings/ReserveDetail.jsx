import React from "react";
import { Button } from "../../components/ui.jsx";
import { formatDateDE } from "../../utils/formatUtils.js";
import { formatRateCount } from "./reserveFormat.js";

/**
 * Der aufklappbare Detailbereich einer Rückstellung oder freien Rücklage in der
 * Rücklagen-View.
 *
 * Er löst drei Dinge auf einmal, die in einer Tabellenzelle keinen Platz haben:
 * die abgewählten Spalten, die Erklärung des Zyklus (wo der Anker herkommt) und
 * die bedingt verfügbaren Aktionen. Eine Aktionsspalte, in der mal zwei,
 * mal ein, mal kein Button steht, wäre unruhig und kostete dauerhaft Breite.
 *
 * `hiddenColumns` liefert `DataTable` — der Bereich zeigt damit genau das, was
 * gerade nicht in der Tabelle steht, ohne die Spaltenauswahl selbst zu kennen.
 *
 * Layout sind drei Zonen über die volle Tabellenbreite: Zahlen links, Worte
 * rechts, Handeln unten. Nebeneinander statt gestapelt, weil der Streifen
 * gestapelt rund dreimal so hoch würde und bei mehreren offenen Zeilen den
 * Tabellen-Scroll dominierte.
 */
export default function ReserveDetail({
  row,
  hiddenColumns,
  fmt,
  canCatchUp,
  canRevertCatchUp,
  canTopUp,
  onBillPaid,
  onCatchUp,
  onTopUp,
  onRevertCatchUp,
  onEdit,
}) {
  const canPay = row.status === "due" || row.status === "overdue";
  const assessment = buildAssessment(row, fmt);

  // Zwei Zustände, die das Zonen-Raster kippen lassen: ohne abgewählte Spalten
  // gibt es keine linke Zone, mit sehr wenigen bekäme sie mehr Breite, als sie
  // füllen kann. Beides hängt an einer Zahl, die nur hier bekannt ist.
  // Der Status trägt zusätzlich den Ton — "free" schaltet dabei zugleich die
  // einspaltige Form, weil eine freie Rücklage weder Zyklus noch Bewertung hat.
  const facts = hiddenColumns.length;
  const cls = [
    "hb-res-detail",
    `hb-res-detail--${row.status}`,
    facts === 0 ? "hb-res-detail--nofacts" : facts <= 3 ? "hb-res-detail--sparse" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {facts > 0 && (
        <div className="hb-res-facts">
          {hiddenColumns.map((col) => (
            <FactTile key={col.id} col={col} row={row} />
          ))}
        </div>
      )}

      <div className="hb-res-side">
        {row.isSinkingFund ? (
          <>
            <section className="hb-res-note hb-res-note--plain">
              <h4 className="hb-res-note-title">Zyklus</h4>
              <CycleMeter row={row} />
              <p className="hb-res-note-text">
                Seit {formatDateDE(row.cycleStart)} · {row.elapsed} von {row.turnusMonths}{" "}
                Monaten · nächste Fälligkeit {formatDateDE(row.nextDue)}
              </p>
              {/* Der Satz macht die Zyklusregel transparent: Die Fälligkeit ist
                  ein dauerhaftes Raster, die Entnahme sagt nur, welcher Termin
                  davon bezahlt ist. Ohne ihn wäre ein „falscher" Zyklus nicht
                  erklärbar — und nicht korrigierbar, weil unklar bliebe, woran
                  er hängt. Er steht eine Stufe kleiner als der Rest des Blocks:
                  relevant, aber nicht das, was beim Aufklappen zuerst gelesen
                  werden soll. */}
              <p className="hb-res-note-hint">
                {row.anchorSource === "withdrawal"
                  ? `Die Entnahme vom ${formatDateDE(row.lastPayment)} hat den Zyklus davor abgeschlossen. Der Rhythmus bleibt an der hinterlegten Fälligkeit — verschiebt der Rechnungssteller ihn dauerhaft, passe die Fälligkeit der Sparposition an.`
                  : "Für diese Sparposition ist noch keine Entnahme erfasst. Der Zyklusbeginn ist aus der nächsten Fälligkeit zurückgerechnet."}
              </p>
            </section>

            {assessment && (
              <section className="hb-res-note hb-res-note--tone">
                <h4 className="hb-res-note-title">{assessment.title}</h4>
                <p className="hb-res-note-text">{assessment.text}</p>
              </section>
            )}
          </>
        ) : (
          <section className="hb-res-note hb-res-note--plain">
            <h4 className="hb-res-note-title">Freie Rücklage</h4>
            <p className="hb-res-note-text">
              Freies Sparen ohne Turnus: keine Rechnung, kein Zyklus, kein Soll-Stand. Der
              monatliche Betrag geht in den Topf und bleibt dort, bis du ihn brauchst.
            </p>
            <p className="hb-res-note-hint">
              Steht hinter dem Geld doch eine Rechnung zu einem festen Termin, stell die Art
              auf Rückstellung um — dann bewertet diese Ansicht den Sparstand.
            </p>
          </section>
        )}
      </div>

      {/* Die Buttons liegen in einer klickbaren Zeile — `DataTable` lässt Klicks
          auf Bedienelemente bewusst durch, ohne den Bereich mit zuzuklappen. */}
      <div className="hb-res-detail-actions">
        {canPay && (
          <Button onClick={() => onBillPaid?.(row)}>
            Rechnung bezahlt
          </Button>
        )}
        {canCatchUp && (
          <Button variant="outline" onClick={() => onCatchUp?.(row)}>
            Raten nachbuchen
          </Button>
        )}
        {canTopUp && (
          <Button variant="outline" onClick={() => onTopUp?.(row)}>
            Rückstand ausgleichen
          </Button>
        )}
        {canRevertCatchUp && (
          <Button variant="outline" onClick={() => onRevertCatchUp?.(row)}>
            Nachbuchung zurücknehmen
          </Button>
        )}
        <Button variant="outline" onClick={() => onEdit?.(row)}>
          Bearbeiten
        </Button>
      </div>
    </div>
  );
}

/**
 * Eine Faktenkachel. Gleiche Leer-Behandlung wie in der Tabelle — ein fehlender
 * Wert soll als „nichts hinterlegt" lesbar sein und nicht als
 * Darstellungsfehler. Neu ist nur, dass die leere Kachel ihre Füllfläche
 * verliert: bei freiem Sparen liefern bis zu sieben Spalten „—", die sonst
 * gleichberechtigt neben denen stünden, die etwas sagen.
 */
export function FactTile({ col, row }) {
  const value = col.render(row);
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={"hb-res-fact" + (empty ? " hb-res-fact--empty" : "")}>
      <span className="hb-res-fact-label">{col.label}</span>
      <span className="hb-res-fact-value">
        {empty ? <span className="hb-dt-dash">—</span> : value}
      </span>
    </div>
  );
}

/**
 * Zeitfortschritt im Zyklus als Meter. Er zeigt dieselbe Zahl wie der Satz
 * darunter („8 von 12 Monaten") — als Länge statt als Ziffer, damit die Lage im
 * Zyklus ohne Rechnen ablesbar ist. Die Füllung trägt den Statuston: derselbe
 * Balken sagt damit „wie weit" und „wie gut" zugleich.
 */
function CycleMeter({ row }) {
  if (!row.turnusMonths) return null;
  const done = Math.max(0, Math.min(1, row.elapsed / row.turnusMonths)) * 100;
  return (
    <span
      className="hb-meter hb-meter--tinted hb-res-meter"
      role="img"
      aria-label={`${row.elapsed} von ${row.turnusMonths} Monaten des Zyklus vergangen`}
    >
      <span className="hb-meter-fill" style={{ width: `${done}%` }} />
    </span>
  );
}

/**
 * Der Bewertungssatz — er sagt in Worten, was die Differenz-Spalte als Zahl
 * zeigt, und liefert dazu das Titelwort, das die Tönung des Blocks redundant
 * kodiert. Innerhalb der Rundungstoleranz steht nichts: „0.00 über dem Soll"
 * wäre eine Aussage über Fließkommareste, nicht über Geld — dann bleibt der
 * Zyklusblock allein stehen.
 */
function buildAssessment(row, fmt) {
  if (!row.isSinkingFund || row.delta === null) return null;
  if (row.delta < -row.tolerance) {
    const rates =
      row.monthlyRate > 0 ? ` — das entspricht ${formatRateCount(-row.delta / row.monthlyRate)}` : "";
    return { title: "Rückstand", text: `Es fehlen ${fmt(-row.delta)}${rates}.` };
  }
  if (row.delta > row.tolerance) {
    return {
      title: "Überschuss",
      text: `${fmt(row.delta)} über dem Soll-Stand. Der Überschuss stammt aus dem Vorzyklus oder aus einer manuell erfassten Buchung.`,
    };
  }
  return null;
}
