import React from "react";
import { Button } from "../../components/ui.jsx";
import { IconCheck } from "../../components/icons.jsx";
import { formatDateDE } from "../../utils/formatUtils.js";
import { FactTile } from "./ReserveDetail.jsx";

// Ton des Detailbereichs je Ziel-Status — dieselben Stufen wie an der Pille.
const TONE = { reached: "onTrack", onTrack: "onTrack", offTrack: "behind", missed: "overdue" };

/**
 * Der aufklappbare Detailbereich eines Sparziels in der Sparen-View. Gleiches
 * Gerüst wie bei den Rückstellungen (ReserveDetail): links die abgewählten
 * Spalten als Kacheln, rechts die Prognose, darunter die Aktionen. Die
 * Prognose-Zeilen sind die der früheren Sparziel-Karten.
 */
export default function GoalDetail({ row, hiddenColumns, fmt, onComplete, onEdit }) {
  const { goalProgress: progress, prognosis: p, goal } = row;
  const facts = hiddenColumns.length;
  const tone = TONE[row.status];
  const cls = [
    "hb-res-detail",
    tone ? `hb-res-detail--${tone}` : null,
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
        <section className="hb-res-note hb-res-note--plain">
          <h4 className="hb-res-note-title">
            {row.status === "reached" ? "Ziel erreicht" : "Prognose"}
          </h4>
          {row.status === "reached" ? (
            <p className="hb-res-note-text">
              {fmt(progress.current)} von {fmt(progress.target)} liegen im Topf. Schließ das
              Ziel ab, um es ins Archiv zu legen — das Geld bleibt im Topf.
            </p>
          ) : (
            <div className="hb-goal-prognosis">
              <PrognosisRow label="Noch offen" value={fmt(progress.remaining)} />
              {p.avgMonthly > 0 ? (
                <>
                  <PrognosisRow label="Ø pro Monat" value={fmt(p.avgMonthly)} />
                  <PrognosisRow
                    label="Fertig in ca."
                    value={
                      p.monthsRemaining === Infinity
                        ? "unbekannt"
                        : `${p.monthsRemaining} Monat${p.monthsRemaining !== 1 ? "en" : ""}` +
                          (p.estimatedDate ? ` (${formatDateDE(p.estimatedDate)})` : "")
                    }
                  />
                </>
              ) : (
                <p className="hb-res-note-hint">
                  Noch keine Einzahlungen — buche Transfers auf dieses Ziel, um eine Prognose zu
                  erhalten.
                </p>
              )}
              {goal.deadline && !p.deadlinePassed && p.requiredMonthly != null && p.monthsToDeadline ? (
                <PrognosisRow
                  label="Nötig pro Monat"
                  value={`${fmt(p.requiredMonthly)} · noch ${p.monthsToDeadline} Monat${p.monthsToDeadline !== 1 ? "e" : ""}`}
                  tone={p.isAchievable ? null : "warn"}
                />
              ) : null}
            </div>
          )}
        </section>
      </div>

      <div className="hb-res-detail-actions">
        {row.status === "reached" && (
          <Button size="sm" onClick={() => onComplete?.(row)}>
            <IconCheck strokeWidth={3} /> Ziel abschließen
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onEdit?.(row)}>
          Bearbeiten
        </Button>
      </div>
    </div>
  );
}

function PrognosisRow({ label, value, tone }) {
  return (
    <div className="hb-goal-prognosis-row">
      <span className="hb-goal-prognosis-label">{label}</span>
      <span
        className={
          "hb-goal-prognosis-value" + (tone ? ` hb-goal-prognosis-value--${tone}` : "")
        }
      >
        {value}
      </span>
    </div>
  );
}
