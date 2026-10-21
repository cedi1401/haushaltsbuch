import React, { useState, useMemo } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { formatPercent } from "../utils/formatUtils.js";
import { Card, CardContent, Button, RangeTabs } from "../components/ui.jsx";
import { IconChevronRight, IconInbox } from "../components/icons.jsx";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { useThemeColors } from "../hooks/themeColors.js";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { makeSubcategoryColorShades, CHART_COLORS } from "../utils/hbPalette.js";
import { pieCenterFontSize } from "../utils/chartStyle.js";

const CHART_TAB_OPTIONS = [
  { value: "expense", label: "Ausgaben" },
  { value: "income", label: "Einnahmen" },
];

const RESERVE_OPTIONS = [
  { value: "plain", label: "Nur Ausgaben" },
  { value: "reserves", label: "Inkl. Rückstellungen" },
];

// Ausgaben-/Einnahmen-Donut. Die Aufteilung der Einnahmen hat eine eigene
// Card (AllocationChart.jsx).
export default function Charts({
  expenseByHierarchy,
  incomeByHierarchy,
  showReserveToggle = false,
  includeReserves = false,
  onIncludeReservesChange,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const themeColors = useThemeColors();
  const [activeTab, setActiveTab] = useState("expense"); // "expense" | "income"
  const [drilldownId, setDrilldownId] = useState(null);  // null = overview, else categoryId
  const [displayMode, setDisplayMode] = useState("chf"); // "chf" | "percent"

  // Determine which hierarchy array is active
  const hierarchy = activeTab === "expense" ? (expenseByHierarchy || EMPTY_ARRAY) : (incomeByHierarchy || EMPTY_ARRAY);

  // Find the active parent category when in drill-down mode. Fehlt sie nach
  // dem Umschalten „Inkl. Rückstellungen“, gilt wieder die Übersicht.
  const activeCat = drilldownId ? hierarchy.find((c) => c.id === drilldownId) || null : null;
  const withReserves = activeTab === "expense" && includeReserves;

  // Build pie data and legend data based on mode
  const { pieData, legendItems, totalValue, centerLabel } = useMemo(() => {
    if (activeCat) {
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
    const label = activeTab !== "expense" ? "Gesamteinnahmen" : withReserves ? "Kosten gesamt" : "Gesamtausgaben";
    return {
      pieData: items,
      legendItems: items,
      totalValue: total,
      centerLabel: label,
    };
  }, [activeCat, hierarchy, activeTab, withReserves]);

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

  // Hat eine Zeile einen Pfeil, bekommen alle Zeilen (und die Gesamtzeile)
  // denselben Platz dafür — sonst stehen die Beträge nicht bündig untereinander.
  const hasChevrons = legendItems.some((item) => item.clickable);
  const chevronSlot = (clickable) => hasChevrons && (
    <span className="hb-legend-chevron" aria-hidden="true">
      {clickable && <IconChevronRight width={14} height={14} />}
    </span>
  );

  return (
    <Card style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px" }}>

        {/* Header: Tab switch + display toggle */}
        <div className="hb-chart-tabs-header">
          <RangeTabs
            options={CHART_TAB_OPTIONS}
            value={activeTab}
            onChange={handleTabChange}
            ariaLabel="Auswertung wählen"
          />

          {/* Filtert die Daten von Legende und Donut — mit etwas mehr Abstand,
              damit die beiden Umschalter nicht wie einer mit vier Optionen wirken. */}
          {activeTab === "expense" && showReserveToggle && (
            <RangeTabs
              options={RESERVE_OPTIONS}
              value={includeReserves ? "reserves" : "plain"}
              onChange={(v) => onIncludeReservesChange?.(v === "reserves")}
              ariaLabel="Rückstellungen im Ausgaben-Diagramm"
              style={{ marginLeft: 8 }}
            />
          )}

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

        {isEmpty ? (
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
              {activeCat && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  style={{ alignSelf: "flex-start", margin: "0 0 6px 10px" }}
                >
                  Zurück
                </Button>
              )}

              {/* Section title — only shown in drilldown */}
              {activeCat && (
                <div className="hb-legend-section-title">
                  {`Kategorien in ${activeCat.name}`}
                </div>
              )}

              {/* Total row */}
              <div className="hb-legend-total-row">
                <span>{activeCat ? `${activeCat.name} gesamt (${activeCat.entryCount})` : activeTab !== "expense" ? "Einnahmen gesamt" : withReserves ? "Kosten gesamt" : "Ausgaben gesamt"}</span>
                <div className="hb-legend-right">
                  <span className="hb-legend-total-value">
                    {displayMode === "percent"
                      ? "100 %"
                      : (activeTab === "expense" ? "−" : "+") + fmt(totalValue)}
                  </span>
                  {chevronSlot(false)}
                </div>
              </div>

              {/* Legend rows — Scrollbalken erscheint ab dem 12. Eintrag */}
              <div className="hb-legend-items-scroll">
                {legendItems.map((item, i) => {
                  const pct = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
                  const valueStr = displayMode === "percent"
                    ? formatPercent(pct, { sign: false })
                    : (activeTab === "expense" ? "−" : "+") + fmt(item.value);
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
                          style={{ background: item.color }}
                        />
                        <span className="hb-legend-name">{item.name}</span>
                        <span className="hb-legend-count">({item.entryCount})</span>
                      </div>
                      <div className="hb-legend-right">
                        <span className="hb-legend-value">{valueStr}</span>
                        {chevronSlot(item.clickable)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Donut Pie Chart with center overlay */}
            <div className="hb-chart-pie-wrap">
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={102}
                    outerRadius={180}
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
                        ? formatPercent((p.value / totalValue) * 100, { sign: false })
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

              {/* Center overlay */}
              {(() => {
                const centerValue = displayMode === "percent"
                  ? "100 %"
                  : (activeTab === "expense" ? "−" : "+") + fmt(totalValue);
                return (
                  <div className="hb-pie-center-overlay" style={{ pointerEvents: "none" }}>
                    <div className="hb-pie-total-value" style={{ fontSize: pieCenterFontSize(centerValue) }}>
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
