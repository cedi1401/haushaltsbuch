import React, { useMemo } from "react";
import { Card, CardContent, Button } from "../../components/ui.jsx";
import OverflowMenu from "../../components/OverflowMenu.jsx";
import { IconCheck, IconPlus } from "../../components/icons.jsx";
import { formatDateDE, formatPercent } from "../../utils/formatUtils.js";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from "./savingsColumns.jsx";

/**
 * Die aktiven Sparziele der Rücklagen-View als Karten unter der Tabelle.
 *
 * Bewusst getrennt von Rückstellungen und freien Rücklagen: Ein Sparziel ist
 * ein Wunsch, auf den man hinspart, keine Vorsorge für eine Rechnung — das soll
 * auf einen Blick erkennbar sein. Die Karten sind die der früheren
 * Sparziele-View; Status und Farben teilen sie mit der Tabelle.
 *
 * `goals` sind Zeilen aus `buildSavingsModel()` (`activeGoals`).
 */
export default function GoalCards({
  goals,
  potNameById,
  fmt,
  hasArchive,
  onCreate,
  onEdit,
  onComplete,
  onCompleteEarly,
  onDelete,
}) {
  // Nach Handlungsbedarf, dann nach Deadline; ohne Status („open") zuletzt.
  const sorted = useMemo(
    () =>
      [...goals].sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5) ||
          String(a.nextDate || "9999").localeCompare(String(b.nextDate || "9999"))
      ),
    [goals]
  );

  return (
    <section className="hb-goal-section">
      <div className="hb-row hb-goal-section-head">
        <div className="hb-title-group">
          <h3 className="hb-card-title">Sparziele</h3>
          {goals.length > 0 && (
            <span className="hb-info-pill hb-info-pill--title">
              {goals.length} {goals.length === 1 ? "Ziel" : "Ziele"}
            </span>
          )}
        </div>
        {goals.length > 0 && (
          <Button variant="outline" size="sm" onClick={onCreate}>
            <IconPlus /> Sparziel
          </Button>
        )}
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon">{hasArchive ? <IconCheck /> : <IconPlus />}</div>
              <div className="hb-empty-title">
                {hasArchive ? "Alle Ziele abgeschlossen" : "Noch keine Sparziele"}
              </div>
              <div className="hb-empty-text">
                {hasArchive
                  ? "Du hast aktuell keine aktiven Sparziele. Lege ein neues an oder sieh dir deine erreichten Ziele unten an."
                  : "Ein Sparziel ist ein Wunsch, auf den du hinsparst – mit Zielbetrag und auf Wunsch einem Termin."}
              </div>
              <Button onClick={onCreate}>
                <IconPlus /> Sparziel anlegen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="hb-two">
          {sorted.map((row) => (
            <GoalCard
              key={row.id}
              row={row}
              potName={potNameById.get(row.purpose?.potId)}
              fmt={fmt}
              onEdit={onEdit}
              onComplete={onComplete}
              onCompleteEarly={onCompleteEarly}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GoalCard({ row, potName, fmt, onEdit, onComplete, onCompleteEarly, onDelete }) {
  const { goalProgress: progress, prognosis: p, goal } = row;
  const name = row.purpose?.name ?? "";
  const reached = row.status === "reached";
  const statusLabel = STATUS_LABEL[row.status];

  const menu = [{ label: "Bearbeiten", onClick: () => onEdit(row) }];
  if (!reached) menu.push({ label: "Ziel vorzeitig abschließen", onClick: () => onCompleteEarly(row) });
  menu.push({ label: "Löschen", danger: true, onClick: () => onDelete(row.purpose) });

  return (
    // Spalte, damit die Erfolgszeile im gestreckten Grid unten sitzt.
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <CardContent style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="hb-goal-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="hb-goal-title">{name}</h3>
            <div className="hb-goal-badges">
              <span className="hb-goal-badge">Topf: {potName || "—"}</span>
              {goal.deadline && (
                <span className="hb-goal-badge hb-goal-badge--deadline">
                  Bis {formatDateDE(goal.deadline)}
                </span>
              )}
              {statusLabel && !reached && (
                <span className={`hb-badge hb-res-pill hb-res-pill--${STATUS_TONE[row.status]}`}>
                  {statusLabel}
                </span>
              )}
            </div>
          </div>
          <OverflowMenu
            label={`Aktionen für „${name}“`}
            buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
            items={menu}
          />
        </div>

        <div className="hb-goal-progress-header">
          <div className="hb-goal-amounts">
            <div className="hb-goal-amount-current">{fmt(progress.current)}</div>
            <div className="hb-goal-amount-target">von {fmt(progress.target)}</div>
          </div>
          <div className={"hb-goal-percent" + (reached ? " hb-goal-percent--done" : "")}>
            {formatPercent(progress.percent, { digits: 0, sign: false })}
          </div>
        </div>

        <div className="hb-meter hb-meter--lg hb-meter--animated hb-goal-progress-bg">
          <div
            className={"hb-meter-fill" + (progress.percent > 0 ? " hb-meter-fill--min" : "")}
            style={{ width: `${Math.min(progress.percent, 100)}%` }}
          />
        </div>

        {reached ? (
          <div className="hb-goal-success-wrap">
            <div className="hb-goal-success-row">
              <div className="hb-goal-success">Ziel erreicht! Herzlichen Glückwunsch!</div>
              <Button variant="outline" size="sm" onClick={() => onComplete(row)}>
                <IconCheck strokeWidth={3} /> Ziel abschließen
              </Button>
            </div>
          </div>
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
              <div className="hb-muted hb-muted--sm">
                Noch keine Einzahlungen — buche Transfers auf dieses Ziel, um eine Prognose zu
                erhalten.
              </div>
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
      </CardContent>
    </Card>
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
