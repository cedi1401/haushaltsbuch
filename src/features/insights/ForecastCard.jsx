import React, { memo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useThemeColors } from "../../hooks/useThemeColors.jsx";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

const ForecastCard = memo(function ForecastCard({ analytics }) {
  const fmt = useFmt();
  const {
    projectedTotal,
    projectedBalance,
    daysRemaining,
    burnRate,
    forecastData,
    trendVsPrevMonth,
    safeToSpendPerDay,
    contextMessage,
    hasMonth,
    isCurrentMonth,
  } = analytics;

  const themeColors = useThemeColors();

  if (!hasMonth) {
    return (
      <div className="hb-insights-pane hb-insights-pane--active hb-insight-placeholder">
        <span>Wähle einen Monat für die Prognose</span>
      </div>
    );
  }

  const trendSign = trendVsPrevMonth !== null && trendVsPrevMonth > 0 ? "+" : "";
  const trendClass =
    trendVsPrevMonth === null ? ""
    : trendVsPrevMonth > 0 ? "hb-trend-pill--up"
    : trendVsPrevMonth < 0 ? "hb-trend-pill--down"
    : "hb-trend-pill--flat";

  // Trennpunkt für ReferenceLine (letzter Ist-Tag)
  const lastActualDay = forecastData.findLast?.((d) => d.actual !== null)?.day
    ?? forecastData.filter((d) => d.actual !== null).slice(-1)[0]?.day;

  return (
    <div className="hb-insights-pane hb-insights-pane--active">
      {/* Hero: Monatsprognose */}
      <div className="hb-insight-section">
        <div className="hb-insight-label">
          {isCurrentMonth ? "Hochrechnung Monatsende" : "Monatsausgaben"}
        </div>
        <div className="hb-insight-hero hb-insight-kpi--bad">{fmt(projectedTotal)}</div>
        {trendVsPrevMonth !== null && (
          <div style={{ marginTop: 4 }}>
            <span className={`hb-trend-pill ${trendClass}`}>
              {trendSign}{fmt(Math.abs(trendVsPrevMonth))} vs. Vormonat
            </span>
          </div>
        )}
      </div>

      {/* Forecast Sparkline (kompakt) */}
      {forecastData.length > 0 && (
        <div style={{ height: 44, margin: "4px 0 12px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecastData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const val = payload[0]?.value ?? payload[1]?.value;
                  if (val == null) return null;
                  return (
                    <div className="hb-chart-tooltip">
                      <span className="hb-chart-tooltip-label">Tag {payload[0]?.payload?.day}</span>
                      <span>{fmt(val)}</span>
                    </div>
                  );
                }}
              />
              {isCurrentMonth && lastActualDay && (
                <ReferenceLine
                  x={lastActualDay}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
              )}
              <Line
                type="monotone"
                dataKey="actual"
                stroke={themeColors.accent}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="projected"
                stroke={themeColors.muted}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* KPI Grid */}
      <div className="hb-insight-kpi-grid">
        <div className="hb-insight-block">
          <div className="hb-insight-label">Erwarteter Saldo</div>
          <div className={`hb-insight-kpi ${projectedBalance >= 0 ? "hb-insight-kpi--good" : "hb-insight-kpi--bad"}`}>
            {fmt(projectedBalance)}
          </div>
        </div>

        <div className="hb-insight-block">
          <div className="hb-insight-label">Ø pro Tag</div>
          <div className="hb-insight-kpi hb-insight-kpi--bad">{fmt(burnRate)}</div>
        </div>

        {safeToSpendPerDay != null && (
          <div className="hb-insight-block">
            <div className="hb-insight-label">Verfügbar / Tag</div>
            <div className={`hb-insight-kpi ${safeToSpendPerDay > 0 ? "hb-insight-kpi--good" : "hb-insight-kpi--bad"}`}>
              {fmt(safeToSpendPerDay)}
            </div>
          </div>
        )}

        {isCurrentMonth && (
          <div className="hb-insight-block">
            <div className="hb-insight-label">Verbleibende Tage</div>
            <div className="hb-insight-kpi">{daysRemaining}</div>
          </div>
        )}
      </div>

      {/* Kontext-Satz */}
      {contextMessage && (
        <div className="hb-insight-context">{contextMessage}</div>
      )}
    </div>
  );
});

export default ForecastCard;
