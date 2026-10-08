import React, { memo } from "react";
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
import { useThemeColors } from "../../hooks/themeColors.js";
import { CHART_STROKE, BAR_TOP_RADIUS, axisProps, averageLineProps, lineCursorProps } from "../../utils/chartStyle.js";
import { formatDateDELong, formatPercent } from "../../utils/hbUtils.js";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconInbox } from "../../components/icons.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";

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

  const themeColors = useThemeColors();
  const hasBarData = dailySpendData.some((d) => d.count > 0);
  const hasAreaData = thirtyDayData.some((d) => d.amount > 0);
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
                    stroke={themeColors.muted}
                    strokeOpacity={0.15}
                  />
                  <XAxis
                    dataKey="day"
                    {...axisProps(themeColors)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickCount={4}
                    {...axisProps(themeColors)}
                    width={24}
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
                  <Bar dataKey="count" radius={BAR_TOP_RADIUS}>
                    {dailySpendData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={themeColors.accent}
                        opacity={entry.count > 0 ? 0.85 : 0.12}
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
                   --- Ø {fmt(Math.round(avgAmount), 0)} pro Tag
                  </span>
                )}
                {dailyTrendPct !== null && (
                  <HbTooltip
                    placement="bottom"
                    text={
                      <>
                        Vergleicht den Tagesdurchschnitt der <strong>letzten 15 Tage</strong> mit den <strong>15 Tagen davor</strong>. Ein positiver Wert bedeutet, die Ausgaben steigen tendenziell; ein negativer Wert, dass sie sinken.
                      </>
                    }
                  >
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: dailyTrendPct > 0 ? themeColors.red : dailyTrendPct < 0 ? themeColors.green : themeColors.muted,
                    }}>
                      {formatPercent(dailyTrendPct, { digits: 0 })}
                    </span>
                  </HbTooltip>
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
                    stroke={themeColors.muted}
                    strokeOpacity={0.15}
                  />
                  <YAxis
                    ticks={areaTicks}
                    domain={[0, areaYMax]}
                    allowDecimals={false}
                    {...axisProps(themeColors)}
                    width={38}
                  />
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    cursor={lineCursorProps(themeColors)}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="hb-chart-tooltip">
                          <span className="hb-chart-tooltip-label">{formatDateDELong(d.date)}</span>
                          <span>{fmt(d.amount)}</span>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    y={avgAmount}
                    {...averageLineProps(themeColors)}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke={themeColors.accent}
                    fill={themeColors.accent}
                    fillOpacity={0.12}
                    strokeWidth={CHART_STROKE.main}
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
            sub={topCategory && topCategoryPct != null ? `${formatPercent(topCategoryPct, { digits: 0, sign: false })} aller Buchungen` : null}
          />
        </div>
      </div>
    </div>
  );
});

export default BehaviorCard;
