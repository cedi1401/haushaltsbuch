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
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { getCategoryLabel } from "../utils/hbUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";

const MONTHS_DE = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
function fmtMonthDE(ym) {
  if (!ym) return "";
  const [, m] = ym.split("-").map(Number);
  return MONTHS_DE[m - 1] ?? ym;
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="hb-fct-kpi" style={accent ? { borderLeftColor: accent } : undefined}>
      <div className="hb-fct-kpi-label">{label}</div>
      <div className="hb-fct-kpi-value">{value}</div>
      {sub && <div className="hb-fct-kpi-sub">{sub}</div>}
    </div>
  );
}

// Horizontaler Balken: Anteil des Items an der Gesamtsumme
function ProportionBar({ pct, color }) {
  return (
    <div className="hb-fct-prop-track">
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
  const themeColors = useThemeColors();
  const [showInactive, setShowInactive] = useState(false);

  const momLabel =
    kpis.momDelta == null ? null
    : `${kpis.momDelta > 0 ? "+" : ""}${kpis.momDelta.toFixed(1)}% ggü. Vormonat`;

  // Aktive Items nach Betrag sortiert — nur Hauptkategorie, kein Subpfad
  const activeItems = useMemo(() => {
    const items = (recurringExpenses || [])
      .filter((r) => r.active !== false && r.showInOverview !== false)
      .map((r) => {
        const cat = (expenseCategories || []).find((c) => c.id === r.categoryId);
        return {
          ...r,
          amount: Number(r.amount || 0),
          categoryLabel: getCategoryLabel(expenseCategories || [], [], r.categoryId, null),
          color: cat?.color || "#6b6b6b",
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const base = avgMonthlyExpense > 0 ? avgMonthlyExpense : (items.reduce((s, r) => s + r.amount, 0) || 1);
    return items.map((r) => ({ ...r, pct: (r.amount / base) * 100 }));
  }, [recurringExpenses, expenseCategories, avgMonthlyExpense]);

  const inactiveItems = useMemo(
    () => (recurringExpenses || []).filter((r) => r.active === false),
    [recurringExpenses]
  );

  // Jahresbetrag-Summe aller sichtbaren Positionen
  const annualTotal = useMemo(
    () => activeItems.reduce((s, r) => s + r.amount * 12, 0),
    [activeItems]
  );

  return (
    <div className="hb-fct-section">
      <div className="hb-fct-header">
        <div>
          <h3 className="hb-fct-title">Fixkosten-Entwicklung</h3>
          <p className="hb-muted" style={{ margin: 0, fontSize: 13 }}>
            Gebuchte Fixkosten über den gewählten Zeitraum (via „Jetzt buchen") &amp; Übersicht aller konfigurierten Positionen
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="hb-fct-kpis">
        <KpiCard
          label="Konfiguriert / Monat"
          value={fmt(kpis.configuredTotal)}
          sub={`${kpis.activeCount} aktive Position${kpis.activeCount !== 1 ? "en" : ""}`}
          accent="var(--accent)"
        />
        <KpiCard
          label="Gebucht (letzter Monat)"
          value={fmt(kpis.bookedLast)}
          sub={momLabel}
          accent={kpis.momDelta == null ? undefined : kpis.momDelta > 0 ? "var(--red)" : "var(--green)"}
        />
        <KpiCard
          label="Ø Anteil an Ausgaben"
          value={kpis.avgShare != null ? `${kpis.avgShare.toFixed(1)} %` : "—"}
          sub="über den Zeitraum"
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
            <h4 style={{ margin: 0, fontSize: 15 }}>Verlauf über Zeit</h4>
            <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.accent} strokeWidth="2" /></svg>
                Gebucht
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#f7630c" strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                Konfiguriert
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="#7160e8" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
                Anteil %
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={fixedMonthly} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={themeColors.muted} strokeOpacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis yAxisId="chf" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={70} />
              <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} width={40} domain={[0, 100]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="hb-chart-tooltip">
                      <span className="hb-chart-tooltip-label">{label}</span>
                      {payload.filter((p) => p.value != null).map((p) => (
                        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <span style={{ color: p.stroke }}>
                            {p.dataKey === "fixedTotal" ? "Gebucht" : p.dataKey === "share" ? "Anteil" : p.dataKey}
                          </span>
                          <span>{p.dataKey === "share" ? `${p.value.toFixed(1)} %` : fmt(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                yAxisId="chf"
                y={configuredTotal}
                stroke="#f7630c"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{ value: "Soll", position: "insideTopRight", fill: "#f7630c", fontSize: 11 }}
              />
              <Line yAxisId="chf" type="monotone" dataKey="fixedTotal" stroke={themeColors.accent} strokeWidth={2.5} dot={false} connectNulls={false} />
              <Line yAxisId="pct" type="monotone" dataKey="share" stroke="#7160e8" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Positionen-Übersicht: 3 gleiche Spalten */}
      {activeItems.length > 0 && (
        <Card>
          <CardContent>
            <div className="hb-row" style={{ alignItems: "center", marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: 15 }}>Positionen-Übersicht</h4>
              <span className="hb-muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                Total: {fmt(configuredTotal)} / Monat
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
                  <span className="hb-fct-annual-label">/ Jahr</span>
                </div>
              ))}

              {/* Jahres-Total unter allen Items */}
              {annualTotal > 0 && (
                <div className="hb-fct-annual-total" style={{ gridColumn: 3, gridRow: activeItems.length + 2 }}>
                  <span className="hb-fct-annual-total-label">Total</span>
                  <span className="hb-fct-annual-total-value">{fmt(annualTotal)} / Jahr</span>
                </div>
              )}
            </div>

            {/* Inaktive Positionen (separat, ausserhalb des Grids) */}
            {inactiveItems.length > 0 && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border-light)", paddingTop: 10 }}>
                <button
                  className="hb-fct-show-more"
                  onClick={() => setShowInactive((v) => !v)}
                >
                  {showInactive
                    ? "Inaktive ausblenden"
                    : `${inactiveItems.length} inaktive Position${inactiveItems.length !== 1 ? "en" : ""} einblenden`}
                </button>
                {showInactive && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                    {inactiveItems.map((item) => (
                      <div key={item.id} className="hb-fct-name-cell" style={{ opacity: 0.45 }}>
                        <span className="hb-fct-item-dot" style={{ background: themeColors.muted, flexShrink: 0 }} />
                        <div className="hb-fct-name-block">
                          <span className="hb-fct-overview-name">{item.name}</span>
                          <span className="hb-fct-overview-cat">
                            {getCategoryLabel(expenseCategories || [], [], item.categoryId, item.subcategoryId)}
                            <span className="hb-fct-item-badge" style={{ marginLeft: 6 }}>inaktiv</span>
                          </span>
                        </div>
                        <span style={{ marginLeft: "auto", fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>
                          {fmt(Number(item.amount || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
