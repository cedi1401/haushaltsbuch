import React, { useMemo, useState } from "react";
import { Card, CardContent } from "../components/ui.jsx";
import { getEntryFinancialMonth, formatYearMonth } from "../utils/financialMonthUtils.js";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { useFixedCostTrend } from "../hooks/useFixedCostTrend.js";
import FixedCostTrendSection from "./FixedCostTrendSection.jsx";
import { useDailyHeatmap } from "../hooks/useDailyHeatmap.js";
import CashflowHeatmap from "./CashflowHeatmap.jsx";

const monthLabel = formatYearMonth;

export default function TrendView({ entries, entriesAll, recurringExpenses = [], expenseCategories = [], monthStartDay = 1 }) {
  const fmt = useFmt();
  const [range, setRange] = useState(12); // months
  const hasAll = Array.isArray(entriesAll) && entriesAll.length > 0;
  const [userScope, setUserScope] = useState("book"); // "book" | "all"
  const themeColors = useThemeColors();

  // Derived scope: force "book" when active book is empty (prevents stale data from other books)
  const scope = useMemo(() => {
    if (!entries || entries.length === 0) return "book";
    if (userScope === "all" && !hasAll) return "book";
    return userScope;
  }, [entries, userScope, hasAll]);

  const sourceEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    if (scope === "all" && hasAll) return entriesAll;
    return entries;
  }, [scope, hasAll, entriesAll, entries]);

  const monthly = useMemo(() => {
    const map = new Map();
    for (const e of sourceEntries || []) {
      const ym = getEntryFinancialMonth(e, monthStartDay);
      if (!ym) continue;
      const prev = map.get(ym) || { month: ym, income: 0, expense: 0, transfer: 0, balance: 0 };
      const amt = Number(e.amount || 0);

      // Verwende das neue 'kind'-Feld statt 'type'
      // Logik entsprechend Dashboard (HaushaltsbuchApp.jsx:402-420)
      if (e.kind === "income") {
        prev.income += amt;
      } else if (e.kind === "expense" && e.source === "month") {
        // Nur Ausgaben aus Monatsbudget, nicht aus Töpfen
        prev.expense += amt;
      } else if (e.kind === "transfer") {
        // Transfers in Töpfe werden auch vom Saldo abgezogen
        prev.transfer += amt;
      }

      prev.balance = prev.income - prev.expense - prev.transfer;
      map.set(ym, prev);
    }

    const arr = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    if (!arr.length) return [];

    // Rolling averages auf dem vollständigen Array berechnen (vor dem Slice),
    // damit die Durchschnittslinien auch am Anfang des sichtbaren Bereichs
    // korrekte Werte aus den älteren, nicht angezeigten Monaten einbeziehen.
    const withAvg = arr.map((d, i, a) => {
      const s3 = a.slice(Math.max(0, i - 2), i + 1);
      const s6 = a.slice(Math.max(0, i - 5), i + 1);
      return {
        ...d,
        avg3: s3.reduce((s, x) => s + x.balance, 0) / s3.length,
        avg6: s6.reduce((s, x) => s + x.balance, 0) / s6.length,
      };
    });

    const take = Number(range);
    const sliced = take > 0 ? withAvg.slice(-take) : withAvg;
    return sliced.map((d) => ({ ...d, label: monthLabel(d.month) }));
  }, [sourceEntries, range, monthStartDay]);

  const totals = useMemo(() => {
    return monthly.reduce(
      (acc, m) => {
        acc.income += Number(m.income || 0);
        acc.expense += Number(m.expense || 0);
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [monthly]);

  const avg = useMemo(() => {
    const n = monthly.length || 1;
    return {
      income: totals.income / n,
      expense: totals.expense / n,
      balance: (totals.income - totals.expense) / n,
    };
  }, [totals, monthly.length]);

  const chartData = useMemo(() => {
    return monthly.map((m) => ({
      name: m.label,
      income: m.income,
      expense: m.expense,
      balance: m.balance,
      avg3: m.avg3,
      avg6: m.avg6,
    }));
  }, [monthly]);

  const highlights = useMemo(() => {
    if (!monthly.length) return null;
    const bestBalance = monthly.reduce((best, cur) => (cur.balance > best.balance ? cur : best), monthly[0]);
    return { bestBalance };
  }, [monthly]);

  const { months: heatmapMonths, monthMeta, dayMap, minBalance, maxBalance } = useDailyHeatmap({
    entries: sourceEntries,
    range: 12,
  });

  const { fixedMonthly, changes, kpis } = useFixedCostTrend({
    entries: sourceEntries,
    recurringExpenses,
    monthly,
    monthStartDay,
  });
  const configuredTotal = (recurringExpenses || [])
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const savingsRate = useMemo(() => {
    return avg.income > 0 ? ((avg.income - avg.expense) / avg.income) * 100 : 0;
  }, [avg]);

  const worstBalance = useMemo(() => {
    if (!monthly.length) return null;
    return monthly.reduce((worst, cur) => (cur.balance < worst.balance ? cur : worst), monthly[0]);
  }, [monthly]);

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Monatsvergleich & Trend</h2>
          <div className="hb-muted">
            Trend ist immer über alle Monate. (Der Monatsfilter oben gilt nur in der Buch-Ansicht.)
          </div>
        </div>

        <div className="hb-group">
          <label className="hb-muted" htmlFor="trend-scope-select">Quelle</label>
          <select
            id="trend-scope-select"
            className="hb-input"
            value={userScope}
            onChange={(e) => setUserScope(e.target.value)}
            disabled={!hasAll}
            title={!hasAll ? "Keine Daten über mehrere Bücher verfügbar." : undefined}
          >
            <option value="book">Aktives Buch</option>
            <option value="all">Alle Bücher</option>
          </select>

          <label className="hb-muted" htmlFor="trend-range-select">Zeitraum</label>
          <select id="trend-range-select" className="hb-input" value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={6}>Letzte 6 Monate</option>
            <option value={12}>Letzte 12 Monate</option>
            <option value={24}>Letzte 24 Monate</option>
            <option value={0}>Gesamter Zeitraum</option>
          </select>
        </div>
      </div>

      {highlights ? (
        <div className="hb-stat-pills">
          <div className="hb-stat-pill hb-stat-pill--ok">
            <span className="hb-stat-pill-label">Ø Einnahmen / Monat</span>
            <span className="hb-stat-pill-value">{fmt(avg.income)}</span>
          </div>
          <div className="hb-stat-pill hb-stat-pill--bad">
            <span className="hb-stat-pill-label">Ø Ausgaben / Monat</span>
            <span className="hb-stat-pill-value">{fmt(avg.expense)}</span>
          </div>
          <div className={`hb-stat-pill ${savingsRate >= 0 ? "hb-stat-pill--ok" : "hb-stat-pill--bad"}`}>
            <span className="hb-stat-pill-label">Sparquote (Ø)</span>
            <span className="hb-stat-pill-value">{savingsRate.toFixed(1)} %</span>
            <div className="hb-stat-pill-gauge-track">
              <div
                className="hb-stat-pill-gauge-fill"
                style={{
                  width: `${Math.min(Math.max(savingsRate, 0), 100)}%`,
                  background: savingsRate >= 0 ? "var(--green)" : "var(--red)",
                }}
              />
            </div>
          </div>
          <div className="hb-stat-pill hb-stat-pill--ok">
            <span className="hb-stat-pill-label">Bester Saldo</span>
            <span className="hb-stat-pill-value">{fmt(highlights.bestBalance.balance)}</span>
            <span className="hb-stat-pill-sub">{highlights.bestBalance.label}</span>
          </div>
          {worstBalance && (
            <div className="hb-stat-pill hb-stat-pill--bad">
              <span className="hb-stat-pill-label">Schlechtester Saldo</span>
              <span className="hb-stat-pill-value">{fmt(worstBalance.balance)}</span>
              <span className="hb-stat-pill-sub">{worstBalance.label}</span>
            </div>
          )}
        </div>
      ) : null}

      {monthly.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-muted">Noch keine Daten. Füge Einträge mit Datum hinzu, dann siehst du hier Trends.</div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hb-two">
            <Card>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Saldo-Trend</h3>
                  <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10" style={{ display: "block", flexShrink: 0 }}>
                        <line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.blue} strokeWidth="2.5" />
                      </svg>
                      Saldo
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10" style={{ display: "block", flexShrink: 0 }}>
                        <line x1="0" y1="5" x2="20" y2="5" stroke="#f7630c" strokeWidth="1.5" strokeDasharray="5 3" />
                      </svg>
                      3M Ø
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10" style={{ display: "block", flexShrink: 0 }}>
                        <line x1="0" y1="5" x2="20" y2="5" stroke="#7160e8" strokeWidth="1.5" strokeDasharray="3 3" />
                      </svg>
                      6M Ø
                    </span>
                  </div>
                </div>

                <div style={{ width: "100%", height: 280, marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        wrapperStyle={{ zIndex: 10 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const labelMap = { balance: "Saldo", avg3: "3M Ø", avg6: "6M Ø" };
                          const colorMap = { balance: themeColors.blue, avg3: "#f7630c", avg6: "#7160e8" };
                          return (
                            <div className="hb-chart-tooltip">
                              <span className="hb-chart-tooltip-label">{label}</span>
                              {payload.filter((p) => p.value != null).map((p) => (
                                <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
                                  <span style={{ color: colorMap[p.dataKey] }}>{labelMap[p.dataKey] || p.dataKey}</span>
                                  <span>{fmt(p.value)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Line type="monotone" dataKey="balance" dot={false} strokeWidth={2.5} stroke={themeColors.blue} />
                      <Line type="monotone" dataKey="avg3" dot={false} strokeWidth={1.5} stroke="#f7630c" strokeDasharray="5 3" />
                      <Line type="monotone" dataKey="avg6" dot={false} strokeWidth={1.5} stroke="#7160e8" strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="hb-note">Tipp: Wenn die Linie fällt, steigen die Ausgaben oder die Einnahmen sinken. Gestrichelt: gleitende Durchschnitte.</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "baseline" }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Einnahmen vs. Ausgaben</h3>
                  <div className="hb-muted">Balken: pro Monat</div>
                </div>

                <div style={{ width: "100%", height: 280, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} barCategoryGap={12}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip wrapperStyle={{ zIndex: 10 }} formatter={(v) => fmt(v)} />
                      <Bar dataKey="income" barSize={12} fill={themeColors.green} />
                      <Bar dataKey="expense" barSize={12} fill={themeColors.red} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="hb-note">Einnahmen grün, Ausgaben rot.</div>
              </CardContent>
            </Card>
          </div>

          {heatmapMonths.length > 0 && (
            <Card style={{ marginTop: 16 }}>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Kontostand-Verlauf</h3>
                  <span className="hb-muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                    Kumulierter Saldo pro Tag · letzte 12 Monate
                  </span>
                </div>
                <CashflowHeatmap
                  monthMeta={monthMeta}
                  dayMap={dayMap}
                  minBalance={minBalance}
                  maxBalance={maxBalance}
                />
              </CardContent>
            </Card>
          )}

          <FixedCostTrendSection
            fixedMonthly={fixedMonthly}
            changes={changes}
            kpis={kpis}
            configuredTotal={configuredTotal}
            recurringExpenses={recurringExpenses}
            expenseCategories={expenseCategories}
            avgMonthlyExpense={avg.expense}
          />
        </>
      )}
    </div>
  );
}
