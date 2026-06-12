import React, { useState, useMemo } from "react";

const EMPTY_ARRAY = [];
import { Card, CardContent } from "../components/ui.jsx";
import { IconInbox } from "../components/icons.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { useCardBg } from "../hooks/useCardBg.js";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { makeSubcategoryColorShades, CHART_COLORS } from "../utils/hbPalette.js";

export default function Charts({
  expenseByHierarchy,
  incomeByHierarchy,
  baseCurrency = "CHF",
  totalIncome,
  totalExpense,
  totalReserveTransfers,
  totalSavingsTransfers,
  balance,
}) {
  const fmt = useFmt();
  const cardBg = useCardBg();
  const themeColors = useThemeColors();
  const [activeTab, setActiveTab] = useState("expense"); // "expense" | "income" | "allocation"
  const [drilldownId, setDrilldownId] = useState(null);  // null = overview, else categoryId
  const [displayMode, setDisplayMode] = useState("chf"); // "chf" | "percent"

  // Determine which hierarchy array is active
  const hierarchy = activeTab === "expense" ? (expenseByHierarchy || EMPTY_ARRAY) : (incomeByHierarchy || EMPTY_ARRAY);

  // Find the active parent category when in drill-down mode
  const activeCat = drilldownId ? hierarchy.find((c) => c.id === drilldownId) : null;

  // Build pie data and legend data based on mode
  const { pieData, legendItems, totalValue, centerLabel } = useMemo(() => {
    if (drilldownId && activeCat) {
      // Drill-down: show subcategories of the selected parent
      const subs = activeCat.subcategories || [];
      const colors = makeSubcategoryColorShades(activeCat.color, subs.length || 1);
      const items = subs.map((sub, i) => ({
        id: sub.id,
        name: sub.name,
        value: sub.value,
        entryCount: sub.entryCount,
        color: colors[i] || activeCat.color,
        clickable: false,
      }));
      return {
        pieData: items,
        legendItems: items,
        totalValue: activeCat.value,
        centerLabel: activeCat.name,
      };
    }

    // Overview: show top-level categories
    const items = hierarchy.map((cat) => ({
      id: cat.id,
      name: cat.name,
      value: cat.value,
      entryCount: cat.entryCount,
      color: cat.color || CHART_COLORS.transfer,
      clickable: (cat.subcategories || []).length > 0,
    }));
    const total = items.reduce((sum, d) => sum + d.value, 0);
    const label = activeTab === "expense" ? "Gesamtausgaben" : "Gesamteinnahmen";
    return {
      pieData: items,
      legendItems: items,
      totalValue: total,
      centerLabel: label,
    };
  }, [drilldownId, activeCat, hierarchy, activeTab]);

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

  function handleTabChange(tab) {
    setActiveTab(tab);
    setDrilldownId(null); // reset drill-down on tab switch
  }

  function handleLegendRowClick(item) {
    if (!item.clickable) return;
    setDrilldownId(item.id);
  }

  function handleBack() {
    setDrilldownId(null);
  }

  const isEmpty = hierarchy.length === 0;

  return (
    <Card style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px" }}>

        {/* Header: Tab switch + display toggle */}
        <div className="hb-chart-tabs-header">
          <div className="hb-tab-group">
            <button
              type="button"
              className={`hb-tab${activeTab === "expense" ? " hb-tab-active" : ""}`}
              onClick={() => handleTabChange("expense")}
            >
              Ausgaben
            </button>
            <button
              type="button"
              className={`hb-tab${activeTab === "income" ? " hb-tab-active" : ""}`}
              onClick={() => handleTabChange("income")}
            >
              Einnahmen
            </button>
            <button
              type="button"
              className={`hb-tab${activeTab === "allocation" ? " hb-tab-active" : ""}`}
              onClick={() => handleTabChange("allocation")}
            >
              Aufteilung
            </button>
          </div>

          <div className="hb-display-toggle">
            <button
              type="button"
              className={displayMode === "chf" ? "active" : ""}
              onClick={() => setDisplayMode("chf")}
            >
              {baseCurrency}
            </button>
            <button
              type="button"
              className={displayMode === "percent" ? "active" : ""}
              onClick={() => setDisplayMode("percent")}
            >
              %
            </button>
          </div>
        </div>

        {/* Allocation tab */}
        {activeTab === "allocation" ? (
          allocationData.totalValue <= 0 ? (
            <div className="hb-empty hb-empty--sm">
              <div className="hb-empty-icon"><IconInbox /></div>
              <div className="hb-empty-title">Keine Buchungen</div>
              <div className="hb-empty-text">Für diesen Monat wurden keine Buchungen erfasst.</div>
            </div>
          ) : (
            <div className="hb-chart-body">
              <div className="hb-chart-legend">
                <div className="hb-legend-total-row">
                  <span>Budget</span>
                </div>
                {allocationData.isOverbudget && (
                  <div style={{ fontSize: 11, color: themeColors.red, padding: "4px 0 2px" }}>
                    Überbucht — Ausgaben übersteigen Einnahmen
                  </div>
                )}
                <div className="hb-legend-items-scroll">
                  {allocationData.items.map((item) => {
                    const pct = allocationData.totalValue > 0
                      ? ((item.value / allocationData.totalValue) * 100).toFixed(1)
                      : "0.0";
                    const valueStr = displayMode === "percent" ? `${pct}%` : fmt(item.value);
                    return (
                      <div key={item.name} className="hb-legend-row">
                        <div className="hb-legend-left">
                          <span className="hb-dot" style={{ background: item.color, flexShrink: 0 }} />
                          <span className="hb-legend-name">{item.name}</span>
                        </div>
                        <span className="hb-legend-value">{valueStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="hb-chart-pie-wrap">
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={allocationData.items}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={87}
                      outerRadius={153}
                      paddingAngle={0}
                      cornerRadius={4}
                      stroke={cardBg}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      startAngle={90}
                      endAngle={-270}
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
                          ? `${((p.value / allocationData.totalValue) * 100).toFixed(1)}%`
                          : fmt(p.value);
                        return (
                          <div className="hb-chart-tooltip">
                            <span className="hb-chart-tooltip-label" style={{ color: p.fill }}>{p.name}</span>
                            <span>{valStr}</span>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="hb-pie-center-overlay" style={{ pointerEvents: "none" }}>
                  <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 600, letterSpacing: "0.01em" }}>Aufteilung</div>
                </div>
              </div>
            </div>
          )
        ) : (
        /* Empty state for expense/income */
        isEmpty ? (
          <div className="hb-empty hb-empty--sm">
            <div className="hb-empty-icon"><IconInbox /></div>
            <div className="hb-empty-title">Keine Buchungen</div>
            <div className="hb-empty-text">Für diesen Monat wurden keine Buchungen erfasst.</div>
          </div>
        ) : (
          <div className="hb-chart-body">

            {/* Left: Legend */}
            <div className="hb-chart-legend">

              {/* Back button when in drill-down */}
              {drilldownId && (
                <button
                  type="button"
                  className="hb-legend-back-btn"
                  onClick={handleBack}
                >
                  Zurück
                </button>
              )}

              {/* Section title — only shown in drilldown */}
              {drilldownId && activeCat && (
                <div className="hb-legend-section-title">
                  {`Kategorien in ${activeCat.name}`}
                </div>
              )}

              {/* Total row */}
              <div className="hb-legend-total-row">
                <span>{drilldownId && activeCat ? `${activeCat.name} gesamt (${activeCat.entryCount})` : activeTab === "expense" ? "Ausgaben gesamt" : "Einnahmen gesamt"}</span>
                <span>
                  {displayMode === "percent"
                    ? "100%"
                    : (activeTab === "expense" ? "-" : "+") + fmt(totalValue)}
                </span>
              </div>

              {/* Legend rows — scrollbar erscheint ab dem 11. Eintrag */}
              <div className="hb-legend-items-scroll">
                {legendItems.map((item, i) => {
                  const pct = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) : "0.0";
                  const valueStr = displayMode === "percent"
                    ? `${pct}%`
                    : (activeTab === "expense" ? "-" : "+") + fmt(item.value);
                  return (
                    <div
                      key={(item.id || item.name) + i}
                      className={`hb-legend-row${item.clickable ? " hb-legend-row-clickable" : ""}`}
                      onClick={item.clickable ? () => handleLegendRowClick(item) : undefined}
                      role={item.clickable ? "button" : undefined}
                      tabIndex={item.clickable ? 0 : undefined}
                      aria-label={item.clickable ? `${item.name}: ${valueStr} — Details anzeigen` : undefined}
                      onKeyDown={item.clickable ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleLegendRowClick(item);
                        }
                      } : undefined}
                    >
                      <div className="hb-legend-left">
                        <span
                          className="hb-dot"
                          style={{ background: item.color, flexShrink: 0 }}
                        />
                        <span className="hb-legend-name">{item.name}</span>
                        <span className="hb-legend-count">({item.entryCount})</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="hb-legend-value">{valueStr}</span>
                        {item.clickable && (
                          <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1 }}>›</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Donut Pie Chart with center overlay */}
            <div className="hb-chart-pie-wrap">
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={87}
                    outerRadius={153}
                    paddingAngle={0}
                    cornerRadius={4}
                    stroke={cardBg}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={(d.id || d.name) + i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      const valStr = displayMode === "percent"
                        ? `${((p.value / totalValue) * 100).toFixed(1)}%`
                        : fmt(p.value);
                      return (
                        <div className="hb-chart-tooltip">
                          <span className="hb-chart-tooltip-label" style={{ color: p.fill }}>{p.name}</span>
                          <span>{valStr}</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center overlay */}
              {(() => {
                const centerValue = displayMode === "percent"
                  ? "100%"
                  : (activeTab === "expense" ? "-" : "+") + fmt(totalValue);
                const len = centerValue.length;
                const fontSize = len >= 15 ? 17 : len >= 12 ? 20 : 24;
                return (
                  <div className="hb-pie-center-overlay" style={{ pointerEvents: "none" }}>
                    <div className="hb-pie-total-value" style={{ fontSize }}>
                      {centerValue}
                    </div>
                    <div className="hb-pie-total-label">{centerLabel}</div>
                  </div>
                );
              })()}
            </div>

          </div>
        ))}

      </CardContent>
    </Card>
  );
}
