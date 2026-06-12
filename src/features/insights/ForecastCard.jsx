import React, { memo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useThemeColors } from "../../hooks/useThemeColors.jsx";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconInbox } from "../../components/icons.jsx";

const ForecastCard = memo(function ForecastCard({ analytics }) {
  const fmt = useFmt();
  const {
    projectedTotal,
    projectedBalance,
    daysRemaining,
    daysInMonth,
    burnRate,
    forecastData,
    trendVsPrevMonth,
    safeToSpendPerDay,
    hasMonth,
    isCurrentMonth,
    isFutureMonth,
    savingsRate,
    trendVsPrevMonthPct,
  } = analytics;

  const themeColors = useThemeColors();

  if (!hasMonth) {
    return (
      <div className="hb-insights-pane hb-insights-pane--active hb-insight-placeholder" style={{ justifyContent: "center" }}>
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

  const isPastMonth = !isCurrentMonth && !isFutureMonth;
  const hasChartData =
    forecastData.length > 0 &&
    forecastData.some((d) => d.actual !== null || d.projected !== null);

  // Wochenweise X-Achsen-Ticks (Tag 1, 7, 14, … + letzter Tag)
  const xTicks = (() => {
    const len = forecastData.length;
    if (len === 0) return [1];
    const t = [1];
    for (let w = 7; w < len; w += 7) t.push(w);
    if (t[t.length - 1] !== len) t.push(len);
    return t;
  })();

  return (
    <div className="hb-insights-pane hb-insights-pane--active hb-forecast-layout">
      {/* Hero: Monatsprognose */}
      <div className="hb-insight-section">
        <div className="hb-insight-label">
          {isCurrentMonth ? "Hochrechnung Monatsende" : "Monatsausgaben"}
        </div>
        <div className="hb-insight-hero-row">
          <div className="hb-insight-hero hb-insight-kpi--bad">{fmt(projectedTotal)}</div>
          {trendVsPrevMonth !== null && (
            <span className={`hb-trend-pill hb-trend-pill--lg ${trendClass}`}>
              {trendSign}{fmt(Math.abs(trendVsPrevMonth))} vs. Vormonat
            </span>
          )}
        </div>
      </div>

      {/* Forecast Chart */}
      <div className="hb-forecast-chart-wrap">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecastData} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid
                horizontal={true}
                vertical={false}
                stroke="var(--border-light)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="day"
                type="number"
                domain={[1, forecastData.length]}
                ticks={xTicks}
                tickFormatter={(v) => `${v}`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--muted, #888)" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={54}
                tickCount={5}
                allowDecimals={false}
                tick={({ x, y, payload }) => (
                  <text x={0} y={y} dy="0.35em" textAnchor="start" fontSize={10} fill="var(--muted, #888)">
                    {Math.round(payload.value).toLocaleString("de-CH")}
                  </text>
                )}
              />
              <Tooltip
                wrapperStyle={{ zIndex: 10 }}
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
                <ReferenceLine x={lastActualDay} stroke="var(--border)" strokeDasharray="3 3" />
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
        ) : (
          <div className="hb-forecast-chart-empty">
            <div className="hb-empty hb-empty--sm">
              <div className="hb-empty-icon"><IconInbox /></div>
              <div className="hb-empty-title">
                {isFutureMonth ? "Keine Daten" : "Keine Ausgaben"}
              </div>
              <div className="hb-empty-text">
                {isFutureMonth
                  ? "Für diesen Monat liegen noch keine Einträge vor."
                  : "Für diesen Monat wurden keine Ausgaben erfasst."}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI Grid — immer exakt 4 Blöcke */}
      <div className="hb-insight-kpi-grid">
        {/* Block 1: Saldo */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">
            {isPastMonth ? "Tatsächliches Frei" : "Erwartetes Frei"}
          </div>
          <div className={`hb-insight-kpi ${projectedBalance >= 0 ? "hb-insight-kpi--good" : "hb-insight-kpi--bad"}`}>
            {fmt(projectedBalance)}
          </div>
        </div>

        {/* Block 2: Ø/Tag */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">Ø pro Tag</div>
          <div className="hb-insight-kpi hb-insight-kpi--bad">
            {isFutureMonth ? "–" : fmt(burnRate)}
          </div>
        </div>

        {/* Block 3: Verfügbar/Tag oder Sparquote */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">
            {isPastMonth ? "Sparquote" : "Verfügbar / Tag"}
          </div>
          <div className={`hb-insight-kpi ${
            isPastMonth
              ? (savingsRate != null && savingsRate >= 0 ? "hb-insight-kpi--good" : "hb-insight-kpi--bad")
              : (safeToSpendPerDay != null && safeToSpendPerDay > 0 ? "hb-insight-kpi--good" : "hb-insight-kpi--bad")
          }`}>
            {isPastMonth
              ? (savingsRate != null ? `${savingsRate}%` : "–")
              : (isFutureMonth ? "–" : (safeToSpendPerDay != null ? fmt(safeToSpendPerDay) : "–"))
            }
          </div>
        </div>

        {/* Block 4: vs. Vormonat (aktuell + vergangen) oder Monatsdauer (Zukunft) */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">
            {isFutureMonth ? "Verbleibende Tage" : "vs. Vormonat"}
          </div>
          <div className={`hb-insight-kpi ${
            !isFutureMonth
              ? (trendVsPrevMonthPct != null && trendVsPrevMonthPct < 0
                  ? "hb-insight-kpi--good"
                  : trendVsPrevMonthPct != null && trendVsPrevMonthPct > 0
                    ? "hb-insight-kpi--bad"
                    : "")
              : ""
          }`}>
            {isFutureMonth
              ? (daysInMonth ?? "–")
              : (trendVsPrevMonthPct != null ? `${trendVsPrevMonthPct > 0 ? "+" : ""}${trendVsPrevMonthPct}%` : "–")
            }
          </div>
        </div>
      </div>
    </div>
  );
});

export default ForecastCard;
