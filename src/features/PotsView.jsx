import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
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
  PieChart,
  Pie,
} from "recharts";
import { calcPotSeries } from "../utils/potUtils.js";
import { PIE_PALETTE, makeCategoryColorMap, CHART_COLORS } from "../utils/hbPalette.js";

function monthLabel(ym) {
  const [y, m] = String(ym).split("-");
  if (!y || !m) return ym;
  const mm = Number(m);
  const names = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  return `${names[mm - 1] || m} ${y}`;
}

export default function PotsView({ activeBook, entries, toCHF, onAddTransferEntry, transferCategories, todayISO, onEditEntry, onRemoveEntry }) {
  const pots = activeBook?.pots || [];
  const [selectedPotId, setSelectedPotId] = useState(pots[0]?.id || "");
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [newEntryDraft, setNewEntryDraft] = useState({
    date: "",
    amount: "",
    category: "",
    note: "",
  });

  const selectedPot = useMemo(() => {
    return pots.find((p) => p.id === selectedPotId) || pots[0] || null;
  }, [pots, selectedPotId]);

  // Topf-Entwicklung über Monate
  const potSeries = useMemo(() => {
    if (!selectedPot) return [];
    const series = calcPotSeries(entries, selectedPot.id);
    return series.map((d) => ({ ...d, label: monthLabel(d.month) }));
  }, [entries, selectedPot]);

  // Aktueller Stand
  const currentBalance = useMemo(() => {
    if (!potSeries.length) return 0;
    return potSeries[potSeries.length - 1]?.balance || 0;
  }, [potSeries]);

  // Summen (gesamt über alle Monate)
  const totals = useMemo(() => {
    return potSeries.reduce(
      (acc, m) => {
        acc.transfersIn += Number(m.transfersIn || 0);
        acc.expensesOut += Number(m.expensesOut || 0);
        return acc;
      },
      { transfersIn: 0, expensesOut: 0 }
    );
  }, [potSeries]);

  // Chart-Daten für LineChart (kumulierte Balance)
  const lineChartData = useMemo(() => {
    return potSeries.map((d) => ({
      name: d.label,
      balance: d.balance,
    }));
  }, [potSeries]);

  // Chart-Daten für BarChart (Ein-/Auszahlungen pro Monat)
  const barChartData = useMemo(() => {
    return potSeries.map((d) => ({
      name: d.label,
      transfersIn: d.transfersIn,
      expensesOut: d.expensesOut,
    }));
  }, [potSeries]);

  // Transfer-Kategorien Auswertung (Pie Chart) — Netto: Einzahlungen minus Entnahmen je Zweck
  const transfersByCategory = useMemo(() => {
    if (!selectedPot) return [];

    const map = new Map();

    for (const e of entries || []) {
      if (e.potId !== selectedPot.id) continue;
      const cat = String(e.category || "Sonstiges").trim();
      const prev = map.get(cat) || 0;
      if (e.kind === "transfer") {
        map.set(cat, prev + Number(e.amount || 0));
      } else if (e.kind === "withdrawal") {
        map.set(cat, prev - Number(e.amount || 0));
      }
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [entries, selectedPot]);

  const transferCatColor = useMemo(() => {
    const names = transfersByCategory.map((d) => d.name);
    return makeCategoryColorMap(names, PIE_PALETTE);
  }, [transfersByCategory]);

  // Alle Einzelbuchungen (Transfers + Entnahmen) für den gewählten Topf
  const potEntries = useMemo(() => {
    if (!selectedPot) return [];
    return (entries || [])
      .filter((e) => e.potId === selectedPot.id && (e.kind === "transfer" || e.kind === "withdrawal"))
      .sort((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da !== db) return db.localeCompare(da);
        return Number(b.id) - Number(a.id);
      });
  }, [entries, selectedPot]);

  // Highlights
  const highlights = useMemo(() => {
    if (!potSeries.length) return null;

    const topTransfer = potSeries.reduce(
      (best, cur) => (cur.transfersIn > best.transfersIn ? cur : best),
      potSeries[0]
    );

    const topExpense = potSeries.reduce(
      (best, cur) => (cur.expensesOut > best.expensesOut ? cur : best),
      potSeries[0]
    );

    return { topTransfer, topExpense };
  }, [potSeries]);

  if (!selectedPot) {
    return (
      <Card>
        <CardContent>
          <p className="hb-muted">Keine Töpfe vorhanden.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Topf-Übersicht</h2>
          <div className="hb-muted">Entwicklung & Zusammensetzung deiner Transfers</div>
        </div>

        <div className="hb-group">
          <label className="hb-muted">Topf</label>
          <select
            className="hb-input"
            value={selectedPotId}
            onChange={(e) => setSelectedPotId(e.target.value)}
          >
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.name}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              setNewEntryDraft({
                date: todayISO(),
                amount: "",
                category: transferCategories[0] || "Steuern",
                note: "",
              });
              setAddEntryOpen(true);
            }}
          >
            + Buchung hinzufügen
          </Button>
        </div>
      </div>

      {/* Aktueller Stand - groß & prominent */}
      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <div style={{ textAlign: "center" }}>
            <div className="hb-muted" style={{ marginBottom: 8 }}>
              Aktueller Stand · {selectedPot.name}
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: currentBalance >= 0 ? "var(--green)" : "var(--red)",
              }}
            >
              {toCHF(currentBalance)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Highlights */}
      {highlights && potSeries.length > 0 ? (
        <div className="hb-note" style={{ marginBottom: 12 }}>
          <strong>Highlights:</strong> Höchste Einzahlung:{" "}
          <strong>{highlights.topTransfer.label}</strong> ({toCHF(highlights.topTransfer.transfersIn)}
          ), höchste Entnahme: <strong>{highlights.topExpense.label}</strong> (
          {toCHF(highlights.topExpense.expensesOut)}).
        </div>
      ) : null}

      {potSeries.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-muted">
              Noch keine Bewegungen in diesem Topf. Buche einen Transfer, um die Entwicklung zu
              sehen.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summen */}
          <div className="hb-two" style={{ marginBottom: 16 }}>
            <Card>
              <CardContent>
                <div className="hb-muted">Summe Einzahlungen</div>
                <div className="hb-stat-val hb-ok" style={{ marginTop: 8 }}>
                  +{toCHF(totals.transfersIn)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="hb-muted">Summe Entnahmen</div>
                <div className="hb-stat-val hb-bad" style={{ marginTop: 8 }}>
                  -{toCHF(totals.expensesOut)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="hb-two">
            {/* LineChart: Stand über Zeit */}
            <Card>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "baseline", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Entwicklung</h3>
                  <div className="hb-muted">Topf-Stand über Monate</div>
                </div>

                <div style={{ width: "100%", height: 280, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={lineChartData}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => toCHF(v)} />
                      <Line
                        type="monotone"
                        dataKey="balance"
                        stroke={CHART_COLORS.income}
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="hb-note">
                  Zeigt den kumulierten Stand des Topfes. Steigt = mehr Transfers, fällt = Entnahmen.
                </div>
              </CardContent>
            </Card>

            {/* BarChart: Ein-/Auszahlungen */}
            <Card>
              <CardContent>
                <div className="hb-row" style={{ alignItems: "baseline", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Ein-/Auszahlungen</h3>
                  <div className="hb-muted">Pro Monat</div>
                </div>

                <div style={{ width: "100%", height: 280, marginTop: 8 }}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barChartData} barCategoryGap={12}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => toCHF(v)} />
                      <Bar dataKey="transfersIn" barSize={12}>
                        {barChartData.map((d, i) => (
                          <Cell key={`t-${i}`} fill={CHART_COLORS.income} />
                        ))}
                      </Bar>
                      <Bar dataKey="expensesOut" barSize={12}>
                        {barChartData.map((d, i) => (
                          <Cell key={`e-${i}`} fill={CHART_COLORS.expense} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="hb-note">
                  Grün = Einzahlungen (Transfers), Rot = Entnahmen.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pie Chart: Transfer-Kategorien */}
          {transfersByCategory.length > 0 && (
            <Card style={{ marginTop: 16 }}>
              <CardContent>
                <h3 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>
                  Zusammensetzung nach Zweck
                </h3>

                <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ minHeight: 260 }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={transfersByCategory}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {transfersByCategory.map((d) => (
                            <Cell key={d.name} fill={transferCatColor.get(d.name)} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val) => toCHF(val)}
                          labelFormatter={(label) => `Zweck: ${label}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="hb-legend">
                    <div className="hb-legend-title">Legende</div>
                    {transfersByCategory.map((d) => (
                      <div key={d.name} className="hb-legend-row">
                        <div className="hb-legend-left">
                          <span
                            className="hb-dot"
                            style={{ background: transferCatColor.get(d.name) }}
                          />
                          <span className="hb-small">{d.name}</span>
                        </div>
                        <span className="hb-muted">{toCHF(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hb-note">
                  Aktueller Netto-Stand pro Transferzweck (Einzahlungen minus Entnahmen).
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Buchungsliste für diesen Topf */}
      <Card style={{ marginTop: 16 }}>
        <CardContent>
          <div className="hb-row" style={{ alignItems: "baseline", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Buchungen: {selectedPot.name}</h3>
            <div className="hb-muted">{potEntries.length} Einträge</div>
          </div>

          {potEntries.length === 0 ? (
            <p className="hb-muted">Noch keine Buchungen für diesen Topf.</p>
          ) : (
            <div className="hb-table-wrap">
              <table className="hb-table hb-entries-table">
                <thead>
                  <tr>
                    <th className="hb-col-date">Datum</th>
                    <th className="hb-col-type">Art</th>
                    <th className="hb-col-category">Zweck</th>
                    <th className="hb-col-note">Notiz</th>
                    <th className="hb-col-amount hb-right">Betrag</th>
                    <th className="hb-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {potEntries.map((e) => {
                    const isTransfer = e.kind === "transfer";
                    return (
                      <tr key={e.id}>
                        <td className="hb-col-date">{e.date}</td>
                        <td className="hb-col-type">{isTransfer ? "Einzahlung" : "Entnahme"}</td>
                        <td className="hb-col-category">{e.category || "—"}</td>
                        <td className="hb-col-note">{e.note || "—"}</td>
                        <td className={`hb-col-amount hb-right ${isTransfer ? "hb-ok" : "hb-bad"}`}>
                          {isTransfer ? "+" : "−"}{toCHF(Number(e.amount || 0))}
                        </td>
                        <td className="hb-col-actions">
                          <div className="hb-actions">
                            <Button variant="outline" onClick={() => onEditEntry?.(e)}>
                              Bearbeiten
                            </Button>
                            <Button variant="outline" onClick={() => onRemoveEntry?.(e.id)}>
                              Löschen
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDialog
        open={addEntryOpen}
        title="Transfer-Buchung hinzufügen"
        onClose={() => setAddEntryOpen(false)}
        onSave={() => {
          const numericAmount = parseFloat(newEntryDraft.amount.replace(",", "."));
          if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
          if (!newEntryDraft.date || !selectedPot) return;

          const entry = {
            id: Date.now(),
            date: newEntryDraft.date,
            amount: numericAmount,
            category: newEntryDraft.category,
            kind: "transfer",
            potId: selectedPot.id,
            note: newEntryDraft.note.trim(),
          };

          onAddTransferEntry(entry);
          setAddEntryOpen(false);
        }}
        canSave={
          newEntryDraft.date &&
          newEntryDraft.amount &&
          parseFloat(newEntryDraft.amount.replace(",", ".")) > 0
        }
        saveLabel="Hinzufügen"
      >
        <div className="hb-form">
          <div className="hb-field">
            <div className="hb-label">Datum</div>
            <input
              className="hb-input"
              type="date"
              value={newEntryDraft.date}
              onChange={(e) => setNewEntryDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Betrag (CHF)</div>
            <input
              className="hb-input"
              type="text"
              inputMode="decimal"
              placeholder="z.B. 100.50"
              value={newEntryDraft.amount}
              onChange={(e) => setNewEntryDraft((d) => ({ ...d, amount: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Transfer-Zweck</div>
            <select
              className="hb-input"
              value={newEntryDraft.category}
              onChange={(e) => setNewEntryDraft((d) => ({ ...d, category: e.target.value }))}
            >
              {transferCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="hb-field">
            <div className="hb-label">Notiz (optional)</div>
            <input
              className="hb-input"
              type="text"
              placeholder="z.B. Anfangsbestand, Übertrag..."
              value={newEntryDraft.note}
              onChange={(e) => setNewEntryDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">In Topf</div>
            <input
              className="hb-input"
              type="text"
              value={selectedPot?.name || ""}
              disabled
              style={{ background: "var(--hover-bg)", color: "var(--muted)" }}
            />
          </div>
        </div>
      </EditDialog>
    </div>
  );
}