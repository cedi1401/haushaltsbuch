import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, Button, RangeTabs, ChartScrollNav } from "../components/ui.jsx";
import { MONTH_RANGE_OPTIONS } from "../utils/constants.js";
import EditDialog from "../components/EditDialog.jsx";
import PotsManager, { POTS_MANAGER_TITLE } from "./PotsManager.jsx";
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
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { calcPotSeries, potPurposeBalances } from "../utils/potUtils.js";
import { TRANSFER_PALETTE } from "../utils/hbPalette.js";
import { IncomeBarShape, OutflowBarShape } from "../utils/chartShapes.jsx";
import { formatDateDE, parseAmount, todayISO, formatCurrencyCompact, formatCurrencyAxis } from "../utils/hbUtils.js";
import { formatYearMonth, getEntryFinancialMonth } from "../utils/financialMonthUtils.js";
import { generateId } from "../utils/idUtils.js";
import { useThemeColors } from "../hooks/themeColors.js";
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

// Zusammensetzung: so viele Zwecke bekommen eine eigene Farbe im Stapelbalken.
// Der Rest wird zu „Sonstige“ zusammengefasst. 8 farbige Klassen schöpfen
// TRANSFER_PALETTE genau aus; „Sonstige“ läuft neutral in REST_COLOR und
// verbraucht keine neunte Farbe — die Palette wird nie zyklisch
// wiederverwendet (siehe Kommentar am composition-Memo).
const COMPOSITION_TOP_N = 8;
// Neutraler Ton für „Sonstige“ und für alle Zeilen jenseits der Top N. Bewusst
// keine Palettenfarbe: Grau heißt hier „gehört zum Sonstige-Segment".
const REST_COLOR = "var(--muted)";
// Ab dieser Zahl wird die Rangliste eingeklappt (zweispaltig also 12 je Spalte).
const COMPOSITION_VISIBLE = 24;
// Ab so vielen Zwecken lohnt der zweispaltige Satz der Rangliste.
const COMPOSITION_COLS_MIN = 7;

// Prozentlabel der Zusammensetzung. Unter 1 % wird nicht auf „0 %" gerundet —
// ein Betrag mit „0 %" daneben liest sich wie ein Fehler.
const sharePct = (share) => (share > 0 && share < 1 ? "< 1" : String(Math.round(share)));

// Halbe angenommene Breite der Tooltip-Blase — nur zum Klemmen an den
// Viewport-Rand. Die Blase ist per translate(-50%) am Cursor zentriert; ohne
// Klemmung liefe sie bei einem Segment ganz links/rechts aus dem Bild.
const COMP_TIP_HALF_W = 130;

// Cursorposition für den Zusammensetzungs-Tooltip: horizontal dem Zeiger folgen
// (geklemmt), vertikal an der Oberkante des Balkens ankern, damit die Blase
// beim Wandern über den Balken nicht auf und ab springt.
function tipCoords(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = Math.max(
    COMP_TIP_HALF_W + 8,
    Math.min(e.clientX, window.innerWidth - COMP_TIP_HALF_W - 8)
  );
  return { x, y: rect.top };
}

