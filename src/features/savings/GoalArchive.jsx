import React, { useState } from "react";
import { Card, CardContent } from "../../components/ui.jsx";
import OverflowMenu from "../../components/OverflowMenu.jsx";
import { IconChevron } from "../../components/icons.jsx";
import { formatDateDE } from "../../utils/formatUtils.js";

function formatPeriod(arch) {
  if (!arch) return "—";
  if (arch.durationMonths != null && arch.durationMonths >= 1) {
    return `${arch.durationMonths} Monat${arch.durationMonths !== 1 ? "e" : ""}`;
  }
  if (arch.durationDays != null) {
    return `${arch.durationDays} Tag${arch.durationDays !== 1 ? "e" : ""}`;
  }
  return "—";
}

function deadlineLabel(delta) {
  if (delta == null) return null;
  if (delta > 0) return `${delta} Tag${delta !== 1 ? "e" : ""} vor Deadline`;
  if (delta === 0) return "Pünktlich zur Deadline";
  const abs = Math.abs(delta);
  return `${abs} Tag${abs !== 1 ? "e" : ""} nach Deadline`;
}

/**
 * Archiv der abgeschlossenen Sparziele unter den Sparziel-Karten. Standardmäßig
 * zugeklappt: Es ist Rückschau, nicht Planung. Die Karten sind die der früheren
 * Sparziele-View (bis 7c).
 */
export default function GoalArchive({ goals, potNameById, fmt, onReactivate, onDelete }) {
  const [open, setOpen] = useState(false);
  if (goals.length === 0) return null;

  return (
    <div className="hb-goal-archive">
      <button
        type="button"
        className="hb-goal-archive-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={"hb-dt-chevron" + (open ? " hb-dt-chevron--open" : "")} aria-hidden="true">
          <IconChevron />
        </span>
        <span className="hb-card-title">Abgeschlossene Sparziele</span>
        <span className="hb-info-pill hb-info-pill--title">
          {goals.length} {goals.length === 1 ? "Ziel" : "Ziele"}
        </span>
      </button>

      {open && (
        <div className="hb-two">
          {goals.map((goal) => {
            const arch = goal.archive;
            const dl = deadlineLabel(arch?.deadlineDelta);
            return (
              <Card key={goal.id} className="hb-goal-card--archived">
                <CardContent>
                  <div className="hb-goal-header">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 className="hb-goal-title">{goal.name}</h3>
                      <div className="hb-goal-badges">
                        <span className="hb-goal-badge hb-goal-badge--done">
                          Erreicht am {formatDateDE(goal.completedAt)}
                        </span>
                        <span className="hb-goal-badge">Topf: {potNameById.get(goal.potId) || "—"}</span>
                      </div>
                    </div>
                    <OverflowMenu
                      label={`Aktionen für „${goal.name}“`}
                      buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                      items={[
                        { label: "Wieder aktivieren", onClick: () => onReactivate(goal) },
                        { label: "Löschen", danger: true, onClick: () => onDelete(goal) },
                      ]}
                    />
                  </div>

                  <div className="hb-goal-archive-stats">
                    <div className="hb-goal-archive-stat">
                      <span className="hb-goal-archive-stat-label">Angespart</span>
                      <span className="hb-goal-archive-stat-value">
                        {fmt(arch?.savedAmount ?? 0)}
                        <span className="hb-muted" style={{ fontWeight: "var(--fw-medium)" }}>
                          {" "}von {fmt(arch?.target ?? 0)}
                        </span>
                      </span>
                    </div>
                    <div className="hb-goal-archive-stat">
                      <span className="hb-goal-archive-stat-label">Sparzeitraum</span>
                      <span className="hb-goal-archive-stat-value">{formatPeriod(arch)}</span>
                    </div>
                    <div className="hb-goal-archive-stat">
                      <span className="hb-goal-archive-stat-label">Ø pro Monat</span>
                      <span className="hb-goal-archive-stat-value">{fmt(arch?.avgMonthly ?? 0)}</span>
                    </div>
                    <div className="hb-goal-archive-stat">
                      <span className="hb-goal-archive-stat-label">Einzahlungen</span>
                      <span className="hb-goal-archive-stat-value">{arch?.depositCount ?? 0}</span>
                    </div>
                    {dl && (
                      <div className="hb-goal-archive-stat">
                        <span className="hb-goal-archive-stat-label">Deadline</span>
                        <span
                          className={`hb-goal-archive-stat-value ${
                            arch.deadlineDelta >= 0 ? "hb-ok" : "hb-bad"
                          }`}
                        >
                          {dl}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
