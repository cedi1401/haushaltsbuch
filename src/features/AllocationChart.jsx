import React, { useState, useMemo } from "react";
import { formatPercent } from "../utils/formatUtils.js";
import { AlertBar, Card, CardContent, RangeTabs } from "../components/ui.jsx";
import { IconInbox } from "../components/icons.jsx";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { useThemeColors } from "../hooks/themeColors.js";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// Kleiner Donut über der Legende: gleiches Ringverhältnis wie der große
// Ausgaben-Donut (87/153), damit beide als ein System lesbar bleiben.
const PIE_SIZE = 240;
const INNER_RADIUS = 61;
const OUTER_RADIUS = 108;

// Wie pieCenterFontSize, eine Stufe kleiner: Die Mitte ist nur 122 px breit.
function centerFontSize(text) {
  const len = String(text).length;
  return len >= 15 ? 13 : len >= 12 ? 15 : 18;
}

// Mittelverwendung der Einnahmen: Ausgaben, Rücklagen, Sparen, Frei.
export default function AllocationChart({
  totalIncome,
  totalExpense,
  totalReserveTransfers,
  totalSavingsTransfers,
  balance,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const themeColors = useThemeColors();
  const [displayMode, setDisplayMode] = useState("chf"); // "chf" | "percent"

  const allocationData = useMemo(() => {
    const income = totalIncome ?? 0;
    const items = [];
    if ((totalExpense ?? 0) > 0)
      items.push({ name: "Ausgaben", value: totalExpense, color: themeColors.red });
    if ((totalReserveTransfers ?? 0) > 0)
      items.push({ name: "Rücklagen", value: totalReserveTransfers, color: themeColors.blue });
    if ((totalSavingsTransfers ?? 0) > 0)
      items.push({ name: "Sparen", value: totalSavingsTransfers, color: themeColors.teal });
    const freiAmt = balance ?? 0;
    if (freiAmt > 0)
      items.push({ name: "Frei", value: freiAmt, color: themeColors.green });
    items.sort((a, b) => b.value - a.value);
    return { items, totalValue: income, isOverbudget: freiAmt < 0 };
  }, [totalIncome, totalExpense, totalReserveTransfers, totalSavingsTransfers, balance, themeColors]);

  const centerValue = displayMode === "percent" ? "100 %" : fmt(allocationData.totalValue);

  return (
    <Card style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px" }}>

        <div className="hb-chart-tabs-header">
          <h3 className="hb-card-title">Aufteilung</h3>
          <RangeTabs
            options={[
              { value: "chf", label: baseCurrency },
              { value: "percent", label: "%" },
            ]}
            value={displayMode}
            onChange={setDisplayMode}
            ariaLabel="Anzeige als Betrag oder Anteil"
            style={{ marginLeft: "auto" }}
          />
        </div>

        {allocationData.totalValue <= 0 ? (
          <div className="hb-empty hb-empty--sm">
            <div className="hb-empty-icon"><IconInbox /></div>
            <div className="hb-empty-title">Keine Buchungen</div>
            <div className="hb-empty-text">Für diesen Monat wurden keine Buchungen erfasst.</div>
          </div>
        ) : (
          <div className="hb-chart-body hb-chart-body--stack">
            <div className="hb-chart-pie-wrap">
              <ResponsiveContainer width="100%" height={PIE_SIZE}>
                <PieChart>
                  <Pie
                    data={allocationData.items}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={INNER_RADIUS}
                    outerRadius={OUTER_RADIUS}
                    paddingAngle={0}
                    cornerRadius={4}
                    stroke={themeColors.card}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    startAngle={90}
                    endAngle={-270}
                    animationBegin={0}
                    animationDuration={1350}
                  >
                    {allocationData.items.map((d, i) => (
                      <Cell key={d.name + i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      const valStr = displayMode === "percent"
                        ? formatPercent((p.value / allocationData.totalValue) * 100, { sign: false })
                        : fmt(p.value);
                      return (
                        <div className="hb-chart-tooltip">
                          <span className="hb-chart-tooltip-label">
                            <span className="hb-tooltip-dot" style={{ background: p.fill }} />
                            {p.name}
                          </span>
                          <span>{valStr}</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="hb-pie-center-overlay" style={{ pointerEvents: "none" }}>
                <div className="hb-pie-total-value" style={{ fontSize: centerFontSize(centerValue) }}>
                  {centerValue}
                </div>
                <div className="hb-pie-total-label">Einnahmen</div>
              </div>
            </div>

            <div className="hb-chart-legend">
              <div className="hb-legend-total-row">
                <span>Mittelverwendung</span>
              </div>
              <div className="hb-legend-items-scroll">
                {allocationData.items.map((item) => {
                  const pct = allocationData.totalValue > 0
                    ? (item.value / allocationData.totalValue) * 100
                    : 0;
                  const valueStr = displayMode === "percent" ? formatPercent(pct, { sign: false }) : fmt(item.value);
                  return (
                    <div key={item.name} className="hb-legend-row">
                      <div className="hb-legend-left">
                        <span className="hb-dot" style={{ background: item.color }} />
                        <span className="hb-legend-name">{item.name}</span>
                      </div>
                      <span className="hb-legend-value">{valueStr}</span>
                    </div>
                  );
                })}
              </div>
              {/* Gleiche rote Warnbox wie bei überschrittenen Budgets in den
                  Insights, hier aber einzeilig und ohne Klickziel. Ohne
                  Überbuchung bleibt sie als unsichtbarer Platzhalter stehen,
                  damit die Legende immer gleich breit ist. */}
              <AlertBar
                compact
                className={`hb-allocation-alert${allocationData.isOverbudget ? "" : " hb-allocation-alert--sizer"}`}
                role={allocationData.isOverbudget ? "status" : null}
                title="Überbucht"
                message="Ausgaben übersteigen Einnahmen"
              />
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
