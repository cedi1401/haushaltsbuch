import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import PotsManager from "./PotsManager.jsx";
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
import { TRANSFER_PALETTE } from "../utils/hbPalette.js";
import { formatDateDE, parseAmount } from "../utils/hbUtils.js";
import { formatYearMonth } from "../utils/financialMonthUtils.js";
import { generateId } from "../utils/idUtils.js";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import {
  IconEdit,
  IconDelete,
  IconPots,
  IconPlus,
  IconInbox,
} from "../components/icons.jsx";

const monthLabel = formatYearMonth;

export default function PotsView({ activeBook, entries, baseCurrency = "CHF", onAddTransferEntry, onUpdateBook, transferCategories, todayISO, onEditEntry, onRemoveEntry, monthStartDay = 1 }) {
  const fmt = useFmt();
  const pots = useMemo(() => activeBook?.pots || [], [activeBook?.pots]);
  const [selectedPotId, setSelectedPotId] = useState(pots[0]?.id || "");
  const themeColors = useThemeColors();
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [managePotsOpen, setManagePotsOpen] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
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
    const series = calcPotSeries(entries, selectedPot.id, monthStartDay);
    return series.map((d) => ({ ...d, label: monthLabel(d.month) }));
  }, [entries, selectedPot, monthStartDay]);

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

    const result = [];
    for (const [name, value] of map) {
      if (value > 0) result.push({ name, value });
    }
    return result.toSorted((a, b) => b.value - a.value);
  }, [entries, selectedPot]);

  const transferCatColor = useMemo(() => {
    const map = new Map();
    transfersByCategory.forEach((d, i) => {
      map.set(d.name, TRANSFER_PALETTE[i % TRANSFER_PALETTE.length]);
    });
    return map;
  }, [transfersByCategory]);

  // Alle Einzelbuchungen (Transfers + Entnahmen) für den gewählten Topf
  const potEntries = useMemo(() => {
    if (!selectedPot) return [];
    return (entries || [])
      .filter((e) => e.potId === selectedPot.id && (e.kind === "transfer" || e.kind === "withdrawal"))
      .toSorted((a, b) => {
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
      <>
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconPots /></div>
              <div className="hb-empty-title">Noch keine Töpfe</div>
              <div className="hb-empty-text">
                Töpfe sind Sparbehälter für Rücklagen oder bestimmte Sparziele.
                Lege deinen ersten Topf an.
              </div>
              <Button onClick={() => setManagePotsOpen(true)}>
                <IconPots /> Töpfe verwalten
              </Button>
            </div>
          </CardContent>
        </Card>
        <EditDialog
          open={managePotsOpen}
          title="Töpfe verwalten"
          onClose={() => setManagePotsOpen(false)}
          onSave={() => setManagePotsOpen(false)}
          canSave={true}
          saveLabel="Schließen"
        >
          <PotsManager activeBook={activeBook} onUpdateBook={onUpdateBook} />
        </EditDialog>
      </>
    );
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Entwicklung & Zusammensetzung deiner Transfers</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={() => setManagePotsOpen(true)}>
            <IconPots /> Töpfe verwalten
          </Button>
          <Button
            onClick={() => {
              setNewEntryDraft({
                date: todayISO(),
                amount: "",
                category: transferCategories[0] || "",
                note: "",
              });
              setAddEntryOpen(true);
            }}
          >
            <IconPlus /> Buchung hinzufügen
          </Button>
        </div>
      </div>

      {/* Pot-Auswahl als Tab-Gruppe statt Dropdown */}
      {pots.length > 1 && (
        <div className="hb-pill-tabs" role="tablist" aria-label="Topf wählen" style={{ marginBottom: 16 }}>
          {pots.map((pot) => (
            <button
              key={pot.id}
              type="button"
              role="tab"
              aria-selected={selectedPotId === pot.id}
              className={`hb-pill-tab ${selectedPotId === pot.id ? "hb-pill-tab-active" : ""}`}
              onClick={() => { setSelectedPotId(pot.id); setShowAllEntries(false); }}
            >
              {pot.name}
            </button>
          ))}
        </div>
      )}

      {/* Top-Stat-Tiles: Aktueller Stand + Einzahlungen + Entnahmen */}
      <div className="hb-stat-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Aktueller Stand</div>
          <div
            className={`hb-stat-tile-value ${currentBalance >= 0 ? "hb-ok" : "hb-bad"}`}
          >
            {fmt(currentBalance)}
          </div>
          <div className="hb-muted" style={{ marginTop: 4, fontSize: 12 }}>
            {selectedPot.name}
          </div>
        </div>
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Summe Einzahlungen</div>
          <div className="hb-stat-tile-value hb-ok">+{fmt(totals.transfersIn)}</div>
        </div>
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Summe Entnahmen</div>
          <div className="hb-stat-tile-value hb-bad">-{fmt(totals.expensesOut)}</div>
        </div>
      </div>

      {/* Highlights als Stat-Pills */}
      {highlights && potSeries.length > 0 ? (
        <div className="hb-stat-pills">
          <div className="hb-stat-pill">
            <span className="hb-stat-pill-label">Höchste Einzahlung</span>
            <span className="hb-stat-pill-value hb-ok">+{fmt(highlights.topTransfer.transfersIn)}</span>
            <span className="hb-muted">· {highlights.topTransfer.label}</span>
          </div>
          <div className="hb-stat-pill">
            <span className="hb-stat-pill-label">Höchste Entnahme</span>
            <span className="hb-stat-pill-value hb-bad">-{fmt(highlights.topExpense.expensesOut)}</span>
            <span className="hb-muted">· {highlights.topExpense.label}</span>
          </div>
        </div>
      ) : null}

      {potSeries.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconInbox /></div>
              <div className="hb-empty-title">Keine Bewegungen</div>
              <div className="hb-empty-text">
                In diesem Topf gab es noch keine Buchungen. Lege eine erste Einzahlung an,
                um die Entwicklung zu sehen.
              </div>
              <Button
                onClick={() => {
                  setNewEntryDraft({
                    date: todayISO(),
                    amount: "",
                    category: transferCategories[0] || "",
                    note: "",
                  });
                  setAddEntryOpen(true);
                }}
              >
                <IconPlus /> Buchung hinzufügen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
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
                      <Tooltip wrapperStyle={{ zIndex: 10 }} formatter={(v) => fmt(v)} />
                      <Line
                        type="monotone"
                        dataKey="balance"
                        stroke={themeColors.green}
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
                      <Tooltip wrapperStyle={{ zIndex: 10 }} formatter={(v) => fmt(v)} />
                      <Bar dataKey="transfersIn" barSize={12} fill={themeColors.green} />
                      <Bar dataKey="expensesOut" barSize={12} fill={themeColors.red} />
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
                          startAngle={90}
                          endAngle={-270}
                        >
                          {transfersByCategory.map((d) => (
                            <Cell key={d.name} fill={transferCatColor.get(d.name)} />
                          ))}
                        </Pie>
                        <Tooltip
                          wrapperStyle={{ zIndex: 10 }}
                          formatter={(val) => fmt(val)}
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
                        <span className="hb-muted">{fmt(d.value)}</span>
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
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconInbox /></div>
              <div className="hb-empty-title">Noch keine Buchungen</div>
              <div className="hb-empty-text">
                Für diesen Topf gibt es noch keine Bewegungen.
              </div>
            </div>
          ) : (
            <>
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
                    {(showAllEntries ? potEntries : potEntries.slice(0, 5)).map((e) => {
                      const isTransfer = e.kind === "transfer";
                      return (
                        <tr key={e.id}>
                          <td className="hb-col-date">{formatDateDE(e.date)}</td>
                          <td className="hb-col-type">{isTransfer ? "Einzahlung" : "Entnahme"}</td>
                          <td className="hb-col-category">{e.category || "—"}</td>
                          <td className="hb-col-note">{e.note || "—"}</td>
                          <td className={`hb-col-amount hb-right ${isTransfer ? "hb-ok" : "hb-bad"}`}>
                            {isTransfer ? "+" : "−"}{fmt(Number(e.amount || 0))}
                          </td>
                          <td className="hb-col-actions">
                            <div className="hb-actions hb-actions-hover">
                              <button
                                type="button"
                                className="hb-icon-btn"
                                onClick={() => onEditEntry?.(e)}
                                title="Bearbeiten"
                                aria-label="Bearbeiten"
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className="hb-icon-btn"
                                onClick={() => onRemoveEntry?.(e.id)}
                                title="Löschen"
                                aria-label="Löschen"
                              >
                                <IconDelete />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {potEntries.length > 5 && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <button
                    type="button"
                    className="hb-btn-ghost"
                    onClick={() => setShowAllEntries((v) => !v)}
                  >
                    {showAllEntries
                      ? "Weniger anzeigen"
                      : `Weitere ${potEntries.length - 5} anzeigen`}
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <EditDialog
        open={managePotsOpen}
        title="Töpfe verwalten"
        onClose={() => setManagePotsOpen(false)}
        onSave={() => setManagePotsOpen(false)}
        canSave={true}
        saveLabel="Schließen"
      >
        <PotsManager activeBook={activeBook} onUpdateBook={onUpdateBook} />
      </EditDialog>

      <EditDialog
        open={addEntryOpen}
        title="Transfer-Buchung hinzufügen"
        onClose={() => setAddEntryOpen(false)}
        onSave={() => {
          const numericAmount = parseAmount(newEntryDraft.amount);
          if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
          if (!newEntryDraft.date || !selectedPot) return;

          const entry = {
            id: generateId("entry"),
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
          parseAmount(newEntryDraft.amount) > 0 &&
          Boolean(newEntryDraft.category)
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
            <div className="hb-label">Betrag ({baseCurrency})</div>
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
