import React, { useState, useMemo } from "react";

const EMPTY_ARRAY = [];
import { Card, CardContent } from "../components/ui.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { makeSubcategoryColorShades, CHART_COLORS } from "../utils/hbPalette.js";

export default function Charts({ expenseByHierarchy, incomeByHierarchy, baseCurrency = "CHF" }) {
  const fmt = useFmt();
  const [activeTab, setActiveTab] = useState("expense"); // "expense" | "income"
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

        {/* Empty state */}
        {isEmpty ? (
          <div className="hb-chart-empty">
            Keine Buchungen in diesem Monat.
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
                  ← Zurück
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

              {/* Legend rows */}
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

            {/* Right: Donut Pie Chart with center overlay */}
            <div className="hb-chart-pie-wrap">
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={90}
                    outerRadius={150}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {pieData.map((d, i) => (
                      <Cell key={(d.id || d.name) + i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    formatter={(val) =>
                      displayMode === "percent"
                        ? `${((val / totalValue) * 100).toFixed(1)}%`
                        : fmt(val)
                    }
                    labelFormatter={(label) => label}
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
        )}

      </CardContent>
    </Card>
  );
}
