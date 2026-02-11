import React, { useMemo, useState } from "react";
import { Card, CardContent } from "../components/ui.jsx";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { CHART_COLORS } from "../utils/hbPalette.js";

function monthLabel(ym) {
  const [y, m] = String(ym).split("-");
  if (!y || !m) return ym;
  const mm = Number(m);
  const names = [
    "Jan",
    "Feb",
    "Mär",
    "Apr",
    "Mai",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
    "Dez",
  ];
  return `${names[mm - 1] || m} ${y}`;
}

function yyyymmFromDate(dateStr) {
  if (typeof dateStr !== "string") return "";
  return dateStr.length >= 7 ? dateStr.slice(0, 7) : "";
}

export default function TrendView({ entries, entriesAll, toCHF }) {
  const [range, setRange] = useState(12); // months
  const hasAll = Array.isArray(entriesAll) && entriesAll.length > 0;
  const [userScope, setUserScope] = useState("book"); // "book" | "all"

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
      const ym = yyyymmFromDate(e.date);
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

    const take = Math.max(3, Number(range) || 12);
    return arr.slice(-take).map((d) => ({ ...d, label: monthLabel(d.month) }));
  }, [sourceEntries, range]);

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
    }));
  }, [monthly]);

  // Mini-Polish: kurze Highlights
  const highlights = useMemo(() => {
    if (!monthly.length) return null;
    const topExpense = monthly.reduce((best, cur) => (cur.expense > best.expense ? cur : best), monthly[0]);
    const topIncome = monthly.reduce((best, cur) => (cur.income > best.income ? cur : best), monthly[0]);
    const bestBalance = monthly.reduce((best, cur) => (cur.balance > best.balance ? cur : best), monthly[0]);
    return { topExpense, topIncome, bestBalance };
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
          <label className="hb-muted">Quelle</label>
          <select
            className="hb-input"
            value={userScope}
            onChange={(e) => setUserScope(e.target.value)}
            disabled={!hasAll}
            title={!hasAll ? "Keine Daten über mehrere Bücher verfügbar." : undefined}
          >
            <option value="book">Aktives Buch</option>
            <option value="all">Alle Bücher</option>
          </select>

          <label className="hb-muted">Zeitraum</label>
          <select className="hb-input" value={range} onChange={(e) => setRange(Number(e.target.value))}>
            <option value={6}>Letzte 6 Monate</option>
            <option value={12}>Letzte 12 Monate</option>
            <option value={24}>Letzte 24 Monate</option>
          </select>
        </div>
      </div>

      {highlights ? (
        <div className="hb-note" style={{ marginTop: -2, marginBottom: 12 }}>
          <strong>Highlights:</strong>{" "}
          Top-Ausgabenmonat <strong>{highlights.topExpense.label}</strong> ({toCHF(highlights.topExpense.expense)}),
          Top-Einnahmenmonat <strong>{highlights.topIncome.label}</strong> ({toCHF(highlights.topIncome.income)}),
          bester Saldo <strong>{highlights.bestBalance.label}</strong> ({toCHF(highlights.bestBalance.balance)}).
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
          <div className="hb-two" style={{ marginBottom: 16 }}>
            <Card>
              <CardContent>
                <div className="hb-muted">Durchschnitt / Monat</div>
                <div className="hb-grid-3" style={{ marginTop: 10 }}>
                  <div>
                    <div className="hb-stat-title">Einnahmen</div>
                    <div className="hb-stat-val hb-ok">+{toCHF(avg.income)}</div>
                  </div>
                  <div>
                    <div className="hb-stat-title">Ausgaben</div>
                    <div className="hb-stat-val hb-bad">-{toCHF(avg.expense)}</div>
                  </div>
                  <div>
                    <div className="hb-stat-title">Saldo</div>
                    <div className={`hb-stat-val ${avg.balance >= 0 ? "hb-ok" : "hb-bad"}`}>{toCHF(avg.balance)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="hb-muted">Summe (Zeitraum)</div>
                <div className="hb-grid-3" style={{ marginTop: 10 }}>
                  <div>
                    <div className="hb-stat-title">Einnahmen</div>
                    <div className="hb-stat-val hb-ok">+{toCHF(totals.income)}</div>
                  </div>
                  <div>
                    <div className="hb-stat-title">Ausgaben</div>
                    <div className="hb-stat-val hb-bad">-{toCHF(totals.expense)}</div>
                  </div>
                  <div>
                    <div className="hb-stat-title">Saldo</div>
                    <div className={`hb-stat-val ${totals.income - totals.expense >= 0 ? "hb-ok" : "hb-bad"}`}>{toCHF(totals.income - totals.expense)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="hb-two">
            <Card>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "baseline" }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Saldo-Trend</h3>
                  <div className="hb-muted">Linie: Saldo pro Monat</div>
                </div>

                <div style={{ width: "100%", height: 280, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => toCHF(v)} />
                      <Line type="monotone" dataKey="balance" dot={false} strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="hb-note">Tipp: Wenn die Linie fällt, steigen die Ausgaben oder die Einnahmen sinken.</div>
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
                      <Tooltip formatter={(v) => toCHF(v)} />
                      <Bar dataKey="income" barSize={12}>
                        {chartData.map((d) => (
                          <Cell key={`i-${d.name}`} fill={CHART_COLORS.income} />
                        ))}
                      </Bar>
                      <Bar dataKey="expense" barSize={12}>
                        {chartData.map((d) => (
                          <Cell key={`e-${d.name}`} fill={CHART_COLORS.expense} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="hb-note">Einnahmen grün, Ausgaben rot. (Zwei Balken pro Monat.)</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
