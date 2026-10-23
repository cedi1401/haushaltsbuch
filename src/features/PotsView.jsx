import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, Button, RangeTabs, ChartScrollNav } from "../components/ui.jsx";
import { MONTH_RANGE_OPTIONS } from "../utils/constants.js";
import EditDialog from "../components/EditDialog.jsx";
import { ChartTooltip, ChartTooltipRow, ChartTooltipDivider } from "../components/ChartTooltip.jsx";
import { ChartLegend } from "../components/ChartLegend.jsx";
import PotsManagerDialog from "./PotsManagerDialog.jsx";
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
import { getPurposesForPot, getTransferCategoryName, NO_PURPOSE_LABEL } from "../utils/transferCategoryUtils.js";
import PurposeSelect from "../components/PurposeSelect.jsx";
import { TRANSFER_PALETTE } from "../utils/hbPalette.js";
import { IncomeBarShape, OutflowBarShape } from "../utils/chartShapes.jsx";
import { CHART_STROKE, CHART_HEIGHT, BAR_MAX_SIZE, AMOUNT_AXIS_WIDTH, axisProps, monthAxisProps, zeroLineProps, lineCursorProps } from "../utils/chartStyle.js";
import { formatDateDE, parseAmount, todayISO, formatCurrencyCompact, formatSigned } from "../utils/formatUtils.js";
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
  IconChevron,
  IconSearch,
} from "../components/icons.jsx";
import EntrySearchField, { SearchHighlight } from "../components/EntrySearchField.jsx";
import { searchEntries, searchHighlightPattern } from "../utils/entrySearch.js";

const fmtYearMonth = formatYearMonth;

// Zusammensetzung: so viele Zwecke bekommen eine eigene Farbe im Stapelbalken.
// Der Rest wird zu „Sonstige“ zusammengefasst. 10 farbige Klassen schöpfen
// TRANSFER_PALETTE genau aus; „Sonstige“ läuft neutral in REST_COLOR und
// verbraucht keine elfte Farbe — die Palette wird nie zyklisch
// wiederverwendet (siehe Kommentar am composition-Memo).
const COMPOSITION_TOP_N = 10;
// Neutraler Ton für „Sonstige“ und für alle Zeilen jenseits der Top N. Bewusst
// keine Palettenfarbe: Grau heißt hier „gehört zum Sonstige-Segment".
const REST_COLOR = "var(--muted)";
// Ab dieser Zahl wird die Rangliste eingeklappt (zweispaltig also 10 je Spalte);
// der Rest kommt hinter den „Weitere … anzeigen“-Button.
const COMPOSITION_VISIBLE = 20;
// Ab so vielen Zwecken lohnt der zweispaltige Satz der Rangliste. Deckt sich
// bewusst mit COMPOSITION_TOP_N + 1: solange jede Zeile ihre eigene Farbe hat,
// bleibt die Liste einspaltig; der zweispaltige Satz beginnt genau dort, wo die
// erste neutrale „Sonstige“-Zeile dazukommt.
const COMPOSITION_COLS_MIN = COMPOSITION_TOP_N + 1;

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

