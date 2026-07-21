import React, { memo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useThemeColors } from "../../hooks/useThemeColors.jsx";
import { useFmt, useBaseCurrency } from "../../contexts/CurrencyContext.jsx";
import { formatCurrencyAxis } from "../../utils/hbUtils.js";
import { IconInbox } from "../../components/icons.jsx";

const ForecastCard = memo(function ForecastCard({ analytics }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const {
    projectedBalance,
    freiBudget,
    sollPerDay,
    daysInMonth,
    burnRate,
    forecastData,
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

  const isPastMonth = !isCurrentMonth && !isFutureMonth;

  // Ampel-Status für das voraussichtliche/tatsächliche Frei.
  // Logik „erst ausgeben, dann fegen": ein positiver Rest ist der erwünschte
  // Überschuss (wird gespart) → grün; nur ein Minus ist schlecht → rot.
  // Schwellen relativ zum Frei-Budget.
  let heroState = null;
  if (!isFutureMonth && freiBudget > 0) {
    if (projectedBalance < -0.05 * freiBudget) heroState = "over";
    else if (projectedBalance > 0.1 * freiBudget) heroState = "surplus";
    else heroState = "good";
  }
  const heroLabel =
    heroState === "over" ? "überzogen"
    : heroState === "surplus" ? "Überschuss"
    : heroState === "good" ? "im Plan"
    : null;
  const heroClass =
    heroState === "over" ? "hb-insight-hero--over"
    : heroState === "good" || heroState === "surplus" ? "hb-insight-hero--good"
    : "";
  const pillClass =
    heroState === "over" ? "hb-trend-pill--over" : "hb-trend-pill--good";

  // Linienfarbe binär: landet die Prognose unter 0, kippt die Kurve ins Rote.
  const lineColor = projectedBalance < 0 ? themeColors.red : themeColors.green;

  // Trennpunkt für ReferenceLine (letzter Ist-Tag)
  const lastActualDay = forecastData.findLast?.((d) => d.actual !== null)?.day
    ?? forecastData.filter((d) => d.actual !== null).slice(-1)[0]?.day;

  const hasChartData =
    forecastData.length > 0 &&
    forecastData.some((d) => d.actual !== null || d.projected !== null);

  // Dezente Burn-Down-Fläche nur im nicht-überzogenen Fall (vermeidet Ausschläge unter 0)
  const showArea = projectedBalance >= 0;

  // Wochenweise X-Achsen-Ticks (Tag 1, 7, 14, … + letzter Tag)
  const xTicks = (() => {
    const len = forecastData.length;
    if (len === 0) return [1];
    const t = [1];
    for (let w = 7; w < len; w += 7) t.push(w);
    if (t[t.length - 1] !== len) t.push(len);
    return t;
  })();

  const heroLabelText =
    isCurrentMonth ? "Voraussichtliches Frei"
    : isPastMonth ? "Tatsächliches Frei"
    : "Geplantes Frei";

  return (
    <div className="hb-insights-pane hb-insights-pane--active hb-forecast-layout">
      {/* Hero: Frei am Monatsende — positiver Rest = Überschuss zum Sparen */}
      <div className="hb-insight-section">
        <div className="hb-insight-label">{heroLabelText}</div>
        <div className="hb-insight-hero-row">
          <div className={`hb-insight-hero ${heroClass}`}>{fmt(projectedBalance)}</div>
          {heroLabel && (
            <span className={`hb-trend-pill hb-trend-pill--lg ${pillClass}`}>
              {heroLabel}
            </span>
          )}
        </div>
      </div>

      {/* Burn-Down Chart */}
      <div className="hb-forecast-chart-wrap">
        {hasChartData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={forecastData} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid
                horizontal={true}
                vertical={false}
                stroke={themeColors.muted}
                strokeOpacity={0.15}
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
                tick={({ y, payload }) => (
                  <text x={0} y={y} dy="0.35em" textAnchor="start" fontSize={10} fill="var(--muted, #888)">
                    {formatCurrencyAxis(payload.value, baseCurrency)}
                  </text>
                )}
              />
              <Tooltip
                wrapperStyle={{ zIndex: 10 }}
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload;
                  if (!row) return null;
                  const isProj = row.actual == null;
                  const val = row.actual ?? row.projected;
                  if (val == null) return null;
                  const delta = val - row.soll;
                  return (
                    <div className="hb-chart-tooltip hb-chart-tooltip--col">
                      <span className="hb-chart-tooltip-label">Tag {row.day}</span>
                      <div className="hb-chart-tooltip-row">
                        <span className="hb-chart-tooltip-key">Frei{isProj ? " (Prognose)" : ""}</span>
                        <span>{fmt(val)}</span>
                      </div>
                      <div className="hb-chart-tooltip-row">
                        <span className="hb-chart-tooltip-key">Budget</span>
                        <span style={{ color: "var(--muted)" }}>{fmt(row.soll)}</span>
                      </div>
                      <div className="hb-chart-tooltip-row">
                        <span className="hb-chart-tooltip-key">{delta >= 0 ? "voraus" : "hinterher"}</span>
                        <span style={{ color: delta >= 0 ? "var(--green)" : "var(--red)" }}>
                          {delta >= 0 ? "+" : "−"}{fmt(Math.abs(delta))}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              {/* 0-Linie = Ziel */}
              <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="3 3" />
              {isCurrentMonth && lastActualDay && (
                <ReferenceLine x={lastActualDay} stroke="var(--border)" strokeDasharray="3 3" />
              )}
              {/* Soll-Pace (neutrale Referenz, linear auf 0) */}
              <Line
                type="monotone"
                dataKey="soll"
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              {/* Dezente Burn-Down-Fläche unter dem Ist-Verlauf */}
              {showArea && (
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="none"
                  fill={lineColor}
                  fillOpacity={0.06}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {/* Ist (solid) */}
              <Line
                type="monotone"
                dataKey="actual"
                stroke={lineColor}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {/* Prognose (gestrichelt, gleiche Hue) */}
              <Line
                type="monotone"
                dataKey="projected"
                stroke={lineColor}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              {/* Prognose-Endpunkt = Hero-Wert */}
              {isCurrentMonth && (
                <ReferenceDot
                  x={daysInMonth}
                  y={projectedBalance}
                  r={3}
                  fill={lineColor}
                  stroke="none"
                />
              )}
            </ComposedChart>
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
        {/* Block 1: Frei-Budget (Startwert des Burn-Downs) */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">Frei-Budget</div>
          <div className="hb-insight-kpi">{fmt(freiBudget)}</div>
        </div>

        {/* Block 2: Ø/Tag (Ist-Tempo) */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">Ø pro Tag</div>
          <div className="hb-insight-kpi">
            {isFutureMonth ? "–" : fmt(burnRate)}
          </div>
        </div>

        {/* Block 3: Soll/Tag (Soll-Tempo) oder Sparquote (vergangen) */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">
            {isPastMonth ? "Sparquote" : "Budget pro Tag"}
          </div>
          <div className="hb-insight-kpi">
            {isPastMonth
              ? (savingsRate != null ? `${savingsRate}%` : "–")
              : (isFutureMonth ? "–" : fmt(sollPerDay))
            }
          </div>
        </div>

        {/* Block 4: vs. Vormonat (aktuell + vergangen) oder Monatsdauer (Zukunft) */}
        <div className="hb-insight-block">
          <div className="hb-insight-label">
            {isFutureMonth ? "Verbleibende Tage" : "vs. Vormonat"}
          </div>
          <div className="hb-insight-kpi">
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
