import React from "react";
import { Button } from "../../components/ui.jsx";
import { formatDateDE } from "../../utils/hbUtils.js";
import { formatRateCount } from "./reserveFormat.js";

/**
 * Der aufklappbare Detailbereich einer Zeile im Rücklagen-View.
 *
 * Er löst drei Dinge auf einmal, die in einer Tabellenzelle keinen Platz haben:
 * die abgewählten Spalten, die Erklärung des Zyklus (wo der Anker herkommt) und
 * die beiden bedingt verfügbaren Aktionen. Eine Aktionsspalte, in der mal zwei,
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
  pot,
  canCatchUp,
  onBillPaid,
  onCatchUp,
  onEdit,
}) {
  const purpose = String(row.item?.transferCategory ?? "").trim();
  const potName = pot?.name ?? "—";
  const canPay = row.status === "due" || row.status === "overdue";
  const assessment = buildAssessment(row, fmt);

  // Zwei Zustände, die das Zonen-Raster kippen lassen: ohne abgewählte Spalten
  // gibt es keine linke Zone, mit sehr wenigen bekäme sie mehr Breite, als sie
  // füllen kann. Beides hängt an einer Zahl, die nur hier bekannt ist.
  // Der Status trägt zusätzlich den Ton — "free" schaltet dabei zugleich die
  // einspaltige Form, weil freies Sparen weder Zyklus noch Bewertung hat.
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
              {/* Der Satz macht die bewusst einfache Reset-Regel transparent:
                  jede Entnahme für diesen Zweck startet den Zyklus neu. Ohne ihn
                  wäre ein „falscher" Zyklus nicht erklärbar — und nicht
                  korrigierbar, weil unklar bliebe, woran er hängt. Er steht eine
                  Stufe kleiner als der Rest des Blocks: relevant, aber nicht
                  das, was beim Aufklappen zuerst gelesen werden soll. */}
              <p className="hb-res-note-hint">
                {row.anchorSource === "withdrawal"
                  ? `Zyklusbeginn ist die jüngste Entnahme für diesen Zweck (${formatDateDE(row.lastPayment)}). Stimmt der Zyklus nicht, korrigiere diese Entnahme.`
                  : "Für diesen Zweck ist noch keine Entnahme erfasst. Der Zyklusbeginn ist aus der nächsten Fälligkeit zurückgerechnet."}
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
            <h4 className="hb-res-note-title">Freies Sparen</h4>
            <p className="hb-res-note-text">
              Kein Turnus hinterlegt. Es gibt keine Rechnung, keinen Zyklus und keinen
              Soll-Stand.
            </p>
          </section>
        )}

        {(row.sharedPurpose || pot?.isSavings) && (
          <div className="hb-res-detail-hints">
            {row.sharedPurpose && (
              <span
                className="hb-badge hb-res-hint"
                title={
                  `Den Zweck „${purpose}" im Topf „${potName}" nutzen ${row.sharedWith + 1} Positionen. ` +
                  "Der Ist-Stand lässt sich nicht einzeln zuordnen — die Deckung wird deshalb " +
                  "gegen die Summe aller Soll-Stände dieses Zwecks gerechnet."
                }
              >
                Zweck geteilt
              </span>
            )}
            {pot?.isSavings && (
              <span
                className="hb-badge hb-res-hint"
                title={
                  `Der Topf „${potName}" ist als Spartopf markiert. Diese Rücklage erscheint ` +
                  `deshalb im Dashboard unter „Gespart" und gleichzeitig im Trend als ` +
                  `Fixkostenbelastung. Beides ist gewollt: Das Dashboard zeigt, wohin das Geld ` +
                  `fließt, der Trend, was es monatlich kostet.`
                }
              >
                Spartopf
              </span>
            )}
          </div>
        )}
      </div>

      {/* Die Buttons liegen in einer klickbaren Zeile — `DataTable` lässt Klicks
          auf Bedienelemente bewusst durch, ohne den Bereich mit zuzuklappen. */}
      <div className="hb-res-detail-actions">
        {canPay && (
          <Button size="sm" onClick={() => onBillPaid?.(row)}>
            Rechnung bezahlt
          </Button>
        )}
        {canCatchUp && (
          <Button size="sm" variant="outline" onClick={() => onCatchUp?.(row)}>
            Rückstand ausgleichen
          </Button>
        )}
        {/* Bearbeitet wird die Position dort, wo sie angelegt wurde. Ein zweiter
            Bearbeiten-Dialog neben dem der Fixkosten-View wäre eine zweite
            Wahrheit über dieselben Felder. */}
        <Button size="sm" variant="outline" onClick={() => onEdit?.()}>
          In Fixkosten bearbeiten
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
function FactTile({ col, row }) {
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
      className="hb-res-meter"
      role="img"
      aria-label={`${row.elapsed} von ${row.turnusMonths} Monaten des Zyklus vergangen`}
    >
      <span className="hb-res-meter-fill" style={{ width: `${done}%` }} />
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
