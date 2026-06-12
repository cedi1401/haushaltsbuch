import React, { useMemo, useState } from "react";
import { Card, CardContent } from "../components/ui.jsx";
import { IconTrend } from "../components/icons.jsx";
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
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { useFixedCostTrend } from "../hooks/useFixedCostTrend.js";
import FixedCostTrendSection from "./FixedCostTrendSection.jsx";
import { TRANSFER_PALETTE } from "../utils/hbPalette.js";

const monthLabel = formatYearMonth;

// oldest → lightest, newest → darkest
const YOY_YEAR_COLORS = [TRANSFER_PALETTE[7], TRANSFER_PALETTE[3], TRANSFER_PALETTE[0]];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const BAR_RADIUS = 2;

function roundedBarPath(x, y, width, height, { topRounded, bottomRounded }) {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  const w = Math.abs(width);
  const h = Math.abs(height);
  const right = left + w;
  const bottom = top + h;
  const r = Math.min(BAR_RADIUS, h / 2, w / 2);
  const rt = topRounded ? r : 0;
  const rb = bottomRounded ? r : 0;
  return [
    `M${left},${top + rt}`,
    rt ? `A${rt},${rt} 0 0 1 ${left + rt},${top}` : `L${left},${top}`,
    `L${right - rt},${top}`,
    rt ? `A${rt},${rt} 0 0 1 ${right},${top + rt}` : `L${right},${top}`,
    `L${right},${bottom - rb}`,
    rb ? `A${rb},${rb} 0 0 1 ${right - rb},${bottom}` : `L${right},${bottom}`,
    `L${left + rb},${bottom}`,
    rb ? `A${rb},${rb} 0 0 1 ${left},${bottom - rb}` : `L${left},${bottom}`,
    "Z",
  ].join(" ");
}

function makeStackBarShape(fill) {
  return function StackBarShape({ x, y, width, height }) {
    if (!height || !width) return null;
    const d = roundedBarPath(x, y, width, height, { topRounded: true, bottomRounded: true });
    return <path d={d} fill={fill} />;
  };
}

function CashflowTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p) => p.dataKey === "income");
  const expense = payload.find((p) => p.dataKey === "expense");
  const transfer = payload.find((p) => p.dataKey === "transfer");
  const savings = payload.find((p) => p.dataKey === "savings");
  const frei = (income?.value ?? 0) + (expense?.value ?? 0) + (transfer?.value ?? 0) + (savings?.value ?? 0);
  return (
    <div className="hb-chart-tooltip">
      <span className="hb-chart-tooltip-label">{label}</span>
      {income && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "var(--green)" }}>Einnahmen</span>
          <span>+{fmt(income.value)}</span>
        </div>
      )}
      {expense && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "var(--red)" }}>Ausgaben</span>
          <span>−{fmt(Math.abs(expense.value))}</span>
        </div>
      )}
      {transfer && Math.abs(transfer.value) > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "var(--blue)" }}>Rücklagen</span>
          <span>−{fmt(Math.abs(transfer.value))}</span>
        </div>
      )}
      {savings && Math.abs(savings.value) > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "var(--teal)" }}>Sparen</span>
          <span>−{fmt(Math.abs(savings.value))}</span>
        </div>
      )}
      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, fontWeight: 600 }}>
        <span className="hb-muted">Frei</span>
        <span style={{ color: frei >= 0 ? "var(--green)" : "var(--red)" }}>
          {frei >= 0 ? "+" : "−"}{fmt(Math.abs(frei))}
        </span>
      </div>
    </div>
  );
}

function YoYTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="hb-chart-tooltip">
      <span className="hb-chart-tooltip-label">{label}</span>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
            <span style={{ color: p.fill }}>{p.dataKey}</span>
            <span>{fmt(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

export default function TrendView({ entries, entriesAll, recurringExpenses = [], expenseCategories = [], monthStartDay = 1, pots = [] }) {
  const fmt = useFmt();
  const hasAll = Array.isArray(entriesAll) && entriesAll.length > 0;
  const [userScope, setUserScope] = useState("book"); // "book" | "all"
  const [saldoRangeOption, setSaldoRangeOption] = useState("12");
  const [saldoScrollOffset, setSaldoScrollOffset] = useState(0);
  const [evaRangeOption, setEvaRangeOption] = useState("12");
  const [evaScrollOffset, setEvaScrollOffset] = useState(0);
  const [yoyMode, setYoyMode] = useState("expense"); // "expense" | "transfer" | "savings"
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

  const savingsPotIds = useMemo(
    () => new Set((pots || []).filter((p) => p.isSavings).map((p) => p.id)),
    [pots]
  );

  const monthly = useMemo(() => {
    const map = new Map();
    for (const e of sourceEntries || []) {
      const ym = getEntryFinancialMonth(e, monthStartDay);
      if (!ym) continue;
      const prev = map.get(ym) || { month: ym, income: 0, expense: 0, transfer: 0, savings: 0, balance: 0 };
      const amt = Number(e.amount || 0);

      if (e.kind === "income") {
        prev.income += amt;
      } else if (e.kind === "expense" && e.source === "month") {
        prev.expense += amt;
      } else if (e.kind === "transfer") {
        if (savingsPotIds.has(e.potId)) {
          prev.savings += amt;
        } else {
          prev.transfer += amt;
        }
      }

      prev.balance = prev.income - prev.expense - prev.transfer - prev.savings;
      map.set(ym, prev);
    }

    const arr = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    if (!arr.length) return [];

    // Rolling averages auf dem vollständigen Array berechnen (vor dem Slice),
    // damit die Durchschnittslinien auch am Anfang des sichtbaren Bereichs
    // korrekte Werte aus den älteren, nicht angezeigten Monaten einbeziehen.
    const rate = (x) => x.income > 0 ? (x.savings / x.income) * 100 : 0;
    const withAvg = arr.map((d, i, a) => {
      const s3 = a.slice(Math.max(0, i - 2), i + 1);
      const s6 = a.slice(Math.max(0, i - 5), i + 1);
      return {
        ...d,
        savingsRate: rate(d),
        avg3: s3.reduce((s, x) => s + rate(x), 0) / s3.length,
        avg6: s6.reduce((s, x) => s + rate(x), 0) / s6.length,
      };
    });

    return withAvg.map((d) => ({ ...d, label: monthLabel(d.month) }));
  }, [sourceEntries, monthStartDay]);

  const saldoRangePool = useMemo(() => {
    if (saldoRangeOption === "12") return monthly.slice(-12);
    if (saldoRangeOption === "24") return monthly.slice(-24);
    return monthly;
  }, [monthly, saldoRangeOption]);
  const saldoMaxOffset = Math.max(0, saldoRangePool.length - 12);
  const saldoWindowData = useMemo(() => {
    const start = Math.max(0, saldoRangePool.length - 12 - saldoScrollOffset);
    return saldoRangePool.slice(start, start + 12);
  }, [saldoRangePool, saldoScrollOffset]);
  const saldoWindowLabel = useMemo(() => {
    if (!saldoWindowData.length) return "";
    const first = saldoWindowData[0].label;
    const last = saldoWindowData[saldoWindowData.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [saldoWindowData]);

  const evaRangePool = useMemo(() => {
    if (evaRangeOption === "12") return monthly.slice(-12);
    if (evaRangeOption === "24") return monthly.slice(-24);
    return monthly;
  }, [monthly, evaRangeOption]);
  const evaMaxOffset = Math.max(0, evaRangePool.length - 12);
  const evaWindowData = useMemo(() => {
    const start = Math.max(0, evaRangePool.length - 12 - evaScrollOffset);
    return evaRangePool.slice(start, start + 12);
  }, [evaRangePool, evaScrollOffset]);
  const evaWindowLabel = useMemo(() => {
    if (!evaWindowData.length) return "";
    const first = evaWindowData[0].label;
    const last = evaWindowData[evaWindowData.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [evaWindowData]);

  const totals = useMemo(() => {
    return monthly.reduce(
      (acc, m) => {
        acc.income += Number(m.income || 0);
        acc.expense += Number(m.expense || 0);
        acc.transfer += Number(m.transfer || 0);
        acc.savings += Number(m.savings || 0);
        return acc;
      },
      { income: 0, expense: 0, transfer: 0, savings: 0 }
    );
  }, [monthly]);

  const avg = useMemo(() => {
    const n = monthly.length || 1;
    return {
      income: totals.income / n,
      expense: totals.expense / n,
      transfer: totals.transfer / n,
      savings: totals.savings / n,
      balance: (totals.income - totals.expense - totals.transfer - totals.savings) / n,
    };
  }, [totals, monthly.length]);

  const saldoChartData = useMemo(() => saldoWindowData.map((m) => ({
    name: m.label, savingsRate: m.savingsRate, avg3: m.avg3, avg6: m.avg6,
  })), [saldoWindowData]);

  const evaChartData = useMemo(() => evaWindowData.map((m) => ({
    name: m.label, income: m.income, expense: m.expense,
  })), [evaWindowData]);

  const cashflowChartData = useMemo(() => evaWindowData.map((m) => ({
    name: m.label,
    income: m.income,
    expense: -m.expense,
    transfer: -m.transfer,
    savings: -m.savings,
  })), [evaWindowData]);

  const stackShapes = useMemo(() => ({
    expense: makeStackBarShape(themeColors.red),
    transfer: makeStackBarShape(themeColors.blue),
    savings: makeStackBarShape(themeColors.teal),
  }), [themeColors]);

  const highlights = useMemo(() => {
    if (!monthly.length) return null;
    const bestBalance = monthly.reduce((best, cur) => (cur.balance > best.balance ? cur : best), monthly[0]);
    return { bestBalance };
  }, [monthly]);

  const { fixedMonthly, changes, kpis } = useFixedCostTrend({
    entries: sourceEntries,
    recurringExpenses,
    monthly,
    monthStartDay,
  });
  const configuredTotal = (recurringExpenses || [])
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const savingsRate = useMemo(() => {
    return avg.income > 0 ? (avg.savings / avg.income) * 100 : 0;
  }, [avg]);


  const yoyData = useMemo(() => {
    const expenseMap = new Map();
    const transferMap = new Map();
    const savingsMap = new Map();
    const yearSet = new Set();
    for (const e of sourceEntries || []) {
      const ym = getEntryFinancialMonth(e, monthStartDay);
      if (!ym) continue;
      const [yStr, mStr] = ym.split("-");
      yearSet.add(yStr);
      const amt = Number(e.amount || 0);
      if (e.kind === "expense" && e.source === "month") {
        const b = expenseMap.get(mStr) || {};
        b[yStr] = (b[yStr] || 0) + amt;
        expenseMap.set(mStr, b);
      } else if (e.kind === "transfer") {
        const map = savingsPotIds.has(e.potId) ? savingsMap : transferMap;
        const b = map.get(mStr) || {};
        b[yStr] = (b[yStr] || 0) + amt;
        map.set(mStr, b);
      }
    }
    const activeMap = yoyMode === "savings" ? savingsMap : yoyMode === "transfer" ? transferMap : expenseMap;
    const years = [...yearSet].sort();
    return Array.from({ length: 12 }, (_, i) => {
      const mStr = String(i + 1).padStart(2, "0");
      const bucket = activeMap.get(mStr) || {};
      const row = { monthNum: mStr, label: MONTHS_SHORT[i] };
      for (const y of years) row[y] = bucket[y] ?? null;
      return row;
    });
  }, [sourceEntries, monthStartDay, savingsPotIds, yoyMode]);

  const yoyYears = useMemo(() => {
    if (!yoyData.length) return [];
    return Object.keys(yoyData[0]).filter((k) => /^\d{4}$/.test(k)).sort().slice(-3);
  }, [yoyData]);

  const colorForYear = (year) => {
    const idx = yoyYears.indexOf(year); // 0=ältestes, 2=aktuellstes
    return YOY_YEAR_COLORS[idx] ?? YOY_YEAR_COLORS[0];
  };

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="hb-section-title">Monatsvergleich & Trend</h2>
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
        </div>
      </div>

      {highlights ? (
        <div className="hb-stat-pills">
          <div className="hb-stat-pill hb-stat-pill--ok">
            <span className="hb-stat-pill-label">Ø Einnahmen / Monat</span>
            <span className="hb-stat-pill-value hb-ok" style={{ marginTop: 14 }}>{fmt(avg.income)}</span>
          </div>
          <div className="hb-stat-pill hb-stat-pill--bad">
            <span className="hb-stat-pill-label">Ø Ausgaben / Monat</span>
            <span className="hb-stat-pill-value hb-bad" style={{ marginTop: 14 }}>{fmt(avg.expense)}</span>
          </div>
          <div className={`hb-stat-pill ${savingsRate >= 0 ? "hb-stat-pill--ok" : "hb-stat-pill--bad"}`}>
            <span className="hb-stat-pill-label">Sparquote (Ø)</span>
            <span className={`hb-stat-pill-value ${savingsRate >= 0 ? "hb-ok" : "hb-bad"}`}>{savingsRate.toFixed(1)} %</span>
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
          <div className="hb-stat-pill hb-stat-pill--transfer">
            <span className="hb-stat-pill-label">Ø Rücklagen / Monat</span>
            <span className="hb-stat-pill-value hb-transfer" style={{ marginTop: 14 }}>{fmt(avg.transfer)}</span>
          </div>
          <div className="hb-stat-pill hb-stat-pill--ok">
            <span className="hb-stat-pill-label">Höchster Überschuss</span>
            <span className="hb-stat-pill-value hb-ok">{fmt(highlights.bestBalance.balance)}</span>
            <span className="hb-stat-pill-sub">{highlights.bestBalance.label}</span>
          </div>
        </div>
      ) : null}

      {monthly.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconTrend /></div>
              <div className="hb-empty-title">Noch keine Daten</div>
              <div className="hb-empty-text">Füge Einträge mit Datum hinzu, dann siehst du hier Trends.</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hb-two">
            <Card>
              <CardContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Sparquote / Monat</h3>
                    <div className="hb-chart-range" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, visibility: saldoMaxOffset > 0 ? "visible" : "hidden" }}>
                        <button type="button" className="hb-icon-btn" onClick={() => setSaldoScrollOffset((o) => Math.min(o + 1, saldoMaxOffset))} disabled={saldoScrollOffset >= saldoMaxOffset} title="Älteren Bereich anzeigen">‹</button>
                        <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{saldoWindowLabel}</span>
                        <button type="button" className="hb-icon-btn" onClick={() => setSaldoScrollOffset((o) => Math.max(o - 1, 0))} disabled={saldoScrollOffset === 0} title="Neueren Bereich anzeigen">›</button>
                      </div>
                      {monthly.length > 12 && (
                        <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                          {[["12", "12 M"], ["24", "24 M"], ["all", "Gesamt"]].map(([val, lbl]) => (
                            <button key={val} type="button" className={`hb-pill-tab ${saldoRangeOption === val ? "hb-pill-tab-active" : ""}`} onClick={() => { setSaldoRangeOption(val); setSaldoScrollOffset(0); }}>{lbl}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10" style={{ display: "block", flexShrink: 0 }}>
                        <line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.blue} strokeWidth="2.5" />
                      </svg>
                      Sparquote
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

                <div style={{ width: "100%", height: 280, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={saldoChartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)} %`} />
                      <Tooltip
                        wrapperStyle={{ zIndex: 10 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const labelMap = { savingsRate: "Sparquote", avg3: "3M Ø", avg6: "6M Ø" };
                          const colorMap = { savingsRate: themeColors.blue, avg3: "#f7630c", avg6: "#7160e8" };
                          return (
                            <div className="hb-chart-tooltip">
                              <span className="hb-chart-tooltip-label">{label}</span>
                              {payload.filter((p) => p.value != null).map((p) => (
                                <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
                                  <span style={{ color: colorMap[p.dataKey] }}>{labelMap[p.dataKey] || p.dataKey}</span>
                                  <span>{p.value.toFixed(1)} %</span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Line type="monotone" dataKey="savingsRate" dot={false} strokeWidth={2.5} stroke={themeColors.blue} />
                      <Line type="monotone" dataKey="avg3" dot={false} strokeWidth={1.5} stroke="#f7630c" strokeDasharray="5 3" />
                      <Line type="monotone" dataKey="avg6" dot={false} strokeWidth={1.5} stroke="#7160e8" strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Cashflow</h3>
                    <div className="hb-chart-range" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, visibility: evaMaxOffset > 0 ? "visible" : "hidden" }}>
                        <button type="button" className="hb-icon-btn" onClick={() => setEvaScrollOffset((o) => Math.min(o + 1, evaMaxOffset))} disabled={evaScrollOffset >= evaMaxOffset} title="Älteren Bereich anzeigen">‹</button>
                        <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{evaWindowLabel}</span>
                        <button type="button" className="hb-icon-btn" onClick={() => setEvaScrollOffset((o) => Math.max(o - 1, 0))} disabled={evaScrollOffset === 0} title="Neueren Bereich anzeigen">›</button>
                      </div>
                      {monthly.length > 12 && (
                        <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                          {[["12", "12 M"], ["24", "24 M"], ["all", "Gesamt"]].map(([val, lbl]) => (
                            <button key={val} type="button" className={`hb-pill-tab ${evaRangeOption === val ? "hb-pill-tab-active" : ""}`} onClick={() => { setEvaRangeOption(val); setEvaScrollOffset(0); }}>{lbl}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: themeColors.green }} />
                      Einnahmen
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: themeColors.red }} />
                      Ausgaben
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: themeColors.blue }} />
                      Rücklagen
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: themeColors.teal }} />
                      Sparen
                    </span>
                  </div>
                </div>

                <div style={{ width: "100%", height: 280, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={cashflowChartData} barCategoryGap="30%" barGap={-30}>
                      <CartesianGrid strokeDasharray="3 3" stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                      <ReferenceLine y={0} stroke={themeColors.muted} strokeOpacity={0.6} strokeWidth={1.5} />
                      <Tooltip
                        wrapperStyle={{ zIndex: 10 }}
                        content={(props) => <CashflowTooltip {...props} fmt={fmt} />}
                        cursor={{ fill: themeColors.blue, fillOpacity: 0.06 }}
                      />
                      <Bar dataKey="income" stackId="income" barSize={30} fill={themeColors.green} radius={[BAR_RADIUS, BAR_RADIUS, BAR_RADIUS, BAR_RADIUS]} isAnimationActive={false} />
                      <Bar dataKey="transfer" stackId="expense" barSize={30} isAnimationActive={false} shape={stackShapes.transfer} />
                      <Bar dataKey="expense" stackId="expense" barSize={30} isAnimationActive={false} shape={stackShapes.expense} />
                      <Bar dataKey="savings" stackId="expense" barSize={30} isAnimationActive={false} shape={stackShapes.savings} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

              </CardContent>
            </Card>
          </div>

          <div className="hb-full-card">
            <Card>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Jahresvergleich</h3>
                  <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                    {[["expense", "Ausgaben"], ["transfer", "Rücklagen"], ["savings", "Sparen"]].map(([val, lbl]) => (
                      <button key={val} type="button" className={`hb-pill-tab ${yoyMode === val ? "hb-pill-tab-active" : ""}`} onClick={() => setYoyMode(val)}>{lbl}</button>
                    ))}
                  </div>
                </div>
                {yoyYears.length >= 2 ? (
                  <>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                      {[...yoyYears].reverse().map((y) => (
                        <span key={y} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: colorForYear(y), flexShrink: 0 }} />
                          {y}
                        </span>
                      ))}
                    </div>
                    <div style={{ width: "100%", height: 260, marginTop: 4 }}>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={yoyData} barCategoryGap="20%" barGap={-2}>
                          <CartesianGrid strokeDasharray="3 3" stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            wrapperStyle={{ zIndex: 10 }}
                            content={(props) => <YoYTooltip {...props} fmt={fmt} />}
                            cursor={false}
                          />
                          {yoyYears.map((y) => (
                            <Bar key={y} dataKey={y} fill={colorForYear(y)} barSize={18} radius={[2, 2, 0, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="hb-muted" style={{ fontSize: 13, textAlign: "center" }}>
                      Noch nicht genug Daten für einen Jahresvergleich.<br />
                      Sobald Einträge aus mindestens zwei Jahren vorliegen, wird hier der Vergleich angezeigt.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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
