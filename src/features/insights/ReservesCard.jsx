import React, { memo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { useThemeColors } from "../../hooks/themeColors.js";
import { IconChevronRight, IconInbox } from "../../components/icons.jsx";
import { AlertBar } from "../../components/ui.jsx";
import { STATUS_LABEL } from "../savings/savingsColumns.jsx";
import { reservesAlertText } from "./insightAlerts.js";

// Reihenfolge nach Dringlichkeit — wie die Sortierung im Rücklagen-View.
const STATUS_ORDER = ["overdue", "behind", "due", "onTrack"];

/**
 * Insights-Tab „Rücklagen“ — wie stehen die Rückstellungen heute?
 *
 * `rows` sind die Rückstellungen aus `buildSavingsModel`, `counts` dessen
 * `kpis` (overdue, behind, due, onTrack).
 *
 * Gegenstück zum Budget-Tab: links ein Ring mit den Rückstellungen nach
 * Status, rechts dieselben vier Zahlen groß in der Statusfarbe, unten eine
 * Warnung bei Überfälligkeit (rot) oder Rückstand (gelb), die in den
 * Rücklagen-View führt. Freie Rücklagen und Sparziele zählen nicht mit: nur
 * Rückstellungen kennen diese vier Stufen. Der Status hängt am heutigen Tag,
 * nicht am Monatsfilter des Dashboards.
 */
const ReservesCard = memo(function ReservesCard({ rows, counts, onNavigateToSavings, onNavigateToFixed }) {
  const fmt = useFmt();
  const themeColors = useThemeColors();

  // Gezählt wird über die vier Stufen, nicht über die Zeilen: so passen Mitte
  // und Ring immer zusammen.
  const total = STATUS_ORDER.reduce((sum, s) => sum + (counts?.[s] || 0), 0);

  if (total === 0) {
    return (
      <div className="hb-insights-pane hb-insights-pane--active">
        <div className="hb-empty hb-empty--sm" style={{ flex: 1 }}>
          <div className="hb-empty-icon"><IconInbox /></div>
          <div className="hb-empty-title">Keine Rückstellungen</div>
          <div className="hb-empty-text">
            Lege in den Fixkosten eine Rückstellung für eine wiederkehrende Rechnung an.
          </div>
          {onNavigateToFixed && (
            <button type="button" className="hb-btn hb-btn-outline hb-budget-gauge-link" onClick={onNavigateToFixed}>
              Zu den Fixkosten <IconChevronRight />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Statuston aus dem Theme, nicht als CSS-Variable: Recharts setzt die
  // Farbe als SVG-Attribut, und dort greift var() nicht verlässlich.
  const statusColor = {
    overdue: themeColors.red,
    behind: themeColors.yellow,
    due: themeColors.accent,
    onTrack: themeColors.green,
  };
  const ringData = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({ key: s, value: counts[s] }));
  const headStatus = STATUS_ORDER.find((s) => counts[s] > 0);
  const alert = reservesAlertText(rows, fmt);

  return (
    <div className="hb-insights-pane hb-insights-pane--active hb-budget-insight">
      <div className="hb-budget-gauge-head">
        <span className="hb-insight-label">Stand heute</span>
        <span className={`hb-badge hb-res-pill hb-res-pill--${headStatus}`}>
          {headStatus === "onTrack" ? "Alles im Plan" : STATUS_LABEL[headStatus]}
        </span>
      </div>

      <div className="hb-budget-insight-body">
        <div className="hb-budget-insight-main">
          {/* Der Ring wiederholt nur die Liste daneben: für Screenreader stumm. */}
          <div className="hb-reserve-ring" aria-hidden="true">
            <ResponsiveContainer width="100%" aspect={1}>
              <PieChart>
                <Pie
                  data={ringData}
                  dataKey="value"
                  nameKey="key"
                  // Runde Ecken und Trennung über den Strich wie die übrigen
                  // Donuts. Die Ringstärke folgt dem Halbkreis der
                  // Budget-Card: dort ~34 px bei Mindestbreite des Fensters
                  // (Spalte ~340 px, Radius 182 % − 144 % von ~90 px); hier
                  // 31 % von 110 px.
                  innerRadius="65%"
                  outerRadius="96%"
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={0}
                  cornerRadius={4}
                  stroke={themeColors.card}
                  strokeWidth={ringData.length > 1 ? 3 : 0}
                  strokeLinejoin="round"
                  animationBegin={0}
                  animationDuration={1350}
                >
                  {ringData.map((d) => (
                    <Cell key={d.key} fill={statusColor[d.key]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="hb-pie-center-overlay">
              <div className="hb-budget-gauge-value">{total}</div>
              <div className="hb-budget-gauge-sub">
                {total === 1 ? "Rückstellung" : "Rückstellungen"}
              </div>
            </div>
          </div>

          {/* Alle vier Stufen stehen immer da, leere gedimmt: das Bild bleibt
              stabil, und „0 Überfällig“ ist selbst eine Aussage. */}
          <ul className="hb-reserve-counts" aria-label="Rückstellungen nach Status">
            {STATUS_ORDER.map((s) => (
              <li
                key={s}
                className={`hb-reserve-count hb-reserve-count--${s}${counts[s] === 0 ? " is-zero" : ""}`}
              >
                <span className="hb-reserve-count-label">
                  <span className="hb-reserve-count-dot" aria-hidden="true" />
                  {STATUS_LABEL[s]}
                </span>
                <span className="hb-reserve-count-value">{counts[s]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Die Warnung führt selbst in den Rücklagen-View, dann entfällt der Button. */}
      <div className="hb-budget-gauge-foot">
        {alert ? (
          <AlertBar
            title={alert.title}
            message={alert.message}
            tone={alert.tone}
            onClick={onNavigateToSavings}
            ariaLabel={`${alert.title}: ${alert.message}. Zu den Rücklagen`}
          />
        ) : onNavigateToSavings ? (
          <button type="button" className="hb-btn hb-btn-outline hb-budget-gauge-link" onClick={onNavigateToSavings}>
            Zu den Rücklagen <IconChevronRight />
          </button>
        ) : null}
      </div>
    </div>
  );
});

export default ReservesCard;