export default function PotsView({ activeBook, entries, onAddTransferEntry, onUpdateBook, transferCategories, onEditEntry, onRemoveEntry, monthStartDay = 1, monthFilter, monthLabel }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const pots = useMemo(() => activeBook?.pots || [], [activeBook?.pots]);
  const [selectedPotId, setSelectedPotId] = useState(pots[0]?.id || "");
  const themeColors = useThemeColors();
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [managePotsOpen, setManagePotsOpen] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllPurposes, setShowAllPurposes] = useState(false);
  // Hover-Tooltip über dem Zusammensetzungsbalken: { seg, x, y } in
  // Viewport-Koordinaten (das Panel liegt fixed, siehe .hb-potcomp-tip).
  const [compTip, setCompTip] = useState(null);
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

  // Transfer-Kategorien Auswertung (Pie Chart) — Netto: Einzahlungen minus Entnahmen je Zweck.
  // Die Netto-Rechnung liegt in potUtils; hier bleiben nur die beiden
  // Anzeige-Aspekte: der Fallback-Name und der Donut-Filter (nur positive Stände).
  const transfersByCategory = useMemo(() => {
    if (!selectedPot) return [];

    const display = new Map();
    for (const [purpose, value] of potPurposeBalances(entries, selectedPot.id)) {
      const name = purpose || "Sonstiges";
      display.set(name, (display.get(name) || 0) + value);
    }

    const result = [];
    for (const [name, value] of display) {
      if (value > 0) result.push({ name, value });
    }
    return result.toSorted((a, b) => b.value - a.value);
  }, [entries, selectedPot]);

  // Zusammensetzung des Topfs: 100-%-Stapelbalken + Rangliste.
  //
  // Farbe wird NUR an die COMPOSITION_TOP_N größten Zwecke vergeben, alles
  // darunter läuft neutral als „Sonstige“. Grund: TRANSFER_PALETTE hat acht
  // Farben; ein Topf kann beliebig viele Zwecke haben. Die frühere zyklische
  // Zuweisung (`i % length`) gab bei 21 Zwecken jeder Farbe drei Zwecke — das
  // Farbfeld identifizierte dann nichts mehr. Regel: die Zahl der farbcodierten
  // Klassen bleibt ≤ 8, sonst trägt die Farbe keine Identität. Die Identität
  // liegt hier ohnehin im Namen der Zeile, die Reihenfolge kodiert den Rang.
  const composition = useMemo(() => {
    const total = transfersByCategory.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) return null;

    const rows = transfersByCategory.map((d, i) => ({
      name: d.name,
      value: d.value,
      share: (d.value / total) * 100,
      color: i < COMPOSITION_TOP_N ? TRANSFER_PALETTE[i] : REST_COLOR,
    }));

    const segments = rows.slice(0, COMPOSITION_TOP_N).map((r) => ({ ...r, restCount: 0 }));
    const rest = rows.slice(COMPOSITION_TOP_N);
    if (rest.length) {
      const restValue = rest.reduce((sum, r) => sum + r.value, 0);
      segments.push({
        name: "Sonstige",
        value: restValue,
        share: (restValue / total) * 100,
        color: REST_COLOR,
        restCount: rest.length,
      });
    }

    return { total, rows, segments, restCount: rest.length };
  }, [transfersByCategory]);

  // Alle Einzelbuchungen (Transfers + Entnahmen) für den gewählten Topf, optional nach Monat gefiltert
  const potEntries = useMemo(() => {
    if (!selectedPot) return [];
    return (entries || [])
      .filter((e) => {
        if (e.potId !== selectedPot.id) return false;
        if (e.kind !== "transfer" && e.kind !== "withdrawal") return false;
        if (monthFilter && getEntryFinancialMonth(e, monthStartDay) !== monthFilter) return false;
        return true;
      })
      .toSorted((a, b) => {
        const da = String(a.date || "");
        const db = String(b.date || "");
        if (da !== db) return db.localeCompare(da);
        // IDs sind Strings ("entry_<timestamp>_<rand>") → Number() wäre NaN.
        return String(b.id || "").localeCompare(String(a.id || ""));
      });
  }, [entries, selectedPot, monthFilter, monthStartDay]);

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
          title={POTS_MANAGER_TITLE}
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
            Analyse-Layout: die beiden Zeitreihen (gleiche X-Achse, Monate) stehen
            nebeneinander, die Zusammensetzung vollbreit darunter. Vorher stand die
            Zusammensetzung als schmale Spalte rechts — mit vielen Zwecken wurde ihre
            Legende doppelt so hoch wie die Chart-Spalte daneben. Vollbreit gibt es
            keine ungleich langen Spalten mehr, und die Rangliste kann zweispaltig
            gesetzt werden. Bricht unter 900px (hb-two-Breakpoint) auf eine Spalte um.
          */}
          <div className="hb-stack hb-stack--lg">
            <div
              className="hb-two"
              style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch" }}
            >
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
                      <ChartScrollNav
                        offset={lineScrollOffset}
                        maxOffset={lineMaxOffset}
                        onOffsetChange={setLineScrollOffset}
                        label={lineWindowLabel}
                        style={{ visibility: lineMaxOffset > 0 ? "visible" : "hidden" }}
                      />
                      {potSeries.length > 12 && (
                        <RangeTabs
                          options={MONTH_RANGE_OPTIONS}
                          value={lineRangeOption}
                          onChange={(val) => { setLineRangeOption(val); setLineScrollOffset(0); }}
                          ariaLabel="Zeitraum wählen"
                        />
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
                          angle={-35}
                          textAnchor="end"
                          height={62}
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
                        <ChartScrollNav
                          offset={barScrollOffset}
                          maxOffset={barMaxOffset}
                          onOffsetChange={setBarScrollOffset}
                          label={barWindowLabel}
                          style={{ visibility: barMaxOffset > 0 ? "visible" : "hidden" }}
                        />
                        {potSeries.length > 12 && (
                          <RangeTabs
                            options={MONTH_RANGE_OPTIONS}
                            value={barRangeOption}
                            onChange={(val) => { setBarRangeOption(val); setBarScrollOffset(0); }}
                            ariaLabel="Zeitraum wählen"
                          />
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
                          angle={-35}
                          textAnchor="end"
                          height={62}
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

            {/* Zusammensetzung nach Zweck: 100-%-Stapelbalken + Rangliste, volle Breite */}
            {composition ? (
              <Card>
                <CardContent>
                  <div className="hb-row" style={{ alignItems: "center", marginBottom: 14 }}>
                    <div className="hb-title-group">
                      <h3 className="hb-card-title">Zusammensetzung</h3>
                      <span className="hb-info-pill hb-info-pill--title">
                        {composition.rows.length} {composition.rows.length === 1 ? "Zweck" : "Zwecke"}
                      </span>
                    </div>
                    <span className="hb-cg-catlist-total">{fmt(composition.total)}</span>
                  </div>

                  {/*
                    Anteil am Ganzen als ein einzelner horizontaler Stapelbalken statt
                    als Donut: ein 0,6-%-Posten ist hier auch bei 1100px noch ~7px breit,
                    im Donut wäre er bei 40px Ringdicke eine Haarlinie. Trennung der
                    Segmente über eine 2px-Kante in Kartenfarbe (dieselbe Technik wie
                    strokeWidth am Donut, nur linear) — kein paddingAngle-Äquivalent,
                    die Breiten bleiben exakt proportional.
                  */}
                  <div
                    className="hb-potcomp-bar"
                    role="img"
                    aria-label={`Anteile am Topfstand: ${composition.segments
                      .map((seg) => `${seg.name} ${sharePct(seg.share)} Prozent`)
                      .join(", ")}`}
                    onMouseLeave={() => setCompTip(null)}
                  >
                    {composition.segments.map((seg) => (
                      <div
                        key={seg.name}
                        className="hb-potcomp-seg"
                        style={{ width: `${seg.share}%`, background: seg.color }}
                        onMouseEnter={(e) => setCompTip({ seg, ...tipCoords(e) })}
                        onMouseMove={(e) => setCompTip({ seg, ...tipCoords(e) })}
                      />
                    ))}
                  </div>
                  {compTip && (
                    <div
                      className="hb-chart-tooltip hb-potcomp-tip"
                      style={{ left: compTip.x, top: compTip.y }}
                      aria-hidden="true"
                    >
                      <span className="hb-chart-tooltip-label">
                        <span className="hb-tooltip-dot" style={{ background: compTip.seg.color }} />
                        {compTip.seg.restCount > 0
                          ? `${compTip.seg.name} (${compTip.seg.restCount} Zwecke)`
                          : compTip.seg.name}
                      </span>
                      <span>{fmt(compTip.seg.value)} · {sharePct(compTip.seg.share)} %</span>
                    </div>
                  )}

                  <div
                    className={`hb-cg-breakdown hb-cg-breakdown--compact${
                      composition.rows.length >= COMPOSITION_COLS_MIN ? " hb-cg-breakdown--cols" : ""
                    }`}
                    style={{ marginTop: 20 }}
                  >
                    {(showAllPurposes ? composition.rows : composition.rows.slice(0, COMPOSITION_VISIBLE)).map((r) => (
                      <div key={r.name} className="hb-cg-breakdown-row">
                        <div className="hb-cg-breakdown-top">
                          <div className="hb-cg-breakdown-info">
                            <div className="hb-cg-breakdown-names">
                              <span className="hb-cg-breakdown-name">{r.name}</span>
                            </div>
                          </div>
                          <div className="hb-cg-breakdown-values">
                            <span className="hb-cg-breakdown-amount">{fmt(r.value)}</span>
                            <span className="hb-cg-breakdown-share">{sharePct(r.share)} %</span>
                          </div>
                        </div>
                        <div className="hb-cg-breakdown-bar">
                          <div
                            className="hb-cg-breakdown-bar-fill"
                            style={{ width: `${r.share}%`, background: r.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {composition.rows.length > COMPOSITION_VISIBLE && (
                    <div style={{ marginTop: 16, textAlign: "center" }}>
                      <Button variant="outline" onClick={() => setShowAllPurposes((v) => !v)}>
                        {showAllPurposes
                          ? "Weniger anzeigen"
                          : `Weitere ${composition.rows.length - COMPOSITION_VISIBLE} anzeigen`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent>
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
        title={POTS_MANAGER_TITLE}
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
