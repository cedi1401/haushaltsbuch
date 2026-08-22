import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, Button, RangeTabs, ChartScrollNav } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/toastContext.js";
import { IconCostGroups, IconPlus, IconEdit, IconDelete, IconCheck, IconInbox, IconFixed, IconTrend } from "../components/icons.jsx";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { useThemeColors } from "../hooks/themeColors.js";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { generateId } from "../utils/idUtils.js";
import { DEFAULT_EXPENSE_CATEGORIES, parseAmount, formatCurrencyAxis, formatDateDE, todayISO } from "../utils/hbUtils.js";
import { EMPTY_ARRAY, MONTH_RANGE_OPTIONS } from "../utils/constants.js";
import { CUSTOM_CATEGORY_PALETTE } from "../utils/hbPalette.js";
import { calcCostGroupStats, calcExpectedMonthly, formatMonthCount } from "../utils/costGroupUtils.js";
import { addMonthsISO } from "../utils/financialMonthUtils.js";

const INTERVAL_OPTIONS = [
  { months: 1, label: "Monatlich" },
  { months: 3, label: "Vierteljährlich" },
  { months: 6, label: "Halbjährlich" },
  { months: 12, label: "Jährlich" },
  { months: 24, label: "Alle 2 Jahre" },
];

function intervalLabel(months) {
  return INTERVAL_OPTIONS.find((o) => o.months === months)?.label || `Alle ${months} Mt.`;
}

// Erklärtexte der beiden Unterfunktionen (Ist-Erfassung vs. Planung). Bewusst
// ausgelagert, weil sie an mehreren Stellen als Info-Popover erscheinen und der
// Kern des Konzepts sind: die beiden Zahlen werden nie addiert.
const HELP_ACTUAL =
  "Summe aller Buchungen in den zugeordneten Kategorien im gewählten Zeitraum, geteilt durch die Anzahl Monate. " +
  "Das sind tatsächlich erfasste Ausgaben — unabhängig davon, ob sie aus dem Monatsbudget oder aus einem Topf bezahlt wurden.";

const HELP_PLAN =
  "Reine Vorschau für unregelmäßige Kosten: Jeder Posten wird auf einen Betrag pro Monat heruntergerechnet. " +
  "Diese Beträge sind keine Buchungen und werden nicht zu den erfassten Kosten addiert. Sie zeigen, wie viel du " +
  "pro Monat zurücklegen müsstest, um solche Rechnungen decken zu können.";

const HELP_DEVIATION =
  "Ist minus Plan. Ein Minus bedeutet, dass deine Planung die realen Kosten deckt; ein Plus, dass die Kosten " +
  "höher ausfallen als geplant. Beide Werte beschreiben dieselben Kosten aus zwei Blickwinkeln — sie werden " +
  "deshalb gegenübergestellt und nicht summiert.";

const HELP_CHART =
  "Die Balken zeigen die tatsächlich gebuchten Kosten pro Monat. Die gestrichelte Linie „Ø Ist\" ist deren " +
  "Durchschnitt, die Linie „Rücklagenbedarf\" der aus der Planung errechnete Monatsbetrag. Balken unterhalb der " +
  "Rücklagenlinie bedeuten, dass der Monat günstiger war als die Rücklage — Balken darüber zehren an ihr. " +
  "Bei einem frei gewählten Zeitraum sind angeschnittene Randmonate abgeblendet: sie decken nur einen Teil " +
  "ihrer Tage ab und sind deshalb nicht mit den vollen Monaten vergleichbar.";

// Planung ist bewusst NICHT Teil des Gruppen-Drafts: Planungsposten werden
// ausschließlich in der Planungs-Card gepflegt (ein Ort, keine Doppelspurigkeit).
const EMPTY_DRAFT = { name: "", color: CUSTOM_CATEGORY_PALETTE[0], categoryIds: [], subcategoryIds: [] };

// Draft des kleinen Einzel-Posten-Dialogs (Planungs-Card). id === null = neuer Posten.
const EMPTY_PLAN_ITEM = { id: null, name: "", amount: "", intervalMonths: 12 };

// Frei gewählter Zeitraum (leer = keiner gesetzt)
const EMPTY_RANGE = { from: "", to: "" };

// Kompaktes Datum für das Pill-Label: "15.03.2025" → "15.03.25". Die Kopfzeile
// trägt beide Daten nebeneinander, ausgeschrieben wäre das Pill zu breit.
function shortDateDE(iso) {
  return formatDateDE(iso).replace(/\.\d{2}(\d{2})$/, ".$1");
}

