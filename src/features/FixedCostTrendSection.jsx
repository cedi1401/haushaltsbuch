import React, { memo, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { Card, CardContent } from "../components/ui.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import HbSparklineHover from "../components/HbSparklineHover.jsx";
import { IconTag } from "../components/icons.jsx";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { getCategoryLabel, formatCurrencyAxis } from "../utils/hbUtils.js";
import { FALLBACK_CATEGORY_COLOR } from "../utils/hbPalette.js";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { MONTHS_SHORT } from "../utils/constants.js";

function fmtMonthDE(ym) {
  if (!ym) return "";
  const [, m] = ym.split("-").map(Number);
  return MONTHS_SHORT[m - 1] ?? ym;
}

function KpiCard({ label, value, sub, accent, spark }) {
  return (
    <div className="hb-fct-kpi" style={accent ? { borderLeftColor: accent } : undefined}>
      <div className="hb-fct-kpi-top">
        <div className="hb-fct-kpi-label">{label}</div>
        {spark && (
          <HbSparklineHover
            data={spark.data}
            dataKey={spark.dataKey}
            color={spark.color}
            caption={spark.caption}
            label={`Verlauf: ${label}`}
          />
        )}
      </div>
      <div className="hb-fct-kpi-value">{value}</div>
      {sub && <div className="hb-fct-kpi-sub">{sub}</div>}
    </div>
  );
}

// Horizontaler Balken: Anteil des Items an der Gesamtsumme.
// Der Track wird in der Item-Hue getönt (Hue-auf-Hue statt neutralem Grau).
function ProportionBar({ pct, color }) {
  return (
    <div
      className="hb-fct-prop-track"
      style={color ? { background: `${color}24` } : undefined}
    >
      <div
        className="hb-fct-prop-fill"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  );
}

const FixedCostTrendSection = memo(function FixedCostTrendSection({
  fixedMonthly,
  changes,
  kpis,
  configuredTotal,
  recurringExpenses,
  expenseCategories,
  avgMonthlyExpense = 0,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const themeColors = useThemeColors();
  const [fctRangeOption, setFctRangeOption] = useState("12");
  const [fctScrollOffset, setFctScrollOffset] = useState(0);
  const [selectedTags, setSelectedTags] = useState(new Set());

  const fctRangePool = useMemo(() => {
    if (fctRangeOption === "12") return fixedMonthly.slice(-12);
    if (fctRangeOption === "24") return fixedMonthly.slice(-24);
    return fixedMonthly;
  }, [fixedMonthly, fctRangeOption]);

  const fctMaxOffset = Math.max(0, fctRangePool.length - 12);

  const fctWindowData = useMemo(() => {
    const start = Math.max(0, fctRangePool.length - 12 - fctScrollOffset);
    return fctRangePool.slice(start, start + 12);
  }, [fctRangePool, fctScrollOffset]);

  const fctWindowLabel = useMemo(() => {
    if (!fctWindowData.length) return "";
    const first = fctWindowData[0].label;
    const last = fctWindowData[fctWindowData.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [fctWindowData]);

  const momLabel =
    kpis.momDelta == null ? null
    : `${kpis.momDelta > 0 ? "+" : ""}${kpis.momDelta.toFixed(1)}% ggü. Vormonat`;

  const availableTags = useMemo(() => {
    const set = new Set();
    (recurringExpenses || [])
      .filter((r) => r.showInOverview !== false)
      .forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [recurringExpenses]);

  const totalOverviewCount = useMemo(
    () => (recurringExpenses || []).filter((r) => r.showInOverview !== false).length,
    [recurringExpenses]
  );

  // Items nach Betrag sortiert — nur mit showInOverview, nur Hauptkategorie
  const activeItems = useMemo(() => {
    const allOverviewItems = (recurringExpenses || [])
      .filter((r) => r.showInOverview !== false)
      .map((r) => {
        const cat = (expenseCategories || []).find((c) => c.id === r.categoryId);
        return {
          ...r,
          amount: Number(r.amount || 0),
          categoryLabel: getCategoryLabel(expenseCategories || [], [], r.categoryId, null),
          color: cat?.color || FALLBACK_CATEGORY_COLOR,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const items = selectedTags.size === 0
      ? allOverviewItems
      : allOverviewItems.filter((r) => (r.tags || []).some((t) => selectedTags.has(t)));

    const base = avgMonthlyExpense > 0 ? avgMonthlyExpense : (items.reduce((s, r) => s + r.amount, 0) || 1);
    return items.map((r) => ({ ...r, pct: (r.amount / base) * 100 }));
  }, [recurringExpenses, expenseCategories, avgMonthlyExpense, selectedTags]);

  // Jahresbetrag-Summe aller sichtbaren Positionen
  const annualTotal = useMemo(
    () => activeItems.reduce((s, r) => s + r.amount * 12, 0),
    [activeItems]
  );

  return (
    <div className="hb-fct-section">
      <div className="hb-fct-header">
        <div className="hb-title-with-help">
          <h3 className="hb-fct-title">Fixkosten-Entwicklung</h3>
          <HbTooltip text='Gebuchte Fixkosten über den gewählten Zeitraum (via „Jetzt buchen") und Übersicht aller konfigurierten Positionen.' />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="hb-fct-kpis">
        <KpiCard
          label="Konfiguriert pro Monat"
          value={fmt(kpis.configuredTotal)}
          sub={`${kpis.activeCount} Position${kpis.activeCount !== 1 ? "en" : ""}`}
          accent="var(--accent)"
        />
        <KpiCard
          label="Gebucht (letzter Monat)"
          value={fmt(kpis.bookedLast)}
          sub={momLabel}
          accent={kpis.momDelta == null ? undefined : kpis.momDelta > 0 ? "var(--red)" : "var(--green)"}
          spark={{ data: fctWindowData, dataKey: "fixedTotal", color: themeColors.accent, caption: fctWindowLabel }}
        />
        <KpiCard
          label="Ø Anteil an Ausgaben"
          value={kpis.avgShare != null ? `${kpis.avgShare.toFixed(1)} %` : "—"}
          sub="über den Zeitraum"
          spark={{ data: fctWindowData, dataKey: "share", color: themeColors.purple, caption: fctWindowLabel }}
        />
        <KpiCard
          label="Teuerste Position"
          value={kpis.mostExpensive ? fmt(kpis.mostExpensive.amount) : "—"}
          sub={kpis.mostExpensive?.name ?? null}
        />
      </div>

      {/* Hauptchart: Verlauf Gesamtbetrag + %-Anteil */}
      <Card>
        <CardContent>
          <div className="hb-row" style={{ alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <h4 style={{ margin: 0, fontSize: 15 }}>Verlauf über Zeit</h4>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.accent} strokeWidth="2" /></svg>
                Gebucht
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.orange} strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                Konfiguriert
              </span>
            </div>
            <div className="hb-chart-range" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, visibility: fctMaxOffset > 0 ? "visible" : "hidden" }}>
                <button type="button" className="hb-icon-btn" onClick={() => setFctScrollOffset((o) => Math.min(o + 1, fctMaxOffset))} disabled={fctScrollOffset >= fctMaxOffset} title="Älteren Bereich anzeigen">‹</button>
                <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{fctWindowLabel}</span>
                <button type="button" className="hb-icon-btn" onClick={() => setFctScrollOffset((o) => Math.max(o - 1, 0))} disabled={fctScrollOffset === 0} title="Neueren Bereich anzeigen">›</button>
              </div>
              {fixedMonthly.length > 12 && (
                <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                  {[["12", "12 M"], ["24", "24 M"], ["all", "Gesamt"]].map(([val, lbl]) => (
                    <button key={val} type="button" className={`hb-pill-tab ${fctRangeOption === val ? "hb-pill-tab-active" : ""}`} onClick={() => { setFctRangeOption(val); setFctScrollOffset(0); }}>{lbl}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={fctWindowData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrencyAxis(v, baseCurrency)} width={64} />
              <Tooltip
                wrapperStyle={{ zIndex: 10 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="hb-chart-tooltip">
                      <span className="hb-chart-tooltip-label">{label}</span>
                      {payload.filter((p) => p.value != null).map((p) => (
                        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <span>Gebucht</span>
                          <span>{fmt(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={configuredTotal}
                stroke={themeColors.orange}
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{ value: "Soll", position: "insideTopRight", fill: themeColors.orange, fontSize: 11 }}
              />
              <Line type="monotone" dataKey="fixedTotal" stroke={themeColors.accent} strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Fixkosten-Übersicht: 3 gleiche Spalten */}
      {activeItems.length > 0 && (
        <Card>
          <CardContent>
            <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8, justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 15 }}>Übersicht</h4>
                  {selectedTags.size > 0 && (
                    <span className="hb-fct-filter-hint">{activeItems.length} von {totalOverviewCount}</span>
                  )}
                </div>
                {availableTags.length > 0 && (
                  <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                    <button
                      type="button"
                      className={`hb-pill-tab${selectedTags.size === 0 ? " hb-pill-tab-active" : ""}`}
                      onClick={() => setSelectedTags(new Set())}
                    >
                      Alle
                    </button>
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`hb-pill-tab${selectedTags.has(tag) ? " hb-pill-tab-active" : ""}`}
                        onClick={() => setSelectedTags((prev) => {
                          const next = new Set(prev);
                          if (next.has(tag)) next.delete(tag); else next.add(tag);
                          return next;
                        })}
                      >
                        <IconTag width={13} height={13} />
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="hb-muted" style={{ fontSize: 12, alignSelf: "flex-start", paddingTop: 2 }}>
                Total: {fmt(configuredTotal)} pro Monat
              </span>
            </div>

            {/* CSS-Grid: 3 gleiche Spalten, Zeilen durch Items bestimmt */}
            <div
              className="hb-fct-three-grid"
              style={{ gridTemplateRows: `auto repeat(${activeItems.length}, auto)` }}
            >
              {/* Spalten-Header */}
              <div className="hb-fct-col-head" style={{ gridColumn: 1, gridRow: 1 }}>Position</div>
              <div className="hb-fct-col-head" style={{ gridColumn: 2, gridRow: 1 }}>Anteil Ø-Ausgaben</div>
              <div className="hb-fct-col-head" style={{ gridColumn: 3, gridRow: 1 }}>Jahresbetrag</div>

              {/* Spalte 1 + 2: Items */}
              {activeItems.map((item, i) => [
                <div
                  key={`name-${item.id}`}
                  className="hb-fct-name-cell"
                  style={{ gridColumn: 1, gridRow: i + 2 }}
                >
                  <span className="hb-fct-item-dot" style={{ background: item.color, flexShrink: 0 }} />
                  <div className="hb-fct-name-block">
                    <span className="hb-fct-overview-name">{item.name}</span>
                    <span className="hb-fct-overview-cat">{item.categoryLabel}</span>
                  </div>
                </div>,

                <div
                  key={`bar-${item.id}`}
                  className="hb-fct-bar-cell"
                  style={{ gridColumn: 2, gridRow: i + 2 }}
                >
                  <ProportionBar pct={item.pct} color={item.color} />
                  <div className="hb-fct-bar-meta">
                    <span className="hb-fct-overview-amount">{fmt(item.amount)}</span>
                    <span className="hb-fct-overview-pct">{item.pct.toFixed(1)} %</span>
                  </div>
                </div>,
              ])}

              {/* Spalte 3: Jahresbetrag — nur für Positionen mit annualPayment */}
              {activeItems.map((item, i) => (
                <div
                  key={`annual-${item.id}`}
                  className="hb-fct-annual-cell"
                  style={{ gridColumn: 3, gridRow: i + 2 }}
                >
                  <span className="hb-fct-annual-amount">{fmt(item.amount * 12)}</span>
                  <span className="hb-fct-annual-label">pro Jahr</span>
                </div>
              ))}

              {/* Jahres-Total unter allen Items */}
              {annualTotal > 0 && (
                <div className="hb-fct-annual-total" style={{ gridColumn: 3, gridRow: activeItems.length + 2 }}>
                  <span className="hb-fct-annual-total-label">Total</span>
                  <span className="hb-fct-annual-total-value">{fmt(annualTotal)} pro Jahr</span>
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      )}

      {/* Veränderungen im Zeitraum */}
      {(changes.newItems.length > 0 || changes.droppedItems.length > 0) && (
        <Card>
          <CardContent>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 15 }}>Veränderungen im Zeitraum</h4>
            <div className="hb-fct-changes">
              {changes.newItems.length > 0 && (
                <div className="hb-fct-changes-group">
                  <span className="hb-fct-changes-label hb-fct-changes-label--new">Neu seit</span>
                  {changes.newItems.map((c) => (
                    <span key={c.name} className="hb-fct-chip hb-fct-chip--new">
                      {c.name} · {fmtMonthDE(c.firstMonth)}
                    </span>
                  ))}
                </div>
              )}
              {changes.droppedItems.length > 0 && (
                <div className="hb-fct-changes-group">
                  <span className="hb-fct-changes-label hb-fct-changes-label--dropped">Weggefallen</span>
                  {changes.droppedItems.map((c) => (
                    <span key={c.name} className="hb-fct-chip hb-fct-chip--dropped">
                      {c.name} · bis {fmtMonthDE(c.lastMonth)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

export default FixedCostTrendSection;
