import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import PotsManager from "./PotsManager.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
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
  CartesianGrid,
  ReferenceLine,
  PieChart,
  Pie,
} from "recharts";
import { calcPotSeries } from "../utils/potUtils.js";
import { TRANSFER_PALETTE } from "../utils/hbPalette.js";
import { IncomeBarShape, OutflowBarShape } from "../utils/chartShapes.jsx";
import { formatDateDE, parseAmount, todayISO, formatCurrencyCompact, formatCurrencyAxis } from "../utils/hbUtils.js";
import { formatYearMonth } from "../utils/financialMonthUtils.js";
import { generateId } from "../utils/idUtils.js";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { useCardBg } from "../hooks/useCardBg.js";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import {
  IconEdit,
  IconDelete,
  IconPots,
  IconPlus,
  IconInbox,
  IconCheck,
} from "../components/icons.jsx";

const fmtYearMonth = formatYearMonth;

export default function PotsView({ activeBook, entries, onAddTransferEntry, onUpdateBook, transferCategories, onEditEntry, onRemoveEntry, monthStartDay = 1, monthFilter, monthLabel }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const pots = useMemo(() => activeBook?.pots || [], [activeBook?.pots]);
  const [selectedPotId, setSelectedPotId] = useState(pots[0]?.id || "");
  const themeColors = useThemeColors();
  const cardBg = useCardBg();
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [managePotsOpen, setManagePotsOpen] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [lineRangeOption, setLineRangeOption] = useState("12");
  const [lineScrollOffset, setLineScrollOffset] = useState(0);
  const [barRangeOption, setBarRangeOption] = useState("12");
  const [barScrollOffset, setBarScrollOffset] = useState(0);
  const [newEntryDraft, setNewEntryDraft] = useState({
    date: "",
    amount: "",
    category: "",
    note: "",
  });

  const selectedPot = useMemo(() => {
    return pots.find((p) => p.id === selectedPotId) || pots[0] || null;
  }, [pots, selectedPotId]);

  // Topf-Dropdown (Titel als aufklappbares Menü, Muster wie im Kostenrechner)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const menuListRef = useRef(null);
  useClickOutside(menuWrapRef, () => setMenuOpen(false), { enabled: menuOpen });

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setMenuOpen(false); menuTriggerRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && menuListRef.current) {
      const active = menuListRef.current.querySelector("[role='menuitemradio'][aria-checked='true']");
      (active || menuListRef.current.querySelector("[role='menuitemradio']"))?.focus();
    }
  }, [menuOpen]);

  function handleMenuKeyDown(e) {
    const focusable = Array.from(
      menuListRef.current?.querySelectorAll("[role='menuitemradio']") ?? []
    );
    const idx = focusable.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusable[(idx + 1) % focusable.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusable[(idx - 1 + focusable.length) % focusable.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      focusable[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      focusable[focusable.length - 1]?.focus();
    }
  }

  function selectPot(id) {
    setSelectedPotId(id);
    setShowAllEntries(false);
    setLineScrollOffset(0);
    setBarScrollOffset(0);
    setMenuOpen(false);
    menuTriggerRef.current?.focus();
  }

  // Topf-Entwicklung über Monate
  const potSeries = useMemo(() => {
    if (!selectedPot) return [];
    const series = calcPotSeries(entries, selectedPot.id, monthStartDay);
    return series.map((d) => ({ ...d, label: fmtYearMonth(d.month) }));
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

  const lineRangePool = useMemo(() => {
    if (lineRangeOption === "12") return potSeries.slice(-12);
    if (lineRangeOption === "24") return potSeries.slice(-24);
    return potSeries;
  }, [potSeries, lineRangeOption]);
  const lineMaxOffset = Math.max(0, lineRangePool.length - 12);
  const lineWindowData = useMemo(() => {
    const start = Math.max(0, lineRangePool.length - 12 - lineScrollOffset);
    return lineRangePool.slice(start, start + 12);
  }, [lineRangePool, lineScrollOffset]);
  const lineWindowLabel = useMemo(() => {
    if (!lineWindowData.length) return "";
    const first = lineWindowData[0].label;
    const last = lineWindowData[lineWindowData.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [lineWindowData]);

  const barRangePool = useMemo(() => {
    if (barRangeOption === "12") return potSeries.slice(-12);
    if (barRangeOption === "24") return potSeries.slice(-24);
    return potSeries;
  }, [potSeries, barRangeOption]);
  const barMaxOffset = Math.max(0, barRangePool.length - 12);
  const barWindowData = useMemo(() => {
    const start = Math.max(0, barRangePool.length - 12 - barScrollOffset);
    return barRangePool.slice(start, start + 12);
  }, [barRangePool, barScrollOffset]);
  const barWindowLabel = useMemo(() => {
    if (!barWindowData.length) return "";
    const first = barWindowData[0].label;
    const last = barWindowData[barWindowData.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [barWindowData]);

  const lineChartData = useMemo(() => lineWindowData.map((d) => ({
    name: d.label, balance: d.balance,
  })), [lineWindowData]);

  const barChartData = useMemo(() => barWindowData.map((d) => ({
    name: d.label,
    transfersIn: d.transfersIn,       // grün nach oben (Einzahlungen rein)
    expensesOut: -(d.expensesOut),    // rot nach unten (Entnahmen raus)
    rawOut: d.expensesOut,            // Rohwert (positiv) fürs Tooltip
  })), [barWindowData]);

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

  // Farbe folgt dem Zweck (Entität), nicht dem aktuellen Wert-Rang. Sonst
  // repainten sich die Donut-Segmente, sobald sich die Zusammensetzung (und
  // damit die Sortierung) ändert (recolor-on-filter). Stabile Reihenfolge:
  // zuerst die kanonische Transfer-Kategorienliste des Buchs, danach unbekannte
  // Zwecke (z.B. „Sonstiges") alphabetisch angehängt. So behält ein Zweck über
  // Zeit dieselbe Farbe aus dem Blau-Ramp („alle Transfers eine Familie").
  const transferCatColor = useMemo(() => {
    const order = [];
    const seen = new Set();
    for (const cat of transferCategories || []) {
      const name = String(cat).trim();
      if (name && !seen.has(name)) { seen.add(name); order.push(name); }
    }
    for (const d of [...transfersByCategory].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!seen.has(d.name)) { seen.add(d.name); order.push(d.name); }
    }
    const map = new Map();
    order.forEach((name, i) => {
      map.set(name, TRANSFER_PALETTE[i % TRANSFER_PALETTE.length]);
    });
    return map;
  }, [transferCategories, transfersByCategory]);

  // Alle Einzelbuchungen (Transfers + Entnahmen) für den gewählten Topf, optional nach Monat gefiltert
  const potEntries = useMemo(() => {
    if (!selectedPot) return [];
    return (entries || [])
      .filter((e) => {
        if (e.potId !== selectedPot.id) return false;
        if (e.kind !== "transfer" && e.kind !== "withdrawal") return false;
        if (monthFilter && e.date && !String(e.date).startsWith(monthFilter)) return false;
        return true;
      })
      .toSorted((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da !== db) return db.localeCompare(da);
        return Number(b.id) - Number(a.id);
      });
  }, [entries, selectedPot, monthFilter]);

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
          saveLabel="Schliessen"
        >
          <PotsManager activeBook={activeBook} onUpdateBook={onUpdateBook} />
        </EditDialog>
      </>
    );
  }

  return (
    <div>
      <div className="hb-row" style={{ marginBottom: 16, alignItems: "center" }}>
        {/* Topf-Auswahl als aufklappbares Dropdown (Muster wie im Kostenrechner) */}
        <div className="hb-cg-group-menu" ref={menuWrapRef}>
          <button
            ref={menuTriggerRef}
            type="button"
            className="hb-cg-group-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            title="Topf wechseln"
          >
            <span className="hb-cg-group-trigger-name">{selectedPot.name}</span>
            <svg
              className={"hb-cg-group-chevron" + (menuOpen ? " hb-cg-group-chevron--open" : "")}
              width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"
            >
              <path d="M4.5 6L8 9.5L11.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="hb-cg-group-list"
              role="menu"
              aria-orientation="vertical"
              ref={menuListRef}
              onKeyDown={handleMenuKeyDown}
            >
              {pots.map((pot) => {
                const isActive = selectedPot?.id === pot.id;
                return (
                  <button
                    key={pot.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    className={"hb-cg-group-item" + (isActive ? " hb-cg-group-item--active" : "")}
                    onClick={() => selectPot(pot.id)}
                  >
                    <span className="hb-cg-group-item-name">{pot.name}</span>
                    {isActive && <IconCheck width={16} height={16} className="hb-cg-group-item-check" />}
                  </button>
                );
              })}
            </div>
          )}
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

      {/*
        Kopf-Block: KPIs (5 Spalten) — 3 Kennzahlen + 2 Highlights in EINER Zeile.
        Statt zweier getrennter Voll-Breiten-Streifen ergibt das eine ruhige,
        zusammenhängende Übersicht. Bricht via auto-fit/minmax responsiv um.
      */}
      <div className="hb-stat-pills" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="hb-stat-pill hb-stat-pill--ok">
          <div className="hb-stat-pill-label">Summe Einzahlungen</div>
          <div className="hb-stat-pill-value hb-ok" style={{ marginTop: 14 }}>+{fmt(totals.transfersIn)}</div>
        </div>
        <div className="hb-stat-pill hb-stat-pill--bad">
          <div className="hb-stat-pill-label">Summe Entnahmen</div>
          <div className="hb-stat-pill-value hb-bad" style={{ marginTop: 14 }}>-{fmt(totals.expensesOut)}</div>
        </div>
        <div className={`hb-stat-pill ${currentBalance >= 0 ? "hb-stat-pill--ok" : "hb-stat-pill--bad"}`}>
          <div className="hb-stat-pill-label">Aktueller Stand</div>
          <div className={`hb-stat-pill-value ${currentBalance >= 0 ? "hb-ok" : "hb-bad"}`} style={{ marginTop: 14 }}>
            {fmt(currentBalance)}
          </div>
        </div>

        {/*
          Highlight-Pills immer rendern — auch bei leerem Topf, damit die KPI-Reihe
          konsistent 5 Pills zeigt. Ohne Bewegungen fällt der Betrag auf 0 zurück und
          das Monats-Sublabel entfällt (label-only Pills brauchen marginTop:14, siehe
          PotsView Pill-Alignment).
        */}
        <div className="hb-stat-pill hb-stat-pill--ok">
          <div className="hb-stat-pill-label">Höchste Einzahlung</div>
          <div className="hb-stat-pill-value hb-ok" style={highlights ? undefined : { marginTop: 14 }}>
            +{fmt(highlights ? highlights.topTransfer.transfersIn : 0)}
          </div>
          {highlights ? (
            <div className="hb-muted" style={{ marginTop: 4, fontSize: 12 }}>
              {highlights.topTransfer.label}
            </div>
          ) : null}
        </div>
        <div className="hb-stat-pill hb-stat-pill--bad">
          <div className="hb-stat-pill-label">Höchste Entnahme</div>
          <div className="hb-stat-pill-value hb-bad" style={highlights ? undefined : { marginTop: 14 }}>
            -{fmt(highlights ? highlights.topExpense.expensesOut : 0)}
          </div>
          {highlights ? (
            <div className="hb-muted" style={{ marginTop: 4, fontSize: 12 }}>
              {highlights.topExpense.label}
            </div>
          ) : null}
        </div>
      </div>

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
          {/*
            Analyse-Layout: 2-Spalten (Charts links 2fr · Zusammensetzung rechts 1fr).
            Bricht unter 900px (hb-two-Breakpoint) auf eine Spalte um.
            Der Donut nimmt damit nie mehr die volle Seitenbreite ein.
          */}
          <div
            className="hb-two"
            style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", alignItems: "stretch" }}
          >
            {/* Linke Spalte: LineChart (Hero) über BarChart */}
            <div className="hb-stack hb-stack--lg" style={{ minWidth: 0 }}>
              {/* LineChart: Stand über Zeit */}
              <Card>
                <CardContent>
                  <div className="hb-row" style={{ alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <h3 className="hb-card-title">Entwicklung</h3>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                        <svg width="20" height="10" style={{ display: "block", flexShrink: 0 }}>
                          <line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.blue} strokeWidth="2.5" />
                          <circle cx="10" cy="5" r="2.5" fill={themeColors.blue} />
                        </svg>
                        Stand
                      </span>
                    </div>
                    <div className="hb-chart-range" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, visibility: lineMaxOffset > 0 ? "visible" : "hidden" }}>
                        <button type="button" className="hb-icon-btn" onClick={() => setLineScrollOffset((o) => Math.min(o + 1, lineMaxOffset))} disabled={lineScrollOffset >= lineMaxOffset} title="Älteren Bereich anzeigen" aria-label="Älteren Bereich anzeigen">‹</button>
                        <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{lineWindowLabel}</span>
                        <button type="button" className="hb-icon-btn" onClick={() => setLineScrollOffset((o) => Math.max(o - 1, 0))} disabled={lineScrollOffset === 0} title="Neueren Bereich anzeigen" aria-label="Neueren Bereich anzeigen">›</button>
                      </div>
                      {potSeries.length > 12 && (
                        <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                          {[["12", "12 M"], ["24", "24 M"], ["all", "Gesamt"]].map(([val, lbl]) => (
                            <button key={val} type="button" className={`hb-pill-tab ${lineRangeOption === val ? "hb-pill-tab-active" : ""}`} onClick={() => { setLineRangeOption(val); setLineScrollOffset(0); }}>{lbl}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ width: "100%", height: 260, marginTop: 16 }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={lineChartData}>
                        <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrencyAxis(v, baseCurrency)} width={64} />
                        <Tooltip
                          wrapperStyle={{ zIndex: 10 }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="hb-chart-tooltip">
                                <span className="hb-chart-tooltip-label">{label}</span>
                                {payload.filter((p) => p.value != null).map((p) => (
                                  <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
                                    <span style={{ color: themeColors.blue }}>Stand</span>
                                    <span>{fmt(p.value)}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="balance"
                          stroke={themeColors.blue}
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                </CardContent>
              </Card>

              {/* BarChart: Ein-/Auszahlungen */}
              <Card>
                <CardContent>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="hb-row" style={{ alignItems: "center" }}>
                      <h3 className="hb-card-title">Ein-/Auszahlungen</h3>
                      <div className="hb-chart-range" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, visibility: barMaxOffset > 0 ? "visible" : "hidden" }}>
                          <button type="button" className="hb-icon-btn" onClick={() => setBarScrollOffset((o) => Math.min(o + 1, barMaxOffset))} disabled={barScrollOffset >= barMaxOffset} title="Älteren Bereich anzeigen" aria-label="Älteren Bereich anzeigen">‹</button>
                          <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{barWindowLabel}</span>
                          <button type="button" className="hb-icon-btn" onClick={() => setBarScrollOffset((o) => Math.max(o - 1, 0))} disabled={barScrollOffset === 0} title="Neueren Bereich anzeigen" aria-label="Neueren Bereich anzeigen">›</button>
                        </div>
                        {potSeries.length > 12 && (
                          <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
                            {[["12", "12 M"], ["24", "24 M"], ["all", "Gesamt"]].map(([val, lbl]) => (
                              <button key={val} type="button" className={`hb-pill-tab ${barRangeOption === val ? "hb-pill-tab-active" : ""}`} onClick={() => { setBarRangeOption(val); setBarScrollOffset(0); }}>{lbl}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 14px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted, whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: themeColors.green }} />
                        Einzahlungen
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted, whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: themeColors.red }} />
                        Entnahmen
                      </span>
                    </div>
                  </div>

                  <div style={{ width: "100%", height: 240, marginTop: 16 }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={barChartData} barCategoryGap="32%" stackOffset="sign">
                        <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrencyCompact(v, baseCurrency)} />
                        <Tooltip
                          wrapperStyle={{ zIndex: 10 }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0].payload || {};
                            const inVal = Number(row.transfersIn || 0);
                            const outVal = Number(row.rawOut || 0);
                            const netto = inVal - outVal;
                            return (
                              <div className="hb-chart-tooltip hb-chart-tooltip--col">
                                <div className="hb-chart-tooltip-title">{label}</div>
                                <div className="hb-chart-tooltip-row">
                                  <span className="hb-chart-tooltip-key" style={{ color: themeColors.green }}>Einzahlungen</span>
                                  <span className="hb-chart-tooltip-val">+{fmt(inVal)}</span>
                                </div>
                                <div className="hb-chart-tooltip-row">
                                  <span className="hb-chart-tooltip-key" style={{ color: themeColors.red }}>Entnahmen</span>
                                  <span className="hb-chart-tooltip-val">−{fmt(outVal)}</span>
                                </div>
                                <div className="hb-chart-tooltip-divider" />
                                <div className="hb-chart-tooltip-row">
                                  <span className="hb-chart-tooltip-key hb-muted">Netto</span>
                                  <span className="hb-chart-tooltip-val" style={{ color: netto >= 0 ? themeColors.green : themeColors.red }}>
                                    {netto >= 0 ? "+" : "−"}{fmt(Math.abs(netto))}
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                          cursor={false}
                        />
                        <Bar dataKey="transfersIn" stackId="pf" barSize={20} fill={themeColors.green} shape={IncomeBarShape} />
                        <Bar dataKey="expensesOut" stackId="pf" barSize={20} fill={themeColors.red} shape={OutflowBarShape} />
                        <ReferenceLine y={0} stroke={themeColors.muted} strokeOpacity={0.6} strokeWidth={1.5} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                </CardContent>
              </Card>
            </div>

            {/* Rechte Spalte: Zusammensetzung nach Zweck (Donut + Legende, schmal) */}
            {transfersByCategory.length > 0 ? (
              <Card style={{ display: "flex", flexDirection: "column" }}>
                <CardContent style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <h3 className="hb-card-title" style={{ marginBottom: 8 }}>Zusammensetzung</h3>

                  {/* Donut mit fixer Maximalbreite, zentriert — geht nicht auf volle Breite auf */}
                  <div style={{ width: "100%", maxWidth: 280, height: 240, margin: "8px auto 0" }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={transfersByCategory}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={0}
                          cornerRadius={4}
                          stroke={cardBg}
                          strokeWidth={3}
                          strokeLinejoin="round"
                          startAngle={90}
                          endAngle={-270}
                        >
                          {transfersByCategory.map((d) => (
                            <Cell key={d.name} fill={transferCatColor.get(d.name)} />
                          ))}
                        </Pie>
                        <Tooltip
                          wrapperStyle={{ zIndex: 10 }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0];
                            return (
                              <div className="hb-chart-tooltip">
                                <span className="hb-chart-tooltip-label">
                                  <span className="hb-tooltip-dot" style={{ background: p.fill }} />
                                  {p.name}
                                </span>
                                <span>{fmt(p.value)}</span>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="hb-legend" style={{ marginTop: 12 }}>
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

                </CardContent>
              </Card>
            ) : (
              <Card style={{ display: "flex", flexDirection: "column" }}>
                <CardContent style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
                  <h3 className="hb-card-title" style={{ marginBottom: 8 }}>Zusammensetzung</h3>
                  <div className="hb-muted" style={{ textAlign: "center", padding: "32px 8px" }}>
                    Noch keine positiven Netto-Beträge je Zweck vorhanden.
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Buchungsliste für diesen Topf */}
      <Card style={{ marginTop: 16 }}>
        <CardContent>
          <div className="hb-row" style={{ alignItems: "center", marginBottom: 10 }}>
            <div className="hb-title-group">
              <h3 className="hb-card-title">Buchungen</h3>
              <span className="hb-info-pill hb-info-pill--title">{selectedPot.name}</span>
            </div>
            <div className="hb-info-pills">
              <span className="hb-info-pill">{potEntries.length} Einträge</span>
              {monthLabel
                ? monthLabel.split(" · ").map((part, i) => (
                    <span key={i} className="hb-info-pill">{part}</span>
                  ))
                : null}
            </div>
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
                  <Button
                    variant="outline"
                    onClick={() => setShowAllEntries((v) => !v)}
                  >
                    {showAllEntries
                      ? "Weniger anzeigen"
                      : `Weitere ${potEntries.length - 5} anzeigen`}
                  </Button>
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
        saveLabel="Schliessen"
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
        size="medium"
        bodyScroll={false}
      >
        <div className="hb-form" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          <div className="hb-muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Topf: {selectedPot?.name}
          </div>

          <div className="hb-two hb-two--dialog" style={{ gap: 16 }}>
            <div className="hb-field" style={{ minWidth: 0 }}>
              <div className="hb-label">Datum</div>
              <HbDatePicker
                value={newEntryDraft.date}
                onChange={(v) => setNewEntryDraft((d) => ({ ...d, date: v }))}
                style={{ minWidth: 0, width: "100%" }}
              />
            </div>

            <div className="hb-field" style={{ minWidth: 0 }}>
              <div className="hb-label">Betrag ({baseCurrency})</div>
              <input
                className="hb-input"
                style={{ minWidth: 0, width: "100%" }}
                type="text"
                inputMode="decimal"
                placeholder="z.B. 100.50"
                value={newEntryDraft.amount}
                onChange={(e) => setNewEntryDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
          </div>

          <div className="hb-field" style={{ minWidth: 0 }}>
            <div className="hb-label">Transfer-Zweck</div>
            <select
              className="hb-input"
              style={{ minWidth: 0, width: "100%" }}
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

          <div className="hb-field" style={{ minWidth: 0 }}>
            <div className="hb-label">Notiz (optional)</div>
            <input
              className="hb-input"
              style={{ minWidth: 0, width: "100%" }}
              type="text"
              placeholder="z.B. Anfangsbestand, Übertrag..."
              value={newEntryDraft.note}
              onChange={(e) => setNewEntryDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </div>
        </div>
      </EditDialog>
    </div>
  );
}