export default function CostGroupsView({
  activeBook,
  onUpdateBook,
  monthStartDay = 1,
  // Frei gewählter Zeitraum — liegt in HaushaltsbuchApp, damit er den
  // Ansichtswechsel überlebt (diese View wird dabei unmountet).
  customRange = EMPTY_RANGE,
  onCustomRangeChange,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const { confirm } = useConfirm();
  const toast = useToast();
  const themeColors = useThemeColors();

  const costGroups = activeBook?.costGroups || EMPTY_ARRAY;
  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const entries = activeBook?.entries || EMPTY_ARRAY;

  // "overview" = Karten-Grid aller Gruppen, "detail" = Einzelgruppe mit Chart
  const [viewMode, setViewMode] = useState("overview");
  const [selectedGroupId, setSelectedGroupId] = useState(costGroups[0]?.id || null);
  // Default "all" (Gesamt): beim Zurückkehren in den Kostenrechner immer der
  // gesamte Verlauf — ausser ein eigener Zeitraum war zuletzt aktiv, der bleibt
  // bis zum Beenden des Programms bestehen.
  const [rangeOption, setRangeOption] = useState(customRange.active ? "custom" : "all");
  // Scrollfenster des Verlaufscharts (0 = neueste 12 Monate)
  const [chartOffset, setChartOffset] = useState(0);

  // `customRange` (Prop) ist der übernommene Wert, `draftRange` der Entwurf im
  // Popover — erst "Übernehmen" schaltet den Zeitraum um. Beides bleibt
  // Laufzeit-State, das Buch wird davon nicht berührt.
  const [draftRange, setDraftRange] = useState(EMPTY_RANGE);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const rangeWrapRef = useRef(null);
  useClickOutside(rangeWrapRef, () => setRangePickerOpen(false), { enabled: rangePickerOpen });

  useEffect(() => {
    if (!rangePickerOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setRangePickerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rangePickerOpen]);

  const today = todayISO();

  // Eigene Pill-Gruppe neben den festen Fenstern: der freie Zeitraum ist eine
  // andere Art von Auswahl (öffnet ein Popover statt sofort umzuschalten) und
  // bleibt deshalb abgesetzt. Das Label trägt den gewählten Bereich, damit er
  // ablesbar ist, ohne das Popover zu öffnen.
  const customRangeOptions = useMemo(() => {
    const label = customRange.from && customRange.to
      ? `${shortDateDE(customRange.from)} – ${shortDateDE(customRange.to)}`
      : "Zeitraum";
    return [{ value: "custom", label }];
  }, [customRange]);

  // HbDatePicker kennt keine min/max-Grenzen, deshalb wird der Entwurf hier
  // geprüft und "Übernehmen" bis zur Korrektur gesperrt.
  const rangeError = useMemo(() => {
    if (!draftRange.from || !draftRange.to) return "Bitte Start- und Enddatum wählen.";
    if (draftRange.from > draftRange.to) return "Das Startdatum muss vor dem Enddatum liegen.";
    if (draftRange.to > today) return "Der Zeitraum darf nicht in der Zukunft enden.";
    return "";
  }, [draftRange, today]);

  function handleRangeChange(val) {
    if (val === "custom") { toggleRangePicker(); return; }
    setRangePickerOpen(false);
    setRangeOption(val);
    setChartOffset(0);
    // Der Bereich bleibt gemerkt (das Popover zeigt ihn beim nächsten Öffnen
    // wieder), gilt aber nicht mehr als aktive Auswahl.
    if (customRange.active) onCustomRangeChange?.({ ...customRange, active: false });
  }

  function toggleRangePicker() {
    if (rangePickerOpen) { setRangePickerOpen(false); return; }
    // Vorschlag beim ersten Öffnen: die letzten 12 Monate bis heute
    setDraftRange(
      customRange.from && customRange.to
        ? { from: customRange.from, to: customRange.to }
        : { from: addMonthsISO(today, -11), to: today }
    );
    setRangePickerOpen(true);
  }

  function applyRange() {
    if (rangeError) return;
    onCustomRangeChange?.({ from: draftRange.from, to: draftRange.to, active: true });
    setRangeOption("custom");
    setChartOffset(0);
    setRangePickerOpen(false);
  }

  function resetRange() {
    onCustomRangeChange?.({ from: "", to: "", active: false });
    setDraftRange(EMPTY_RANGE);
    setRangeOption("all");
    setChartOffset(0);
    setRangePickerOpen(false);
  }

  // Gruppen-Dropdown (Titel als aufklappbares Menü)
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
      menuListRef.current?.querySelectorAll("[role='menuitemradio'],[role='menuitem']") ?? []
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

  function selectGroup(id) {
    setSelectedGroupId(id);
    setChartOffset(0);
    setMenuOpen(false);
    menuTriggerRef.current?.focus();
  }

  function openDetail(id) {
    setSelectedGroupId(id);
    setChartOffset(0);
    setViewMode("detail");
  }

  // Dialog-State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [expanded, setExpanded] = useState(() => new Set());

  // Kennzahlen aller Gruppen — Basis für die Übersichts-Cards und (per
  // Lookup) für die Detailansicht, damit nichts doppelt gerechnet wird.
  //
  // Ist und Plan werden bewusst NICHT addiert: geplante Posten sind eine
  // Vorwegnahme derselben Kosten, die das Ist bereits erfasst, sobald die
  // Rechnung gebucht ist. Eine Summe würde solche Kosten doppelt zählen.
  // Stattdessen ist das Ist die Leitzahl und der Plan die Gegenüberstellung.
  const groupCards = useMemo(() => {
    return costGroups.map((group) => {
      const stats = calcCostGroupStats(group, entries, { rangeOption, customRange, monthStartDay });
      const planned = calcExpectedMonthly(group.plannedItems);
      return {
        group,
        stats,
        planned,
        deviation: stats.avgMonthly - planned.expectedMonthly,
      };
    });
  }, [costGroups, entries, rangeOption, customRange, monthStartDay]);

  // Aktive Gruppe robust bestimmen (z.B. nach Löschen)
  const activeGroup = useMemo(() => {
    return costGroups.find((g) => g.id === selectedGroupId) || costGroups[0] || null;
  }, [costGroups, selectedGroupId]);

  const activeCard = useMemo(
    () => groupCards.find((c) => c.group.id === activeGroup?.id) || null,
    [groupCards, activeGroup]
  );
  const stats = activeCard?.stats || null;
  const planned = activeCard?.planned || { expectedMonthly: 0, items: EMPTY_ARRAY };
  const hasPlan = planned.items.length > 0;

  // Untertitel der Ist-Pill. Zeiträume unter einem Monat werden als Tage
  // ausgewiesen: der Ø ist dort eine Hochrechnung aus wenigen Tagen und keine
  // gemessene Monatskost — ohne Hinweis läse sich die Zahl wie eine echte.
  const actualSubLabel = useMemo(() => {
    if (!stats) return "";
    if (stats.monthCount > 0 && stats.monthCount < 1 && stats.rangeFrom && stats.rangeTo) {
      const days = Math.round(
        (new Date(stats.rangeTo) - new Date(stats.rangeFrom)) / 86400000
      ) + 1;
      return `${fmt(stats.total)} in ${days} ${days === 1 ? "Tag" : "Tagen"} · Ø hochgerechnet`;
    }
    return `${fmt(stats.total)} in ${formatMonthCount(stats.monthCount)} Mt.`;
  }, [stats, fmt]);

  // Richtung der Abweichung mit Toleranz, damit ein rechnerisches ±0.001 nicht
  // als "über Plan" erscheint.
  const deviation = activeCard?.deviation || 0;
  const deviationSign = deviation > 0.005 ? 1 : deviation < -0.005 ? -1 : 0;

  // Chart-Fenster: max. 12 Monate sichtbar, ältere per ‹ › erreichbar
  const chartSeries = stats?.monthlySeries || EMPTY_ARRAY;
  const chartMaxOffset = Math.max(0, chartSeries.length - 12);
  const chartWindow = useMemo(() => {
    const start = Math.max(0, chartSeries.length - 12 - chartOffset);
    return chartSeries.slice(start, start + 12);
  }, [chartSeries, chartOffset]);

  const hasChartData = chartWindow.length > 0;

  const chartWindowLabel = useMemo(() => {
    if (!chartWindow.length) return "";
    const first = chartWindow[0].label;
    const last = chartWindow[chartWindow.length - 1].label;
    return first === last ? first : `${first} – ${last}`;
  }, [chartWindow]);

  // ── Dialog ────────────────────────────────────────────────────────────
  function openCreateDialog() {
    setEditingGroup(null);
    setDraft({ ...EMPTY_DRAFT, color: CUSTOM_CATEGORY_PALETTE[costGroups.length % CUSTOM_CATEGORY_PALETTE.length] });
    setExpanded(new Set());
    setDialogOpen(true);
  }

  function openEditDialog(group) {
    setEditingGroup(group);
    setDraft({
      name: group.name || "",
      color: group.color || CUSTOM_CATEGORY_PALETTE[0],
      categoryIds: [...(group.categoryIds || [])],
      subcategoryIds: [...(group.subcategoryIds || [])],
    });
    // Kategorien mit Auswahl direkt aufklappen
    const toExpand = new Set();
    for (const cat of expenseCategories) {
      const hasSelectedSub = (cat.subcategories || []).some((s) => (group.subcategoryIds || []).includes(s.id));
      if (hasSelectedSub) toExpand.add(cat.id);
    }
    setExpanded(toExpand);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingGroup(null);
  }

  function toggleExpand(catId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  }

  function toggleCategory(catId) {
    setDraft((d) => {
      const has = d.categoryIds.includes(catId);
      return {
        ...d,
        categoryIds: has ? d.categoryIds.filter((id) => id !== catId) : [...d.categoryIds, catId],
      };
    });
  }

  function toggleSubcategory(subId) {
    setDraft((d) => {
      const has = d.subcategoryIds.includes(subId);
      return {
        ...d,
        subcategoryIds: has ? d.subcategoryIds.filter((id) => id !== subId) : [...d.subcategoryIds, subId],
      };
    });
  }

  const canSave = useMemo(() => {
    return draft.name.trim().length > 0 && (draft.categoryIds.length > 0 || draft.subcategoryIds.length > 0);
  }, [draft]);

  function saveGroup() {
    if (!activeBook || !canSave) return;

    if (editingGroup) {
      // plannedItems werden hier NICHT geschrieben: der Dialog kennt sie nicht
      // (mehr). `...g` reicht den bestehenden Stand unverändert durch — sonst
      // würde jedes Speichern die Planung der Gruppe löschen.
      const updated = costGroups.map((g) =>
        g.id === editingGroup.id
          ? { ...g, name: draft.name.trim(), color: draft.color, categoryIds: draft.categoryIds, subcategoryIds: draft.subcategoryIds }
          : g
      );
      onUpdateBook({ ...activeBook, costGroups: updated });
    } else {
      const newGroup = {
        id: generateId("cg"),
        name: draft.name.trim(),
        color: draft.color,
        categoryIds: draft.categoryIds,
        subcategoryIds: draft.subcategoryIds,
        // Leere Planung; gefüllt wird sie anschließend in der Detailansicht,
        // in die openDetail() direkt springt.
        plannedItems: [],
      };
      onUpdateBook({ ...activeBook, costGroups: [...costGroups, newGroup] });
      // Neue Gruppe direkt im Detail zeigen
      openDetail(newGroup.id);
    }
    closeDialog();
  }

  async function deleteGroup(group) {
    const ok = await confirm({
      title: "Kostengruppe löschen",
      message: `Kostengruppe „${group.name}" wirklich löschen? Deine Einträge bleiben unverändert.`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const updated = costGroups.filter((g) => g.id !== group.id);
    onUpdateBook({ ...activeBook, costGroups: updated });
    if (selectedGroupId === group.id) setSelectedGroupId(updated[0]?.id || null);
    setViewMode("overview");
    toast.success("Kostengruppe gelöscht.");
  }

  // ── Planungsposten direkt aus der Planungs-Card ──────────────────────────
  // Bewusst ein eigener, kleiner Dialog statt des großen Gruppen-Dialogs: für
  // einen einzelnen Posten müsste der Nutzer sonst an Name, Farbe und dem
  // Kategorien-Picker vorbei nach unten scrollen. Der Planungs-Abschnitt im
  // Gruppen-Dialog bleibt bestehen — beim Anlegen einer neuen Gruppe gibt es
  // noch keine Card, in der man Posten pflegen könnte.
  const [planItemOpen, setPlanItemOpen] = useState(false);
  const [planItemDraft, setPlanItemDraft] = useState(EMPTY_PLAN_ITEM);

  function openPlanItemCreate() {
    setPlanItemDraft({ ...EMPTY_PLAN_ITEM });
    setPlanItemOpen(true);
  }

  function openPlanItemEdit(itemId) {
    // Auf den Roh-Posten zurückmappen: die Card zeigt die abgeleiteten Items
    // aus calcExpectedMonthly (inkl. monthly), gespeichert wird plannedItems.
    const raw = (activeGroup?.plannedItems || []).find((p) => p.id === itemId);
    if (!raw) return;
    setPlanItemDraft({
      id: raw.id,
      name: raw.name || "",
      amount: String(raw.amount ?? ""),
      intervalMonths: Number(raw.intervalMonths || 12),
    });
    setPlanItemOpen(true);
  }

  function persistPlannedItems(items) {
    if (!activeBook || !activeGroup) return;
    const updated = costGroups.map((g) => (g.id === activeGroup.id ? { ...g, plannedItems: items } : g));
    onUpdateBook({ ...activeBook, costGroups: updated });
  }

  function savePlanItem() {
    const amount = parseAmount(planItemDraft.amount);
    if (!planItemDraft.name.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const item = {
      id: planItemDraft.id || generateId("plan"),
      name: planItemDraft.name.trim(),
      amount,
      intervalMonths: Math.max(1, Number(planItemDraft.intervalMonths || 1)),
    };
    const current = activeGroup?.plannedItems || [];
    const isEdit = Boolean(planItemDraft.id) && current.some((p) => p.id === planItemDraft.id);
    persistPlannedItems(isEdit ? current.map((p) => (p.id === item.id ? item : p)) : [...current, item]);
    setPlanItemOpen(false);
    toast.success(isEdit ? "Posten aktualisiert." : "Posten hinzugefügt.");
  }

  async function deletePlanItem(item) {
    const ok = await confirm({
      title: "Posten löschen",
      message: `Geplanten Posten „${item.name || "Posten"}" wirklich löschen? Deine Buchungen bleiben unverändert.`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    persistPlannedItems((activeGroup?.plannedItems || []).filter((p) => p.id !== item.id));
    toast.success("Posten gelöscht.");
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (costGroups.length === 0) {
    return (
      <div>
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconCostGroups /></div>
              <div className="hb-empty-title">Noch keine Kostengruppen</div>
              <div className="hb-empty-text">
                Bündle Kategorien zu einer Gruppe (z.B. „Auto" aus Benzin, Versicherung, Steuer
                und Reparatur) und sieh, was sie dich im Schnitt pro Monat kostet.
              </div>
              <Button onClick={openCreateDialog}>
                <IconPlus /> Erste Kostengruppe anlegen
              </Button>
            </div>
          </CardContent>
        </Card>
        {renderDialog()}
      </div>
    );
  }

  if (viewMode === "overview") {
    return (
      <div>
        {renderOverview()}
        {renderDialog()}
      </div>
    );
  }

  return (
    <div>
      {activeGroup && stats && (
        <>
          {/* Kopfzeile: Zurück zur Übersicht + Titel als Gruppen-Dropdown + Zeitraumwähler */}
          <div className="hb-cg-head">
            <div className="hb-cg-head-left">
              <Button
                variant="outline"
                onClick={() => setViewMode("overview")}
              >
                Zurück
              </Button>
              <div className="hb-cg-group-menu" ref={menuWrapRef}>
              <button
                ref={menuTriggerRef}
                type="button"
                className="hb-cg-group-trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                title="Kostengruppe wechseln"
              >
                <span className="hb-cat-dot" style={{ background: activeGroup.color || "var(--accent)" }} />
                <span className="hb-cg-group-trigger-name">{activeGroup.name}</span>
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
                  {costGroups.map((g) => {
                    const isActive = activeGroup?.id === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className={"hb-cg-group-item" + (isActive ? " hb-cg-group-item--active" : "")}
                        onClick={() => selectGroup(g.id)}
                      >
                        <span className="hb-cat-dot" style={{ background: g.color || "var(--accent)" }} />
                        <span className="hb-cg-group-item-name">{g.name}</span>
                        {isActive && <IconCheck width={16} height={16} className="hb-cg-group-item-check" />}
                      </button>
                    );
                  })}
                  <div className="hb-cg-group-list-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="hb-cg-group-item hb-cg-group-item--add"
                    onClick={() => { setMenuOpen(false); openCreateDialog(); }}
                  >
                    <IconPlus width={16} height={16} />
                    <span className="hb-cg-group-item-name">Neue Gruppe</span>
                  </button>
                </div>
              )}
              </div>
            </div>
            <div className="hb-cg-head-actions">
              {renderRangeSelector({ marginRight: 10 })}
              <Button onClick={() => openEditDialog(activeGroup)}>
                <IconEdit width={16} height={16} /> Bearbeiten
              </Button>
              <Button variant="outline" onClick={() => deleteGroup(activeGroup)}>
                <IconDelete width={16} height={16} /> Löschen
              </Button>
            </div>
          </div>

          {/* KPIs — Soll/Ist-Gegenüberstellung statt Summe. Das Ist ist die
              Leitzahl (Akzent), der Plan die zweite Sicht (Violett, wie die
              Rücklagenlinie im Chart). Die Abweichung bleibt ohne Planung
              neutral, weil es dann nichts zu vergleichen gibt. */}
          <div className="hb-stat-pills">
            <div className="hb-stat-pill hb-stat-pill--accent">
              <div className="hb-stat-pill-top">
                <span className="hb-stat-pill-label">Ist Ø/Monat</span>
                <HbTooltip size={16} text={HELP_ACTUAL} />
              </div>
              <span className="hb-stat-pill-value">{fmt(stats.avgMonthly)}</span>
              <span className="hb-stat-pill-sub">{actualSubLabel}</span>
            </div>

            <div className="hb-stat-pill hb-stat-pill--plan">
              <div className="hb-stat-pill-top">
                <span className="hb-stat-pill-label">Plan Ø/Monat</span>
                <HbTooltip size={16} text={HELP_PLAN} />
              </div>
              <span className="hb-stat-pill-value">{fmt(planned.expectedMonthly)}</span>
              <span className="hb-stat-pill-sub">
                {hasPlan
                  ? `${planned.items.length} ${planned.items.length === 1 ? "geplanter Posten" : "geplante Posten"}`
                  : "Noch nichts geplant"}
              </span>
            </div>

            {/* Ohne Planung gibt es nichts zu bewerten: die Pill bleibt stehen,
                zeigt aber neutral 0 statt eine rote "Ist über Plan"-Warnung,
                die nur daran läge, dass der Nutzer die Planung nicht nutzt. */}
            <div
              className={
                "hb-stat-pill " +
                (!hasPlan
                  ? "hb-stat-pill--accent"
                  : deviationSign > 0
                  ? "hb-stat-pill--bad"
                  : "hb-stat-pill--ok")
              }
            >
              <div className="hb-stat-pill-top">
                <span className="hb-stat-pill-label">Abweichung</span>
                <HbTooltip size={16} text={HELP_DEVIATION} />
              </div>
              <span
                className="hb-stat-pill-value"
                style={
                  hasPlan
                    ? { color: deviationSign > 0 ? "var(--red)" : "var(--green)" }
                    : undefined
                }
              >
                {hasPlan && deviationSign > 0 ? "+" : hasPlan && deviationSign < 0 ? "−" : ""}
                {fmt(hasPlan ? Math.abs(deviation) : 0)}
              </span>
              <span className="hb-stat-pill-sub">
                {!hasPlan
                  ? "Keine Planung zum Vergleich"
                  : deviationSign > 0
                  ? "Ist über Plan"
                  : deviationSign < 0
                  ? "Planung deckt das Ist"
                  : "Ist entspricht dem Plan"}
              </span>
            </div>
          </div>

          {/* Kostenverlauf: Ist-Kosten pro Monat, Referenzlinien für den Ist-Ø
              und den Rücklagenbedarf aus der Planung — Chart-Idiom wie
              FixedCostTrendSection. Die Rücklagenlinie ist eine Zielmarke zum
              Ablesen, keine Summe über den Balken. */}
          <Card style={{ marginBottom: 20 }}>
            <CardContent>
              <div className="hb-row" style={{ alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span className="hb-title-with-help">
                    <h4 style={{ margin: 0, fontSize: 15 }}>Kostenverlauf</h4>
                    <HbTooltip size={16} text={HELP_CHART} />
                  </span>
                  {/* Legende nur bei gezeichnetem Chart — im Empty-State gäbe es
                      keine Linien, die sie erklären könnte. */}
                  {hasChartData && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.accent} strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                      Ø Ist
                    </span>
                  )}
                  {hasChartData && planned.expectedMonthly > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.purple} strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                      Rücklagenbedarf
                    </span>
                  )}
                </div>
                {chartMaxOffset > 0 && (
                  <ChartScrollNav
                    offset={chartOffset}
                    maxOffset={chartMaxOffset}
                    onOffsetChange={setChartOffset}
                    label={chartWindowLabel}
                  />
                )}
              </div>

              {!hasChartData ? (
                <div className="hb-empty hb-empty--sm">
                  <div className="hb-empty-icon"><IconTrend /></div>
                  <div className="hb-empty-title">Kein Verlauf</div>
                  <div className="hb-empty-text">
                    Für die zugeordneten Kategorien gibt es im gewählten Zeitraum keine Buchungen.
                    Sobald die erste Ausgabe gebucht ist, erscheint hier der Verlauf pro Monat.
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartWindow} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap="32%">
                    <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrencyAxis(v, baseCurrency)} width={64} />
                    <Tooltip
                      wrapperStyle={{ zIndex: 10 }}
                      cursor={false}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload;
                        return (
                          <div className="hb-chart-tooltip">
                            <span className="hb-chart-tooltip-label">{label}</span>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                              <span>Kosten</span>
                              <span>{fmt(payload[0].value)}</span>
                            </div>
                            {point?.partial && (
                              <div className="hb-chart-tooltip-note">
                                Teilmonat: {shortDateDE(point.partialFrom)} – {shortDateDE(point.partialTo)}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {planned.expectedMonthly > 0 && (
                      <ReferenceLine y={planned.expectedMonthly} stroke={themeColors.purple} strokeDasharray="5 3" strokeWidth={1.5} />
                    )}
                    <ReferenceLine y={stats.avgMonthly} stroke={themeColors.accent} strokeDasharray="5 3" strokeWidth={1.5} />
                    <Bar
                      dataKey="total"
                      fill={activeGroup.color || themeColors.accent}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={42}
                      isAnimationActive={false}
                      activeBar={false}
                    >
                      {/* Angeschnittene Randmonate eines freien Zeitraums decken
                          nur einen Teil ihrer Tage ab — abgeblendet, damit sie
                          nicht als günstiger Monat missverstanden werden. */}
                      {chartWindow.map((p) => (
                        <Cell key={p.ym} fillOpacity={p.partial ? 0.45 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Die zwei Unterfunktionen nebeneinander: links das Ist (erfasste
              Buchungen), rechts die Planung (Vorschau). Beide Cards tragen ein
              Info-Popover, damit die Abgrenzung an Ort und Stelle nachlesbar
              ist. (hb-two bricht unter 900px auf eine Spalte um.) */}
          <div
            className="hb-two"
            style={{ alignItems: stats.byCategory.length === 0 && planned.items.length === 0 ? "stretch" : "start" }}
          >
            <Card>
              <CardContent>
                {/* Ist-Aufschlüsselung: zeigt, welche Kategorie wie viel zum
                    Ist-Wert beigetragen hat. */}
                <div className="hb-cg-section-head">
                  <span className="hb-title-with-help">
                    <h3 className="hb-cg-section-title">Erfasste Kosten</h3>
                    <HbTooltip size={17} text={HELP_ACTUAL} />
                  </span>
                  {stats.byCategory.length > 0 && (
                    <span className="hb-cg-catlist-total">{fmt(stats.total)}</span>
                  )}
                </div>
                {stats.byCategory.length === 0 ? (
                  <div className="hb-empty hb-empty--sm">
                    <div className="hb-empty-icon"><IconInbox /></div>
                    <div className="hb-empty-title">Keine Buchungen</div>
                    <div className="hb-empty-text">
                      Für die zugeordneten Kategorien gibt es im gewählten Zeitraum noch keine Buchungen.
                    </div>
                  </div>
                ) : (
                  <div className="hb-cg-breakdown">
                  {stats.byCategory.map((c) => {
                    const cat = expenseCategories.find((x) => x.id === c.categoryId);
                    const sub = c.subcategoryId ? (cat?.subcategories || []).find((s) => s.id === c.subcategoryId) : null;
                    const primary = sub ? sub.name : (cat?.name || "Unkategorisiert");
                    const parent = sub ? cat?.name : null;
                    const pct = stats.total > 0 ? Math.round((c.total / stats.total) * 100) : 0;
                    return (
                      <div key={c.subcategoryId || c.categoryId} className="hb-cg-breakdown-row">
                        <div className="hb-cg-breakdown-top">
                          <div className="hb-cg-breakdown-info">
                            <span className="hb-cat-dot" style={{ background: cat?.color || "var(--muted)" }} />
                            <div className="hb-cg-breakdown-names">
                              <span className="hb-cg-breakdown-name">{primary}</span>
                              {parent && <span className="hb-cg-breakdown-parent">{parent}</span>}
                            </div>
                          </div>
                          <div className="hb-cg-breakdown-values">
                            <span className="hb-cg-breakdown-amount">{fmt(c.total)}</span>
                            <span className="hb-cg-breakdown-share">{pct} %</span>
                          </div>
                        </div>
                        <div className="hb-cg-breakdown-bar">
                          <div
                            className="hb-cg-breakdown-bar-fill"
                            style={{ width: `${pct}%`, background: activeGroup.color || "var(--accent)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </CardContent>
            </Card>

            {/* Planung (Soll) — reine Vorschau, fliesst nicht ins Ist ein */}
            <Card>
              <CardContent>
                <div className="hb-cg-section-head">
                  <span className="hb-title-with-help">
                    <h3 className="hb-cg-section-title">Planung</h3>
                    <HbTooltip size={17} text={HELP_PLAN} />
                  </span>
                  {/* Nur neben einer gefüllten Liste: im Empty-State trägt der
                      dortige Button die Aktion — zwei gleiche CTAs wären Noise. */}
                  {planned.items.length > 0 && (
                    <Button size="sm" variant="outline" onClick={openPlanItemCreate}>
                      <IconPlus width={14} height={14} /> Posten hinzufügen
                    </Button>
                  )}
                </div>
                {planned.items.length === 0 ? (
                  <div className="hb-empty hb-empty--sm">
                    <div className="hb-empty-icon"><IconFixed /></div>
                    <div className="hb-empty-title">Noch keine geplanten Kosten</div>
                    <div className="hb-empty-text">
                      Lege z.B. „Service 400.- jährlich" oder „Reifen 800.- alle 2 Jahre" an, um
                      unregelmäßige Kosten auf einen Betrag pro Monat umzurechnen.
                    </div>
                    <Button size="sm" onClick={openPlanItemCreate}>
                      <IconPlus width={14} height={14} /> Posten hinzufügen
                    </Button>
                  </div>
                ) : (
                  <div className="hb-cg-planned-list">
                    {planned.items.map((p, idx) => {
                      const label = p.name || "Posten";
                      const isLast = idx === planned.items.length - 1;
                      return (
                        <div
                          key={p.id}
                          className={"hb-cg-planned-row" + (isLast ? " hb-cg-planned-row--last" : "")}
                        >
                          <span className="hb-cg-planned-name">{label}</span>
                          <span className="hb-cg-planned-meta">{fmt(p.amount)} · {intervalLabel(p.intervalMonths)}</span>
                          <span className="hb-cg-planned-monthly">{fmt(p.monthly)}/Mt.</span>
                          {/* Zeilen-Aktionen über das projektweite Kebab-Menü —
                              dauerhaft sichtbar, damit sie auffindbar bleiben. */}
                          <OverflowMenu
                            label={`Aktionen für ${label}`}
                            buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                            items={[
                              { label: "Bearbeiten", onClick: () => openPlanItemEdit(p.id) },
                              { label: "Löschen", danger: true, onClick: () => deletePlanItem(p) },
                            ]}
                          />
                        </div>
                      );
                    })}
                    <div className="hb-cg-planned-total">
                      <span>Plan Ø/Monat</span>
                      <span>{fmt(planned.expectedMonthly)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {renderDialog()}
      {renderPlanItemDialog()}
    </div>
  );

  // ── Zeitraumwähler: Pills + Popover für den freien Zeitraum ──────────────
  // Beide Kopfzeilen (Übersicht und Detail) teilen sich diese Funktion, damit
  // Popover-Logik und Validierung nur an einer Stelle leben.
  function renderRangeSelector(style) {
    return (
      <div className="hb-cg-range" ref={rangeWrapRef} style={style}>
        <RangeTabs
          options={MONTH_RANGE_OPTIONS}
          value={rangeOption}
          onChange={handleRangeChange}
          ariaLabel="Zeitraum wählen"
        />
        <RangeTabs
          options={customRangeOptions}
          value={rangeOption}
          onChange={handleRangeChange}
          ariaLabel="Eigenen Zeitraum wählen"
        />
        {rangePickerOpen && (
          <div className="hb-cg-range-popover" role="dialog" aria-label="Eigenen Zeitraum wählen">
            <div className="hb-field">
              <div className="hb-label">Von</div>
              <HbDatePicker
                value={draftRange.from}
                onChange={(v) => setDraftRange((r) => ({ ...r, from: v }))}
                style={{ width: "100%" }}
              />
            </div>
            <div className="hb-field">
              <div className="hb-label">Bis</div>
              <HbDatePicker
                value={draftRange.to}
                onChange={(v) => setDraftRange((r) => ({ ...r, to: v }))}
                style={{ width: "100%" }}
              />
            </div>
            {rangeError && <p className="hb-cg-range-error">{rangeError}</p>}
            <div className="hb-cg-range-actions">
              <Button size="sm" variant="outline" onClick={resetRange}>Zurücksetzen</Button>
              <Button size="sm" disabled={!!rangeError} onClick={applyRange}>Übernehmen</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Übersicht: alle Gruppen als Kachel-Grid (Stil der Dashboard-Töpfe) ────
  function renderOverview() {
    return (
      <>
        {/* Kopfzeile: Titel + Zeitraumwähler + Neue Gruppe */}
        <div className="hb-cg-head">
          <h2 className="hb-cg-overview-title">Kostengruppen</h2>
          <div className="hb-cg-head-actions">
            {renderRangeSelector()}
            <Button onClick={openCreateDialog}>
              <IconPlus /> Neue Gruppe
            </Button>
          </div>
        </div>

        <div className="hb-pot-grid">
          {groupCards.map(({ group, stats: gStats, planned: gPlanned }) => (
            <button
              key={group.id}
              type="button"
              className="hb-pot-card hb-cg-card"
              onClick={() => openDetail(group.id)}
              title={`${group.name} öffnen`}
            >
              <div className="hb-pot-card-top">
                <div className="hb-pot-card-head">
                  <div className="hb-pot-card-name">
                    <span className="hb-cat-dot" style={{ background: group.color || "var(--accent)", flexShrink: 0 }} />
                    <span className="hb-cg-card-name-text">{group.name}</span>
                  </div>
                  <div className="hb-pot-card-amount">{fmt(gStats.avgMonthly)}</div>
                </div>
                {/* Leitzahl ist bewusst das Ist: echte Daten, über alle Gruppen
                    hinweg vergleichbar — auch wenn keine Planung gepflegt ist. */}
                <span className="hb-pot-savings-tag">Ist Ø/Monat</span>
              </div>
              {gStats.monthlySeries.length > 1 && (
                <div className="hb-cg-card-spark" aria-hidden="true">
                  <ResponsiveContainer width="100%" height={48}>
                    <LineChart data={gStats.monthlySeries} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
                      <Line
                        type="monotone"
                        dataKey="total"
                        stroke={group.color || themeColors.accent}
                        strokeWidth={1.8}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className={"hb-pot-card-foot" + (gPlanned.items.length > 0 ? "" : " hb-pot-card-foot--empty")}>
                {gPlanned.items.length > 0 ? (
                  <>
                    <span className="hb-pot-card-foot-label">Plan Ø/Monat</span>
                    <span className="hb-pot-card-foot-value">{fmt(gPlanned.expectedMonthly)}/Mt.</span>
                  </>
                ) : (
                  <span>Keine Planung hinterlegt</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </>
    );
  }

  // ── Einzelner Planungsposten (kleiner Dialog aus der Planungs-Card) ───────
  function renderPlanItemDialog() {
    const amount = parseAmount(planItemDraft.amount);
    const validAmount = Number.isFinite(amount) && amount > 0;
    const interval = Math.max(1, Number(planItemDraft.intervalMonths || 1));
    const isEdit = Boolean(planItemDraft.id);
    return (
      <EditDialog
        open={planItemOpen}
        title={isEdit ? "Geplanten Posten bearbeiten" : "Geplanten Posten hinzufügen"}
        onClose={() => setPlanItemOpen(false)}
        onSave={savePlanItem}
        canSave={planItemDraft.name.trim().length > 0 && validAmount}
        saveLabel={isEdit ? "Speichern" : "Hinzufügen"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div className="hb-cg-picker-hint" style={{ marginTop: 0 }}>
            Erwartete, oft unregelmäßige Kosten. Sie werden auf einen Betrag pro Monat
            umgerechnet und den erfassten Kosten gegenübergestellt — nicht dazugerechnet.
          </div>

          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input hb-full"
              style={{ minWidth: 0 }}
              type="text"
              placeholder="z.B. Service, Reifen, Versicherung"
              value={planItemDraft.name}
              onChange={(e) => setPlanItemDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>

          <div className="hb-two hb-two--dialog" style={{ gap: 14 }}>
            <div className="hb-field">
              <div className="hb-label">Betrag ({baseCurrency})</div>
              <input
                className="hb-input"
                type="text"
                inputMode="decimal"
                placeholder="z.B. 400"
                value={planItemDraft.amount}
                onChange={(e) => setPlanItemDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
            <div className="hb-field">
              <div className="hb-label">Intervall</div>
              <select
                className="hb-input"
                value={planItemDraft.intervalMonths}
                onChange={(e) => setPlanItemDraft((d) => ({ ...d, intervalMonths: Number(e.target.value) }))}
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.months} value={o.months}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Live-Vorschau: macht die Umrechnung Betrag ÷ Intervall sichtbar,
              bevor gespeichert wird — dieselbe Kernaussage wie die Card. */}
          <div className="hb-cg-plan-expected">
            Rücklagenbedarf: <strong>{fmt(validAmount ? amount / interval : 0)}</strong> pro Monat
          </div>
        </div>
      </EditDialog>
    );
  }

  // ── Dialog-Render (geteilt zwischen Empty-State und Normalansicht) ────────
  function renderDialog() {
    return (
      <EditDialog
        open={dialogOpen}
        title={editingGroup ? "Kostengruppe bearbeiten" : "Neue Kostengruppe"}
        onClose={closeDialog}
        onSave={saveGroup}
        canSave={canSave}
        saveLabel={editingGroup ? "Speichern" : "Erstellen"}
        size="medium"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div className="hb-field">
            <div className="hb-label">Name</div>
            <input
              className="hb-input"
              style={{ width: "100%", minWidth: 0 }}
              type="text"
              placeholder="z.B. Auto, Haustier, Hobby"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div className="hb-field">
            <div className="hb-label">Farbe</div>
            <div className="hb-cg-color-row">
              {CUSTOM_CATEGORY_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`hb-cg-color-swatch${draft.color === c ? " hb-cg-color-swatch--active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  aria-label={`Farbe ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="hb-field hb-hcat-picker">
            <div className="hb-label">Kategorien & Unterkategorien</div>
            <div className="hb-hcat-box">
              {expenseCategories.map((cat) => {
                const hasSubs = (cat.subcategories || []).length > 0;
                const isExpanded = expanded.has(cat.id);
                const catChecked = draft.categoryIds.includes(cat.id);
                return (
                  <div key={cat.id} className="hb-hcat-group">
                    <div className={"hb-hcat-parent-row" + (catChecked ? " hb-hcat-parent-row--selected" : "")}>
                      <label className="hb-hcat-radio-label">
                        <input
                          type="checkbox"
                          className="hb-hcat-radio"
                          checked={catChecked}
                          onChange={() => toggleCategory(cat.id)}
                        />
                        <span className="hb-cat-dot" style={{ background: cat.color || "var(--accent)", flexShrink: 0 }} />
                        <span className="hb-hcat-parent-name">{cat.name}</span>
                      </label>
                      {hasSubs && (
                        <button
                          type="button"
                          className={"hb-hcat-expand-btn" + (isExpanded ? " hb-hcat-expand-btn--open" : "")}
                          onClick={() => toggleExpand(cat.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? `${cat.name} zuklappen` : `${cat.name} aufklappen`}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M4.5 6L8 9.5L11.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {hasSubs && isExpanded && (
                      <div className="hb-hcat-sub-list">
                        {cat.subcategories.map((sub) => {
                          const subChecked = draft.subcategoryIds.includes(sub.id);
                          return (
                            <label key={sub.id} className={"hb-hcat-sub-row" + (subChecked ? " hb-hcat-sub-row--selected" : "")}>
                              <input
                                type="checkbox"
                                className="hb-hcat-radio"
                                checked={subChecked}
                                onChange={() => toggleSubcategory(sub.id)}
                                disabled={catChecked}
                              />
                              <span className="hb-cat-dot" style={{ background: cat.color || "var(--accent)", opacity: 0.55, flexShrink: 0 }} />
                              <span className="hb-hcat-sub-name">{sub.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="hb-cg-picker-hint">
              Ganze Kategorie wählen erfasst alle ihre Buchungen. Für mehr Genauigkeit einzelne
              Unterkategorien ankreuzen.
            </div>
          </div>
        </div>
      </EditDialog>
    );
  }
}