export default function PotsView({ activeBook, selectedPotId, onSelectPot, entries, onAddTransferEntry, onUpdateBook, transferCategories, onEditEntry, onRemoveEntry, monthStartDay = 1, monthFilter, onMonthFilterChange, monthLabel }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const pots = useMemo(() => activeBook?.pots || [], [activeBook?.pots]);
  // `transferCategories` (Prop) sind nur die aktiven Zwecke für die Auswahl;
  // Namen bestehender Buchungen kommen aus der vollen Liste inkl. gelöschter.
  const allTransferCategories = activeBook?.transferCategories;
  const themeColors = useThemeColors();
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [managePotsOpen, setManagePotsOpen] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [entryQuery, setEntryQuery] = useState("");
  const entrySearchRef = useRef(null);
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
    transferCategoryId: "",
    note: "",
  });

  const selectedPot = useMemo(() => {
    return pots.find((p) => p.id === selectedPotId) || pots[0] || null;
  }, [pots, selectedPotId]);

  // Wählbar sind nur die Zwecke dieses Topfs — ein Zweck gehört genau einem.
  const potPurposes = useMemo(
    () => getPurposesForPot(transferCategories, selectedPot?.id),
    [transferCategories, selectedPot?.id]
  );

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
    onSelectPot(id);
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

    // Nach Namen zusammenfassen: ein gelöschter und ein neuer Zweck können
    // gleich heißen und sollen im Donut ein Segment bleiben.
    const display = new Map();
    for (const [purposeId, value] of potPurposeBalances(entries, selectedPot.id)) {
      const name = getTransferCategoryName(allTransferCategories, purposeId) || NO_PURPOSE_LABEL;
      display.set(name, (display.get(name) || 0) + value);
    }

    const result = [];
    for (const [name, value] of display) {
      if (value > 0) result.push({ name, value });
    }
    return result.toSorted((a, b) => b.value - a.value);
  }, [entries, selectedPot, allTransferCategories]);

  // Zusammensetzung des Topfs: 100-%-Stapelbalken + Rangliste.
  //
  // Farbe wird NUR an die COMPOSITION_TOP_N größten Zwecke vergeben, alles
  // darunter läuft neutral als „Sonstige“. Grund: TRANSFER_PALETTE hat zehn
  // Farben; ein Topf kann beliebig viele Zwecke haben. Die frühere zyklische
  // Zuweisung (`i % length`) gab bei 21 Zwecken jeder Farbe drei Zwecke — das
  // Farbfeld identifizierte dann nichts mehr. Regel: die Zahl der farbcodierten
  // Klassen bleibt ≤ 10, sonst trägt die Farbe keine Identität. Die Identität
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

    const positionCount = rows.filter((r) => r.name !== NO_PURPOSE_LABEL).length;
    return { total, rows, segments, restCount: rest.length, positionCount };
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

  // Suche wie in der Buchungstabelle des Dashboards; während der Suche nicht
  // auf fünf Zeilen einklappen, damit alle Treffer sichtbar sind.
  const isSearchingEntries = entryQuery.trim() !== "";
  const entryMatches = useMemo(
    () => searchEntries(potEntries, entryQuery, { transferCategories: allTransferCategories }),
    [potEntries, entryQuery, allTransferCategories]
  );
  const entryHighlightPattern = useMemo(() => searchHighlightPattern(entryQuery), [entryQuery]);
  const showEntrySearch = potEntries.length > 0 || isSearchingEntries;

  function clearEntrySearch() {
    setEntryQuery("");
    entrySearchRef.current?.focus();
  }


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
        <PotsManagerDialog
          open={managePotsOpen}
          onClose={() => setManagePotsOpen(false)}
          activeBook={activeBook}
          onUpdateBook={onUpdateBook}
        />
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
            <IconChevron
              className={"hb-cg-group-chevron" + (menuOpen ? " hb-cg-group-chevron--open" : "")}
              width={18}
              height={18}
            />
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
                transferCategoryId: potPurposes[0]?.id || "",
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
        Kopf-Block: drei Kennzahlen. „Aktueller Stand“ trägt das Blau der
        Entwicklungslinie und keine Wertfarbe — der Saldo eines Topfs ist ein
        Bestand, keine Bewertung.
      */}
      <div className="hb-stat-pills">
        <div className="hb-stat-pill hb-stat-pill--ok">
          <div className="hb-stat-pill-label">Gesamt eingezahlt</div>
          <div className="hb-stat-pill-value hb-ok" style={{ marginTop: 14 }}>+{fmt(totals.transfersIn)}</div>
        </div>
        <div className="hb-stat-pill hb-stat-pill--bad">
          <div className="hb-stat-pill-label">Gesamt entnommen</div>
          <div className="hb-stat-pill-value hb-bad" style={{ marginTop: 14 }}>−{fmt(totals.expensesOut)}</div>
        </div>
        <div className="hb-stat-pill hb-stat-pill--transfer">
          <div className="hb-stat-pill-label">Aktueller Stand</div>
          <div className="hb-stat-pill-value" style={{ marginTop: 14 }}>{fmt(currentBalance)}</div>
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
                    transferCategoryId: potPurposes[0]?.id || "",
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="hb-row" style={{ alignItems: "center" }}>
                      <h3 className="hb-card-title">Entwicklung</h3>
                      <div className="hb-chart-range">
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
                    <ChartLegend items={[{ label: "Stand", type: "line", color: themeColors.blue }]} />
                  </div>

                  <div style={{ width: "100%", height: CHART_HEIGHT, marginTop: 16 }}>
                    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                      <LineChart data={lineChartData}>
                        <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="name" {...monthAxisProps(themeColors)} />
                        <YAxis {...axisProps(themeColors)} width={AMOUNT_AXIS_WIDTH} tickFormatter={(v) => formatCurrencyCompact(v, baseCurrency)} />
                        <Tooltip
                          wrapperStyle={{ zIndex: 10 }}
                          cursor={lineCursorProps(themeColors)}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <ChartTooltip title={label}>
                                {payload.filter((p) => p.value != null).map((p) => (
                                  <ChartTooltipRow key={p.dataKey} label="Stand" color={themeColors.blue} value={fmt(p.value)} />
                                ))}
                              </ChartTooltip>
                            );
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="balance"
                          stroke={themeColors.blue}
                          strokeWidth={CHART_STROKE.main}
                          dot={{ r: 3.5, fill: themeColors.blue, stroke: "var(--card)", strokeWidth: 1.5 }}
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
                      <div className="hb-chart-range">
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
                    <ChartLegend
                      items={[
                        { label: "Einzahlungen", color: themeColors.green },
                        { label: "Entnahmen", color: themeColors.red },
                      ]}
                    />
                  </div>

                  <div style={{ width: "100%", height: CHART_HEIGHT, marginTop: 16 }}>
                    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                      <BarChart data={barChartData} barCategoryGap="32%" stackOffset="sign">
                        <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="name" {...monthAxisProps(themeColors)} />
                        <YAxis {...axisProps(themeColors)} width={AMOUNT_AXIS_WIDTH} tickFormatter={(v) => formatCurrencyCompact(v, baseCurrency)} />
                        <Tooltip
                          wrapperStyle={{ zIndex: 10 }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0].payload || {};
                            const inVal = Number(row.transfersIn || 0);
                            const outVal = Number(row.rawOut || 0);
                            const netto = inVal - outVal;
                            return (
                              <ChartTooltip title={label}>
                                <ChartTooltipRow label="Einzahlungen" color={themeColors.green} value={`+${fmt(inVal)}`} />
                                <ChartTooltipRow label="Entnahmen" color={themeColors.red} value={`−${fmt(outVal)}`} />
                                <ChartTooltipDivider />
                                <ChartTooltipRow
                                  label="Netto"
                                  value={formatSigned(fmt, netto)}
                                  valueStyle={{ color: netto >= 0 ? themeColors.green : themeColors.red }}
                                />
                              </ChartTooltip>
                            );
                          }}
                          cursor={false}
                        />
                        <Bar dataKey="transfersIn" stackId="pf" maxBarSize={BAR_MAX_SIZE} fill={themeColors.green} shape={IncomeBarShape} />
                        <Bar dataKey="expensesOut" stackId="pf" maxBarSize={BAR_MAX_SIZE} fill={themeColors.red} shape={OutflowBarShape} />
                        <ReferenceLine y={0} {...zeroLineProps(themeColors)} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                </CardContent>
              </Card>
            </div>

            {/* Zusammensetzung nach Sparposition: 100-%-Stapelbalken + Rangliste, volle Breite */}
            {composition ? (
              <Card>
                <CardContent>
                  <div className="hb-card-head">
                    <div className="hb-title-group">
                      <h3 className="hb-card-title">Zusammensetzung</h3>
                      {/* Gezählt werden nur echte Sparpositionen, nicht „Ohne". */}
                      {composition.positionCount > 0 && (
                        <span className="hb-info-pill hb-info-pill--title">
                          {composition.positionCount} {composition.positionCount === 1 ? "Sparposition" : "Sparpositionen"}
                        </span>
                      )}
                    </div>
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
                          ? `${compTip.seg.name} (${compTip.seg.restCount} weitere)`
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
                        <div
                          className="hb-meter hb-meter--lg hb-meter--tinted hb-meter--cat hb-meter--animated hb-cg-breakdown-bar"
                          style={{ "--meter-tone": r.color }}
                        >
                          <div
                            className="hb-meter-fill hb-cg-breakdown-bar-fill"
                            style={{ width: `${r.share}%` }}
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
                  <div className="hb-card-head">
                    <h3 className="hb-card-title">Zusammensetzung</h3>
                  </div>
                  <div className="hb-empty hb-empty--sm">
                    <div className="hb-empty-icon"><IconInbox /></div>
                    <div className="hb-empty-title">Noch keine Zusammensetzung</div>
                    <div className="hb-empty-text">Noch keine positiven Netto-Beträge je Sparposition vorhanden.</div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Buchungsliste für diesen Topf */}
      <Card style={{ marginTop: "var(--card-gap)" }}>
        <CardContent>
          <div className="hb-card-head hb-card-head--flush">
            <div className="hb-title-group">
              <h3 className="hb-card-title">Buchungen</h3>
              <span className="hb-info-pill hb-info-pill--title">{selectedPot.name}</span>
            </div>
            {showEntrySearch ? (
              <EntrySearchField
                ref={entrySearchRef}
                query={entryQuery}
                onQueryChange={setEntryQuery}
                onClear={clearEntrySearch}
                placeholder="Notiz, Betrag oder Sparposition suchen…"
              />
            ) : null}
            <div className="hb-info-pills">
              <span className="hb-info-pill">
                {isSearchingEntries
                  ? `${entryMatches.length} von ${potEntries.length} Einträgen`
                  : `${potEntries.length} Einträge`}
              </span>
              {monthLabel
                ? monthLabel.split(" · ").map((part, i) => (
                    <span key={i} className="hb-info-pill">{part}</span>
                  ))
                : null}
            </div>
          </div>

          {potEntries.length > 0 && entryMatches.length === 0 ? (
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconSearch /></div>
              <div className="hb-empty-title">Keine Treffer</div>
              <div className="hb-empty-text">
                Keine Buchung passt zu „{entryQuery.trim()}“{monthFilter ? ` in ${monthLabel.split(" · ")[0]}` : ""}.
              </div>
              {monthFilter && onMonthFilterChange ? (
                <Button variant="outline" onClick={() => onMonthFilterChange("")}>
                  In allen Monaten suchen
                </Button>
              ) : (
                <Button variant="outline" onClick={clearEntrySearch}>
                  Suche leeren
                </Button>
              )}
            </div>
          ) : potEntries.length === 0 ? (
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
                      <th className="hb-col-category">Sparposition</th>
                      <th className="hb-col-note">Notiz</th>
                      <th className="hb-col-amount hb-right">Betrag</th>
                      <th className="hb-col-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllEntries || isSearchingEntries ? entryMatches : entryMatches.slice(0, 5)).map((e) => {
                      const isTransfer = e.kind === "transfer";
                      const purposeName = getTransferCategoryName(allTransferCategories, e.transferCategoryId);
                      return (
                        <tr key={e.id}>
                          <td className="hb-col-date">{formatDateDE(e.date)}</td>
                          <td className="hb-col-type">{isTransfer ? "Einzahlung" : "Entnahme"}</td>
                          <td className="hb-col-category">
                            {purposeName ? <SearchHighlight text={purposeName} pattern={entryHighlightPattern} /> : "—"}
                          </td>
                          <td className="hb-col-note">
                            {e.note ? <SearchHighlight text={e.note} pattern={entryHighlightPattern} /> : "—"}
                          </td>
                          <td className={`hb-col-amount hb-right ${isTransfer ? "hb-ok" : "hb-bad"}`}>
                            {isTransfer ? "+" : "−"}{fmt(Number(e.amount || 0))}
                          </td>
                          <td className="hb-col-actions">
                            <div className="hb-actions hb-actions-hover">
                              <button
                                type="button"
                                className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                                onClick={() => onEditEntry?.(e)}
                                title="Bearbeiten"
                                aria-label="Bearbeiten"
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle hb-icon-btn--danger"
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
              {!isSearchingEntries && potEntries.length > 5 && (
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

      <PotsManagerDialog
        open={managePotsOpen}
        onClose={() => setManagePotsOpen(false)}
        activeBook={activeBook}
        onUpdateBook={onUpdateBook}
      />

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
            transferCategoryId: newEntryDraft.transferCategoryId || null,
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
          parseAmount(newEntryDraft.amount) > 0
        }
        saveLabel="Hinzufügen"
        size="medium"
        bodyScroll={false}
      >
        <div className="hb-form hb-form-stack">
          <div className="hb-muted hb-muted--sm" style={{ marginBottom: 4 }}>
            Topf: {selectedPot?.name}
          </div>

          <div className="hb-two hb-two--dialog">
            <div className="hb-field">
              <div className="hb-label">Datum</div>
              <HbDatePicker
                value={newEntryDraft.date}
                onChange={(v) => setNewEntryDraft((d) => ({ ...d, date: v }))}
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
          </div>

          <PurposeSelect
            value={newEntryDraft.transferCategoryId}
            options={potPurposes.map((c) => ({ id: c.id, label: c.name }))}
            onChange={(id) => setNewEntryDraft((d) => ({ ...d, transferCategoryId: id }))}
          />

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
        </div>
      </EditDialog>
    </div>
  );
}
