import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/toastContext.js";
import { IconCostGroups, IconPlus, IconEdit, IconDelete, IconCheck, IconInbox, IconFixed } from "../components/icons.jsx";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { useThemeColors } from "../hooks/themeColors.js";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { generateId } from "../utils/idUtils.js";
import { DEFAULT_EXPENSE_CATEGORIES, parseAmount, formatCurrencyAxis } from "../utils/hbUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { CUSTOM_CATEGORY_PALETTE } from "../utils/hbPalette.js";
import { calcCostGroupStats, calcExpectedMonthly } from "../utils/costGroupUtils.js";

const RANGE_OPTIONS = [
  { id: "12", label: "12 M" },
  { id: "24", label: "24 M" },
  { id: "all", label: "Gesamt" },
];

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

const EMPTY_DRAFT = { name: "", color: CUSTOM_CATEGORY_PALETTE[0], categoryIds: [], subcategoryIds: [], plannedItems: [] };

export default function CostGroupsView({ activeBook, onUpdateBook, monthStartDay = 1 }) {
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
  const [rangeOption, setRangeOption] = useState("12");
  // Scrollfenster des Verlaufscharts (0 = neueste 12 Monate)
  const [chartOffset, setChartOffset] = useState(0);

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
  const groupCards = useMemo(() => {
    return costGroups.map((group) => {
      const stats = calcCostGroupStats(group, entries, { rangeOption, monthStartDay });
      const planned = calcExpectedMonthly(group.plannedItems);
      return {
        group,
        stats,
        planned,
        combinedMonthly: planned.expectedMonthly + stats.avgMonthly,
      };
    });
  }, [costGroups, entries, rangeOption, monthStartDay]);

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

  // Chart-Fenster: max. 12 Monate sichtbar, ältere per ‹ › erreichbar
  const chartSeries = stats?.monthlySeries || EMPTY_ARRAY;
  const chartMaxOffset = Math.max(0, chartSeries.length - 12);
  const chartWindow = useMemo(() => {
    const start = Math.max(0, chartSeries.length - 12 - chartOffset);
    return chartSeries.slice(start, start + 12);
  }, [chartSeries, chartOffset]);

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
      plannedItems: (group.plannedItems || []).map((p) => ({
        id: p.id,
        name: p.name || "",
        amount: String(p.amount ?? ""),
        intervalMonths: Number(p.intervalMonths || 12),
      })),
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

  // Planungsposten (zu erwartende Kosten)
  function addPlannedItem() {
    setDraft((d) => ({
      ...d,
      plannedItems: [...d.plannedItems, { id: generateId("plan"), name: "", amount: "", intervalMonths: 12 }],
    }));
  }

  function updatePlannedItem(id, patch) {
    setDraft((d) => ({
      ...d,
      plannedItems: d.plannedItems.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removePlannedItem(id) {
    setDraft((d) => ({ ...d, plannedItems: d.plannedItems.filter((p) => p.id !== id) }));
  }

  // Live-Vorschau des erwarteten Betrags im Dialog
  const draftExpectedMonthly = useMemo(() => {
    return draft.plannedItems.reduce((s, p) => {
      const amt = parseAmount(p.amount);
      const interval = Math.max(1, Number(p.intervalMonths || 1));
      return Number.isFinite(amt) ? s + amt / interval : s;
    }, 0);
  }, [draft.plannedItems]);

  const canSave = useMemo(() => {
    return draft.name.trim().length > 0 && (draft.categoryIds.length > 0 || draft.subcategoryIds.length > 0);
  }, [draft]);

  function saveGroup() {
    if (!activeBook || !canSave) return;
    // Planungsposten bereinigen: nur Posten mit gültigem Betrag übernehmen
    const cleanPlanned = draft.plannedItems
      .map((p) => ({
        id: p.id,
        name: p.name.trim(),
        amount: parseAmount(p.amount),
        intervalMonths: Math.max(1, Number(p.intervalMonths || 1)),
      }))
      .filter((p) => Number.isFinite(p.amount) && p.amount > 0);

    if (editingGroup) {
      const updated = costGroups.map((g) =>
        g.id === editingGroup.id
          ? { ...g, name: draft.name.trim(), color: draft.color, categoryIds: draft.categoryIds, subcategoryIds: draft.subcategoryIds, plannedItems: cleanPlanned }
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
        plannedItems: cleanPlanned,
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
              <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4, marginRight: 10 }}>
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`hb-pill-tab ${rangeOption === opt.id ? "hb-pill-tab-active" : ""}`}
                    onClick={() => { setRangeOption(opt.id); setChartOffset(0); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button onClick={() => openEditDialog(activeGroup)}>
                <IconEdit width={16} height={16} /> Bearbeiten
              </Button>
              <Button variant="outline" onClick={() => deleteGroup(activeGroup)}>
                <IconDelete width={16} height={16} /> Löschen
              </Button>
            </div>
          </div>

          {/* KPIs — immer alle rendern, auch ohne Daten (dann mit 0). Additives
              Modell: Ø/Monat = geplante Kosten (Soll) + Kategorie-Ist. */}
          <div className="hb-stat-pills">
            <div className="hb-stat-pill hb-stat-pill--accent">
              <span className="hb-stat-pill-label">Kosten Ø/Monat</span>
              <span className="hb-stat-pill-value">{fmt(activeCard.combinedMonthly)}</span>
            </div>
            <div className="hb-stat-pill hb-stat-pill--accent">
              <span className="hb-stat-pill-label">Geplant</span>
              <span className="hb-stat-pill-value">{fmt(planned.expectedMonthly)}</span>
            </div>
            <div className="hb-stat-pill hb-stat-pill--accent">
              <span className="hb-stat-pill-label">Aus Kategorien</span>
              <span className="hb-stat-pill-value">{fmt(stats.avgMonthly)}</span>
            </div>
            <div className="hb-stat-pill hb-stat-pill--accent">
              <span className="hb-stat-pill-label">Gesamt im Zeitraum</span>
              <span className="hb-stat-pill-value">{fmt(activeCard.combinedMonthly * stats.monthCount)}</span>
            </div>
          </div>

          {/* Kostenverlauf: Ist-Kosten pro Monat, Referenzlinien für Ø (Kategorien)
              und Ø inkl. geplant — Chart-Idiom wie FixedCostTrendSection. */}
          <Card style={{ marginBottom: 20 }}>
            <CardContent>
              <div className="hb-row" style={{ alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <h4 style={{ margin: 0, fontSize: 15 }}>Kostenverlauf</h4>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                    <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.accent} strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                    Ø Kategorien
                  </span>
                  {planned.expectedMonthly > 0 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: themeColors.muted }}>
                      <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={themeColors.orange} strokeWidth="1.5" strokeDasharray="5 3" /></svg>
                      Ø inkl. geplant
                    </span>
                  )}
                </div>
                {chartMaxOffset > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button type="button" className="hb-icon-btn" onClick={() => setChartOffset((o) => Math.min(o + 1, chartMaxOffset))} disabled={chartOffset >= chartMaxOffset} title="Älteren Bereich anzeigen">‹</button>
                    <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{chartWindowLabel}</span>
                    <button type="button" className="hb-icon-btn" onClick={() => setChartOffset((o) => Math.max(o - 1, 0))} disabled={chartOffset === 0} title="Neueren Bereich anzeigen">›</button>
                  </div>
                )}
              </div>

              {chartWindow.length === 0 ? (
                <div className="hb-cg-empty-text">
                  Im gewählten Zeitraum gibt es keine Buchungen in den zugeordneten Kategorien.
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
                        return (
                          <div className="hb-chart-tooltip">
                            <span className="hb-chart-tooltip-label">{label}</span>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                              <span>Kosten</span>
                              <span>{fmt(payload[0].value)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {planned.expectedMonthly > 0 && (
                      <ReferenceLine y={activeCard.combinedMonthly} stroke={themeColors.orange} strokeDasharray="5 3" strokeWidth={1.5} />
                    )}
                    <ReferenceLine y={stats.avgMonthly} stroke={themeColors.accent} strokeDasharray="5 3" strokeWidth={1.5} />
                    <Bar
                      dataKey="total"
                      fill={activeGroup.color || themeColors.accent}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={42}
                      isAnimationActive={false}
                      activeBar={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Kategorien im Zeitraum + Geplante Kosten nebeneinander in zwei
              Cards (hb-two, bricht unter 900px auf eine Spalte um). */}
          <div
            className="hb-two"
            style={{ alignItems: stats.byCategory.length === 0 && planned.items.length === 0 ? "stretch" : "start" }}
          >
            <Card>
              <CardContent>
                {/* Kategorien im Zeitraum — dezente Ist-Aufschlüsselung: zeigt, welche
                    Kategorie wie viel zum „Kategorien"-Wert beigetragen hat. */}
                <div className="hb-cg-section-head">
                  <h3 className="hb-cg-section-title">Kategorien im Zeitraum</h3>
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

            {/* Geplante Kosten (zu erwartende Kosten / Soll) */}
            <Card>
              <CardContent>
                <h3 className="hb-cg-section-title">Geplante Kosten</h3>
                {planned.items.length === 0 ? (
                  <div className="hb-empty hb-empty--sm">
                    <div className="hb-empty-icon"><IconFixed /></div>
                    <div className="hb-empty-title">Noch keine geplanten Kosten</div>
                    <div className="hb-empty-text">
                      Lege z.B. „Service 400.- jährlich" oder „Reifen 800.- alle 2 Jahre" an, um
                      unregelmäßige Kosten auf einen Betrag pro Monat umzurechnen.
                    </div>
                  </div>
                ) : (
                  <div className="hb-cg-planned-list">
                    {planned.items.map((p) => (
                      <div key={p.id} className="hb-cg-planned-row">
                        <span className="hb-cg-planned-name">{p.name || "Posten"}</span>
                        <span className="hb-cg-planned-meta">{fmt(p.amount)} · {intervalLabel(p.intervalMonths)}</span>
                        <span className="hb-cg-planned-monthly">{fmt(p.monthly)}/Mt.</span>
                      </div>
                    ))}
                    <div className="hb-cg-planned-total">
                      <span>Erwartet Ø/Monat</span>
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
    </div>
  );

  // ── Übersicht: alle Gruppen als Kachel-Grid (Stil der Dashboard-Töpfe) ────
  function renderOverview() {
    return (
      <>
        {/* Kopfzeile: Titel + Zeitraumwähler + Neue Gruppe */}
        <div className="hb-cg-head">
          <h2 className="hb-cg-overview-title">Kostengruppen</h2>
          <div className="hb-cg-head-actions">
            <div className="hb-pill-tabs" role="group" style={{ padding: "2px 4px", gap: 4 }}>
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`hb-pill-tab ${rangeOption === opt.id ? "hb-pill-tab-active" : ""}`}
                  onClick={() => { setRangeOption(opt.id); setChartOffset(0); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button onClick={openCreateDialog}>
              <IconPlus /> Neue Gruppe
            </Button>
          </div>
        </div>

        <div className="hb-pot-grid">
          {groupCards.map(({ group, stats: gStats, planned: gPlanned, combinedMonthly }) => (
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
                  <div className="hb-pot-card-amount">{fmt(combinedMonthly)}</div>
                </div>
                <span className="hb-pot-savings-tag">Ø/Monat</span>
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
                    <span className="hb-pot-card-foot-label">Geplant</span>
                    <span className="hb-pot-card-foot-value">{fmt(gPlanned.expectedMonthly)}/Mt.</span>
                  </>
                ) : (
                  <span>Keine geplanten Kosten</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </>
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

          {/* Geplante Kosten (zu erwartende Kosten) */}
          <div className="hb-field">
            <div className="hb-label">Geplante Kosten (optional)</div>
            <div className="hb-cg-picker-hint" style={{ marginTop: 0, marginBottom: 10 }}>
              Erwartete, oft unregelmäßige Kosten. Werden automatisch auf einen Betrag pro Monat
              umgerechnet und mit den tatsächlichen Kosten verglichen.
            </div>
            {draft.plannedItems.length > 0 && (
              <div className="hb-cg-plan-editor">
                {draft.plannedItems.map((p) => (
                  <div key={p.id} className="hb-cg-plan-edit-row">
                    <input
                      className="hb-input"
                      type="text"
                      placeholder="z.B. Service"
                      value={p.name}
                      onChange={(e) => updatePlannedItem(p.id, { name: e.target.value })}
                    />
                    <input
                      className="hb-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="Betrag"
                      value={p.amount}
                      onChange={(e) => updatePlannedItem(p.id, { amount: e.target.value })}
                    />
                    <select
                      className="hb-input"
                      value={p.intervalMonths}
                      onChange={(e) => updatePlannedItem(p.id, { intervalMonths: Number(e.target.value) })}
                    >
                      {INTERVAL_OPTIONS.map((o) => (
                        <option key={o.months} value={o.months}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="hb-icon-btn hb-icon-btn--danger"
                      onClick={() => removePlannedItem(p.id)}
                      title="Posten entfernen"
                      aria-label="Posten entfernen"
                    >
                      <IconDelete width={15} height={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="hb-cg-plan-footer">
              <Button size="sm" variant="outline" onClick={addPlannedItem}>
                <IconPlus width={14} height={14} /> Posten hinzufügen
              </Button>
              {draftExpectedMonthly > 0 && (
                <span className="hb-cg-plan-expected">Erwartet Ø/Monat: <strong>{fmt(draftExpectedMonthly)}</strong></span>
              )}
            </div>
          </div>
        </div>
      </EditDialog>
    );
  }
}
