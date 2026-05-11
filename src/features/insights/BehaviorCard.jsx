import React, { memo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  YAxis,
  XAxis,
  AreaChart,
  Area,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useThemeColors } from "../../hooks/useThemeColors.jsx";
import { formatDateDELong } from "../../utils/hbUtils.js";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

function KpiRow({ label, value, sub }) {
  return (
    <div className="hb-behavior-kpi-row">
      <div className="hb-insight-label">{label}</div>
      <div className="hb-behavior-kpi-val">{value}</div>
      {sub && <div className="hb-behavior-kpi-sub">{sub}</div>}
    </div>
  );
}

function LeftAlignedTick({ x, y, payload, fill }) {
  return (
    <text x={4} y={y} dy={4} fill={fill} fontSize={12} textAnchor="start">
      {payload.value}
    </text>
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
    weeklyInsight,
    dailyTrendPct,
  } = analytics;

  const [trendTooltipVisible, setTrendTooltipVisible] = useState(false);
  const themeColors = useThemeColors();
  const maxCount = Math.max(...dailySpendData.map((d) => d.count), 1);
  const avgAmount = thirtyDayData.reduce((s, d) => s + d.amount, 0) / 30;

  return (
    <div className="hb-insights-pane hb-insights-pane--active">
      <div className="hb-behavior-split">
        {/* Linke Seite: Horizontale Balken Mo→So */}
        <div className="hb-behavior-bars">
          <div className="hb-insight-label" style={{ marginBottom: 10 }}>Wochentage</div>
          <div style={{ flex: 1, minHeight: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={dailySpendData}
              barSize={18}
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            >
              <YAxis
                dataKey="day"
                type="category"
                axisLine={false}
                tickLine={false}
                tick={<LeftAlignedTick fill={themeColors.muted} />}
                width={52}
              />
              <XAxis type="number" hide />
              <Tooltip
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
              <Bar dataKey="count" radius={[0, 2, 2, 0]}>
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
          </div>

          {weeklyInsight && (
            <div className="hb-behavior-bars-insight">
              <span className="hb-behavior-bars-insight-dot" />
              {weeklyInsight}
            </div>
          )}
        </div>

        <div className="hb-behavior-divider" />

        {/* Rechte Seite: Sparkline + KPIs */}
        <div className="hb-behavior-right">
          {/* 30-Tage Area Sparkline */}
          <div className="hb-behavior-sparkline">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span className="hb-insight-label">30 Tage</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="hb-insight-label" style={{ fontSize: 11 }}>
                  Ø {fmt ? fmt(Math.round(avgAmount), 0) : Math.round(avgAmount)} / Tag
                </span>
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
                        background: "var(--card-bg, #fff)",
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
            <ResponsiveContainer width="100%" height={70}>
              <AreaChart data={thirtyDayData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <Tooltip
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
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span className="hb-insight-label" style={{ fontSize: 10 }}>vor 30 Tagen</span>
              <span className="hb-insight-label" style={{ fontSize: 10 }}>Ausgaben / Tag</span>
              <span className="hb-insight-label" style={{ fontSize: 10 }}>heute</span>
            </div>
          </div>

          {/* Trennlinie Sparkline → KPIs */}
          <div className="hb-behavior-kpi-separator" />

          {/* KPIs als 2×2-Raster */}
          <div className="hb-behavior-kpis hb-behavior-kpis--grid">
            <KpiRow label="Aktivster Tag" value={mostActiveDay} />
            <KpiRow
              label="Buchungen"
              value={totalBookings}
              sub={prevTotalBookings > 0 ? `${prevTotalBookings} letzter Monat` : null}
            />
            <KpiRow
              label="Ø / Tag"
              value={avgBookingsPerDay.toFixed(1)}
              sub={prevAvgBookingsPerDay != null
                ? `${prevAvgBookingsPerDay.toFixed(1)} letzter Monat`
                : null}
            />
            {topCategory && (
              <KpiRow
                label="Häufigste"
                value={topCategory}
                sub={topCategoryPct != null ? `${topCategoryPct}% aller Buchungen` : null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default BehaviorCard;
