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
 */
export default function ReserveDetail({
  row,
  hiddenColumns,
  fmt,
  pot,
  canCatchUp,
  onBillPaid,
  onEdit,
}) {
  const purpose = String(row.item?.transferCategory ?? "").trim();
  const potName = pot?.name ?? "—";
  const canPay = row.status === "due" || row.status === "overdue";

  return (
    <div className="hb-res-detail">
      {hiddenColumns.length > 0 && (
        <div className="hb-res-detail-grid">
          {hiddenColumns.map((col) => (
            <div key={col.id} className="hb-res-detail-item">
              <span className="hb-res-detail-label">{col.label}</span>
              <span className="hb-res-detail-value">
                <DetailValue col={col} row={row} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="hb-res-detail-block">
        {row.isSinkingFund ? (
          <>
            <div className="hb-res-detail-text">
              Zyklus seit {formatDateDE(row.cycleStart)} · {row.elapsed} von{" "}
              {row.turnusMonths} Monaten · nächste Fälligkeit {formatDateDE(row.nextDue)}
            </div>
            {/* Der Satz macht die bewusst einfache Reset-Regel transparent:
                jede Entnahme für diesen Zweck startet den Zyklus neu. Ohne ihn
                wäre ein „falscher" Zyklus nicht erklärbar — und nicht
                korrigierbar, weil unklar bliebe, woran er hängt. */}
            <div className="hb-res-detail-text">
              {row.anchorSource === "withdrawal"
                ? `Zyklusbeginn ist die jüngste Entnahme für diesen Zweck (${formatDateDE(row.lastPayment)}). Stimmt der Zyklus nicht, korrigiere diese Entnahme.`
                : "Für diesen Zweck ist noch keine Entnahme erfasst. Der Zyklusbeginn ist aus der nächsten Fälligkeit zurückgerechnet."}
            </div>
            <Assessment row={row} fmt={fmt} />
          </>
        ) : (
          <div className="hb-res-detail-text">
            Kein Turnus hinterlegt — freies Sparen. Es gibt keine Rechnung, keinen Zyklus
            und keinen Soll-Stand.
          </div>
        )}
      </div>

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
                `fliesst, der Trend, was es monatlich kostet.`
              }
            >
              Spartopf
            </span>
          )}
        </div>
      )}

      {/* Die Buttons liegen in einer klickbaren Zeile — `DataTable` lässt Klicks
          auf Bedienelemente bewusst durch, ohne den Bereich mit zuzuklappen. */}
      <div className="hb-res-detail-actions">
        {canPay && (
          <Button size="sm" onClick={() => onBillPaid?.(row)}>
            Rechnung bezahlt
          </Button>
        )}
        {canCatchUp && (
          <Button size="sm" variant="outline" disabled>
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
 * Der Bewertungssatz — er sagt in Worten, was die Differenz-Spalte als Zahl
 * zeigt. Innerhalb der Rundungstoleranz steht nichts: „0.00 über dem Soll" wäre
 * eine Aussage über Fliesskommareste, nicht über Geld.
 */
function Assessment({ row, fmt }) {
  if (row.delta === null) return null;
  if (row.delta < -row.tolerance) {
    const rates =
      row.monthlyRate > 0 ? ` — das entspricht ${formatRateCount(-row.delta / row.monthlyRate)}` : "";
    return <div className="hb-res-detail-text">Es fehlen {fmt(-row.delta)}{rates}.</div>;
  }
  if (row.delta > row.tolerance) {
    return (
      <div className="hb-res-detail-text">
        {fmt(row.delta)} über dem Soll-Stand. Der Überschuss stammt aus dem Vorzyklus oder
        aus einer manuell erfassten Buchung.
      </div>
    );
  }
  return null;
}

/**
 * Eine Zelle des Werte-Rasters. Gleiche Leer-Behandlung wie in der Tabelle —
 * ein fehlender Wert soll auch hier als „nichts hinterlegt" lesbar sein und
 * nicht als Darstellungsfehler.
 */
function DetailValue({ col, row }) {
  const value = col.render(row);
  if (value === null || value === undefined || value === "") {
    return <span className="hb-dt-dash">—</span>;
  }
  return value;
}
