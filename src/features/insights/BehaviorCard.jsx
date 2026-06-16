import React, { memo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  YAxis,
  XAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useThemeColors } from "../../hooks/useThemeColors.jsx";
import { formatDateDELong } from "../../utils/hbUtils.js";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconInbox } from "../../components/icons.jsx";

function Kpi({ label, value, sub }) {
  return (
    <div className="hb-behavior-kpi">
      <div className="hb-insight-label">{label}</div>
      <div className="hb-behavior-kpi-val">{value}</div>
      <div className="hb-behavior-kpi-sub">{sub || " "}</div>
    </div>
  );
}


const BehaviorCard = memo(function BehaviorCard({ analytics }) {
  const fmt = useFmt();
  const {
    dailySpendData,
    mostActiveDay,
    avgBookingsPerDay,
    topCategory,
    topCategoryPct,
    totalBookings,
    prevAvgBookingsPerDay,
    prevTotalBookings,
    thirtyDayData,
    dailyTrendPct,
  } = analytics;

  const [trendTooltipVisible, setTrendTooltipVisible] = useState(false);
  const themeColors = useThemeColors();
  const hasBarData = dailySpendData.some((d) => d.count > 0);
  const hasAreaData = thirtyDayData.some((d) => d.amount > 0);
  const maxCount = Math.max(...dailySpendData.map((d) => d.count), 1);
  const avgAmount = thirtyDayData.reduce((s, d) => s + d.amount, 0) / 30;
  const maxAmount = Math.max(...thirtyDayData.map((d) => d.amount), 10);
  const areaStep = Math.max(10, Math.ceil(maxAmount / 4 / 10) * 10);
  const areaYMax = Math.ceil(maxAmount / areaStep) * areaStep;
  const areaTicks = Array.from({ length: Math.floor(areaYMax / areaStep) + 1 }, (_, i) => i * areaStep);

  return (
    <div className="hb-insights-pane hb-insights-pane--active">
      <div className="hb-behavior-layout">
        {/* Obere Hälfte: zwei Charts nebeneinander */}
        <div className="hb-behavior-charts">
          {/* Links: Vertikale Balken Mo→So */}
          <div className="hb-behavior-bars">
            <div className="hb-insight-label" style={{ marginBottom: 6 }}>Buchungsverteilung</div>
            <div style={{ flex: 1, minHeight: 120, display: "flex" }}>
              {!hasBarData ? (
                <div className="hb-behavior-chart-empty">
                  <div className="hb-empty-icon"><IconInbox /></div>
                  <div className="hb-empty-text">Keine Buchungen erfasst</div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailySpendData}
                  barSize={18}
                  margin={{ top: 2, right: 4, bottom: 0, left: -8 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border-light)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: themeColors.muted }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickCount={4}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                    tick={{ fontSize: 10, fill: themeColors.muted }}
                  />
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    cursor={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      if (!d.count) return null;
                      return (
                        <div className="hb-chart-tooltip">
                          <span className="hb-chart-tooltip-label">{d.day}</span>
                          <span>{d.count} Buchung{d.count !== 1 ? "en" : ""}</span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {dailySpendData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={themeColors.accent}
                        opacity={entry.count > 0 ? 0.35 + 0.65 * (entry.count / maxCount) : 0.12}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="hb-behavior-divider" />

          {/* Rechts: 30-Tage Area Sparkline */}
          <div className="hb-behavior-sparkline">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span className="hb-insight-label">Letzte 30 Tage</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                {hasAreaData && (
                  <span className="hb-insight-label" style={{ fontSize: 11 }}>
                   --- Ø {fmt ? fmt(Math.round(avgAmount), 0) : Math.round(avgAmount)} pro Tag
                  </span>
                )}
                {dailyTrendPct !== null && (
                  <span
                    style={{ position: "relative", cursor: "default" }}
                    onMouseEnter={() => setTrendTooltipVisible(true)}
                    onMouseLeave={() => setTrendTooltipVisible(false)}
                  >
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: dailyTrendPct > 0 ? themeColors.red : dailyTrendPct < 0 ? themeColors.green : themeColors.muted,
                    }}>
                      {dailyTrendPct > 0 ? "+" : ""}{Math.round(dailyTrendPct)}%
                    </span>
                    {trendTooltipVisible && (
                      <div style={{
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 6px)",
                        width: 220,
                        background: "var(--card)",
                        border: "1px solid var(--border, #e0e0e0)",
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 12,
                        color: "var(--text, #1a1a1a)",
                        lineHeight: 1.5,
                        zIndex: 10,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        pointerEvents: "none",
                      }}>
                        Vergleicht den Tagesdurchschnitt der <strong>letzten 15 Tage</strong> mit den <strong>15 Tagen davor</strong>. Ein positiver Wert bedeutet, die Ausgaben steigen tendenziell; ein negativer Wert, dass sie sinken.
                      </div>
                    )}
                  </span>
                )}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 70, display: "flex" }}>
              {!hasAreaData ? (
                <div className="hb-behavior-chart-empty">
                  <div className="hb-empty-icon"><IconInbox /></div>
                  <div className="hb-empty-text">Keine Ausgaben in den letzten 30 Tagen</div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={thirtyDayData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid
                    horizontal={true}
                    vertical={false}
                    stroke="var(--border-light)"
                    strokeDasharray="3 3"
                  />
                  <YAxis
                    ticks={areaTicks}
                    domain={[0, areaYMax]}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                    tick={{ fontSize: 10, fill: themeColors.muted }}
                  />
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    cursor={{ stroke: themeColors.accent, strokeWidth: 1, strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="hb-chart-tooltip">
                          <span className="hb-chart-tooltip-label">{formatDateDELong(d.date)}</span>
                          <span>{fmt ? fmt(d.amount) : d.amount.toFixed(2)}</span>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={avgAmount}
                    stroke={themeColors.muted}
                    strokeDasharray="4 3"
                    strokeWidth={1}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke={themeColors.accent}
                    fill={themeColors.accent}
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
            {hasAreaData && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span className="hb-insight-label" style={{ fontSize: 10 }}>vor 30 Tagen</span>
                <span className="hb-insight-label" style={{ fontSize: 10 }}>Ausgaben pro Tag</span>
                <span className="hb-insight-label" style={{ fontSize: 10 }}>heute</span>
              </div>
            )}
          </div>
        </div>

        {/* Unteres 1/3: KPIs auf voller Breite */}
        <div className="hb-behavior-kpis">
          <Kpi label="Aktivster Tag" value={mostActiveDay} />
          <Kpi
            label="Buchungen"
            value={totalBookings}
            sub={prevTotalBookings > 0 ? `${prevTotalBookings} letzter Monat` : null}
          />
          <Kpi
            label="Ø pro Tag"
            value={avgBookingsPerDay.toFixed(1)}
            sub={prevAvgBookingsPerDay != null
              ? `${prevAvgBookingsPerDay.toFixed(1)} letzter Monat`
              : null}
          />
          <Kpi
            label="Häufigste"
            value={topCategory || "–"}
            sub={topCategory && topCategoryPct != null ? `${topCategoryPct}% aller Buchungen` : null}
          />
        </div>
      </div>
    </div>
  );
});

export default BehaviorCard;
