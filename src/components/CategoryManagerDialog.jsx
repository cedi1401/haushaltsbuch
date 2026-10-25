import React, { useState, useMemo, useRef } from "react";
import EditDialog from "./EditDialog.jsx";
import CategoryCreateDialog from "./CategoryCreateDialog.jsx";
import CategoryEditDialog from "./CategoryEditDialog.jsx";
import SavingsPositionFormDialog from "./SavingsPositionFormDialog.jsx";
import OverflowMenu from "./OverflowMenu.jsx";
import { IconEdit, IconPlus, IconTransfer, IconSearch, IconChevron } from "./icons.jsx";
import HbTooltip from "./HbTooltip.jsx";
import { CHART_COLORS, DEFAULT_CATEGORY_COLOR } from "../utils/hbPalette.js";
import { Button } from "./ui.jsx";
import { useUndo } from "../contexts/UndoContext.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { generateId } from "../utils/idUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import {
  getActiveTransferCategories,
  addTransferCategory as addTransferCategoryToList,
  renameTransferCategory,
  deleteTransferCategory as deleteTransferCategoryFromList,
  NO_PURPOSE_LABEL,
} from "../utils/transferCategoryUtils.js";

// Sieb auf Item-Ebene: erst entscheiden, welche Unterkategorien sichtbar sind,
// dann daraus ableiten, ob die Oberkategorie überhaupt gezeigt wird. Dadurch
// bleibt eine Standard-Oberkategorie im Filter "custom" als reiner Kontext-
// Container stehen, solange sie eigene Unterkategorien enthält.
function filterCategories(categories, search, filter) {
  const q = search.trim().toLowerCase();
  const customOnly = filter === "custom";
  const result = [];

  for (const cat of categories || []) {
    const allSubs = cat.subcategories || [];
    const parentMatches = !q || cat.name.toLowerCase().includes(q);
    const subs = allSubs.filter((sub) => {
      if (customOnly && sub.isDefault) return false;
      return parentMatches || sub.name.toLowerCase().includes(q);
    });
    // Ohne sichtbare Kinder bleibt die Oberkategorie nur, wenn sie selbst ein
    // Treffer ist — im Custom-Filter zählt ein Namens-Match einer Standard-
    // Kategorie ausdrücklich nicht.
    const selfVisible = parentMatches && (!customOnly || !cat.isDefault);
    if (subs.length === 0 && !selfVisible) continue;
    result.push(subs.length === allSubs.length ? cat : { ...cat, subcategories: subs });
  }

  return result;
}

// -------------------------------------------------------
// Haupt-Dialog: Alle Kategorien verwalten
// -------------------------------------------------------
export default function CategoryManagerDialog({
  open,
  onClose,
  expenseCategories,
  incomeCategories,
  transferCategories = EMPTY_ARRAY,
  pots = EMPTY_ARRAY,
  onUpdateExpenseCategories,
  onUpdateIncomeCategories,
  onUpdateTransferCategories,
}) {
  const fmt = useFmt();
  const undo = useUndo();
  const { confirm } = useConfirm();
  // `transferCategories` ist die volle Liste inkl. gelöschter Zwecke (die
  // bleiben für bestehende Buchungen erhalten); angezeigt werden nur die aktiven.
  const activeTransfers = useMemo(
    () => getActiveTransferCategories(transferCategories),
    [transferCategories]
  );
  // Sparpositionen: eigene Suche, Sub-Dialog zum Anlegen/Bearbeiten
  const [transferSearch, setTransferSearch] = useState("");
  const [transferFormOpen, setTransferFormOpen] = useState(false);
  const [transferEditTarget, setTransferEditTarget] = useState(null);
  // Fokus-Rückgabe nach Sub-Dialog und nach dem Löschen
  const transferEditBtnRefs = useRef({});
  const transferCreateBtnRef = useRef(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("categories"); // "categories" | "transfer"
  const [filter, setFilter] = useState("all"); // "all" | "custom"
  const [openAccordions, setOpenAccordions] = useState(new Set());
  // Während Suche/Custom-Filter sind alle sichtbaren Accordions offen, sonst
  // stünden im Custom-Filter leere Container da. Zugeklappte Einträge werden
  // hier separat gehalten und bei jeder Filteränderung verworfen.
  const [collapsedWhileFiltering, setCollapsedWhileFiltering] = useState(new Set());

  // Sub-Dialoge
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  // editTarget: { category, isSubcategory, parentCategory? }

  // Reset beim Schließen — abgeleitet aus dem open-Übergang statt via Effekt
  // (vermeidet set-state-in-effect und den zusätzlichen Render-Durchlauf).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setSearch("");
      setActiveTab("categories");
      setFilter("all");
      setOpenAccordions(new Set());
      setCollapsedWhileFiltering(new Set());
      setCreateOpen(false);
      setEditOpen(false);
      setEditTarget(null);
      setTransferSearch("");
      setTransferFormOpen(false);
      setTransferEditTarget(null);
    }
  }

  // -------------------------------------------------------
  // Sparpositionen (Transfer-Zwecke) CRUD
  // -------------------------------------------------------
  function focusTransferRow(id) {
    requestAnimationFrame(() => {
      const el = id ? transferEditBtnRefs.current[id] : null;
      (el || transferCreateBtnRef.current)?.focus();
    });
  }

  function openTransferCreate() {
    setTransferEditTarget(null);
    setTransferFormOpen(true);
  }

  function openTransferEdit(cat) {
    setTransferEditTarget(cat);
    setTransferFormOpen(true);
  }

  function closeTransferForm() {
    const targetId = transferEditTarget?.id || null;
    setTransferFormOpen(false);
    setTransferEditTarget(null);
    focusTransferRow(targetId);
  }

  function handleSaveTransfer({ name, potId }) {
    const target = transferEditTarget;
    if (target) {
      // Referenzen laufen über die ID — es reicht, den Namen in der Liste zu ändern.
      if (name !== target.name) {
        onUpdateTransferCategories?.(renameTransferCategory(transferCategories, target.id, name));
        undo.offer(`Sparposition „${target.name}“ in „${name}“ umbenannt.`);
      }
    } else {
      // Ein gleichnamiger gelöschter Zweck im selben Topf wird reaktiviert, samt
      // seiner Buchungen.
      onUpdateTransferCategories?.(addTransferCategoryToList(transferCategories, name, potId).list);
      undo.offer(`Sparposition „${name}“ erstellt.`);
    }
    closeTransferForm();
  }

  async function deleteTransferCategory(cat) {
    // Seit Schema 7 ist der Zweck auch die Sparposition — mit ihm verschwindet
    // die Rate aus den Fixkosten bzw. das Sparziel. Eine Mindestzahl gibt es
    // nicht mehr: „Ohne Sparposition" ist in jedem Topf wählbar.
    const positionNote =
      cat.rule === "goal"
        ? "\n\nDamit entfällt auch das Sparziel."
        : cat.rule === "reserve" || Number(cat.monthlyRate) > 0
          ? "\n\nDamit entfällt auch die monatliche Rate in den Fixkosten."
          : "";
    const ok = await confirm({
      title: "Sparposition löschen",
      message: `Sparposition „${cat.name}“ wirklich löschen?\n\nDas Geld bleibt im Topf und zählt in den Rücklagen unter „${NO_PURPOSE_LABEL}“. Bestehende Buchungen behalten ihren Namen.${positionNote}`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    // Fokus auf die Folgezeile, sonst auf „Neue Sparposition"
    const idx = activeTransfers.findIndex((c) => c.id === cat.id);
    const nextId = activeTransfers[idx + 1]?.id || activeTransfers[idx - 1]?.id || null;
    onUpdateTransferCategories?.(deleteTransferCategoryFromList(transferCategories, cat.id));
    undo.offer("Sparposition gelöscht.");
    focusTransferRow(nextId);
  }

  // Nach Topf gruppiert, in der Reihenfolge der Töpfe — wie Einnahmen/Ausgaben
  // im Kategorien-Tab. Zwecke ohne bekannten Topf landen in einer eigenen Gruppe.
  const trimmedTransferSearch = transferSearch.trim();
  const transferGroups = useMemo(() => {
    const needle = trimmedTransferSearch.toLocaleLowerCase("de");
    const visible = needle
      ? activeTransfers.filter((c) => c.name.toLocaleLowerCase("de").includes(needle))
      : activeTransfers;
    const groups = pots
      .map((pot) => ({ id: pot.id, label: pot.name, items: visible.filter((c) => c.potId === pot.id) }))
      .filter((g) => g.items.length > 0);
    const potIds = new Set(pots.map((p) => p.id));
    const orphans = visible.filter((c) => !potIds.has(c.potId));
    if (orphans.length > 0) groups.push({ id: "__none__", label: "Ohne Topf", items: orphans });
    return groups;
  }, [activeTransfers, pots, trimmedTransferSearch]);

  // -------------------------------------------------------
  // Gefilterte Kategorien
  // -------------------------------------------------------
  const filteredExpense = useMemo(
    () => filterCategories(expenseCategories, search, filter),
    [expenseCategories, search, filter]
  );

  const filteredIncome = useMemo(
    () => filterCategories(incomeCategories, search, filter),
    [incomeCategories, search, filter]
  );

  // Suche und Custom-Filter verhalten sich gleich: beide verengen die Liste
  // und klappen die verbleibenden Treffer auf.
  const isFiltering = search.trim() !== "" || filter === "custom";

  function resetCollapsed() {
    setCollapsedWhileFiltering((prev) => (prev.size ? new Set() : prev));
  }

  function changeFilter(next) {
    setFilter(next);
    resetCollapsed();
  }

  function changeSearch(next) {
    setSearch(next);
    resetCollapsed();
  }

  // -------------------------------------------------------
  // Accordion toggle
  // -------------------------------------------------------
  function toggleAccordion(id) {
    const setter = isFiltering ? setCollapsedWhileFiltering : setOpenAccordions;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // -------------------------------------------------------
  // CRUD: Neue Kategorie
  // -------------------------------------------------------
  function handleCreate({ name, color, parentId, isSubcategory }) {
    if (isSubcategory) {
      // Unterkategorie zur Oberkategorie hinzufügen
      const newSub = {
        id: generateId("sub_custom"),
        name,
        parentId,
        isDefault: false,
      };
      // Suche in expenseCategories
      const inExpense = (expenseCategories || []).some((c) => c.id === parentId);
      if (inExpense) {
        const updated = (expenseCategories || []).map((cat) =>
          cat.id === parentId
            ? { ...cat, subcategories: [...(cat.subcategories || []), newSub] }
            : cat
        );
        onUpdateExpenseCategories(updated);
      } else {
        const updated = (incomeCategories || []).map((cat) =>
          cat.id === parentId
            ? { ...cat, subcategories: [...(cat.subcategories || []), newSub] }
            : cat
        );
        onUpdateIncomeCategories(updated);
      }
    } else {
      // Neue Oberkategorie
      const newCat = {
        id: generateId("cat_custom"),
        name,
        color: color || DEFAULT_CATEGORY_COLOR,
        type: "expense",
        isDefault: false,
        budget: null,
        subcategories: [],
      };
      onUpdateExpenseCategories([...(expenseCategories || []), newCat]);
    }
  }

  // -------------------------------------------------------
  // CRUD: Kategorie bearbeiten
  // -------------------------------------------------------
  function handleEdit({ name, color }) {
    if (!editTarget) return;
    const { category, isSubcategory, parentCategory } = editTarget;

    if (isSubcategory && parentCategory) {
      // Unterkategorie umbenennen
      const updateList = (list) =>
        list.map((cat) =>
          cat.id === parentCategory.id
            ? {
                ...cat,
                subcategories: (cat.subcategories || []).map((s) =>
                  s.id === category.id ? { ...s, name } : s
                ),
              }
            : cat
        );
      const inExpense = (expenseCategories || []).some(
        (c) => c.id === parentCategory.id
      );
      if (inExpense) {
        onUpdateExpenseCategories(updateList(expenseCategories || []));
      } else {
        onUpdateIncomeCategories(updateList(incomeCategories || []));
      }
    } else {
      // Oberkategorie bearbeiten
      const updateList = (list) =>
        list.map((cat) =>
          cat.id === category.id ? { ...cat, name, color: color || cat.color } : cat
        );
      const inExpense = (expenseCategories || []).some((c) => c.id === category.id);
      if (inExpense) {
        onUpdateExpenseCategories(updateList(expenseCategories || []));
      } else {
        onUpdateIncomeCategories(updateList(incomeCategories || []));
      }
    }
  }

  // -------------------------------------------------------
  // CRUD: Kategorie löschen
  // -------------------------------------------------------
  function handleDelete() {
    if (!editTarget) return;
    const { category, isSubcategory, parentCategory } = editTarget;

    if (isSubcategory && parentCategory) {
      const updateList = (list) =>
        list.map((cat) =>
          cat.id === parentCategory.id
            ? {
                ...cat,
                subcategories: (cat.subcategories || []).filter(
                  (s) => s.id !== category.id
                ),
              }
            : cat
        );
      const inExpense = (expenseCategories || []).some(
        (c) => c.id === parentCategory.id
      );
      if (inExpense) {
        onUpdateExpenseCategories(updateList(expenseCategories || []));
      } else {
        onUpdateIncomeCategories(updateList(incomeCategories || []));
      }
    } else {
      const updateList = (list) => list.filter((c) => c.id !== category.id);
      const inExpense = (expenseCategories || []).some((c) => c.id === category.id);
      if (inExpense) {
        onUpdateExpenseCategories(updateList(expenseCategories || []));
      } else {
        onUpdateIncomeCategories(updateList(incomeCategories || []));
      }
    }
    undo.offer(`Kategorie „${category.name}“ gelöscht.`);
  }

  // -------------------------------------------------------
  // Hilfsfunktionen
  // -------------------------------------------------------
  function openEditForParent(cat) {
    setEditTarget({ category: cat, isSubcategory: false, parentCategory: null });
    setEditOpen(true);
  }

  function openEditForSub(sub, parentCat) {
    setEditTarget({ category: sub, isSubcategory: true, parentCategory: parentCat });
    setEditOpen(true);
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  // Kategorie-Liste rendern
  // isExpense: nur Ausgabenkategorien zeigen ihr Budget als Chip
  function renderCategoryList(categories, isExpense = false) {
    return categories.map((cat) => {
      const isOpen = isFiltering
        ? !collapsedWhileFiltering.has(cat.id)
        : openAccordions.has(cat.id);
      const hasSubs = (cat.subcategories || []).length > 0;
      const isCustom = !cat.isDefault;
      // Im Custom-Filter ist eine Standard-Oberkategorie nie selbst ein
      // Treffer, sondern nur Einordnung — sie bekommt deshalb keine Aktionen.
      const isContextRow = filter === "custom" && cat.isDefault;

      return (
        <div key={cat.id} className={`hb-cat-accordion-item${isOpen ? " hb-cat-accordion-open" : ""}`}>
          {/* Accordion Header */}
          <div
            className={`hb-cat-accordion-header${isContextRow ? " hb-cat-accordion-header--context" : ""}`}
            onClick={() => toggleAccordion(cat.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") toggleAccordion(cat.id);
            }}
          >
            <span className="hb-cat-dot" style={{ background: cat.color || CHART_COLORS.transfer }} />
            <span className="hb-cat-name">
              {cat.name}
              {/* Hinweis direkt am Namen. Der Wrapper fängt Klick sowie Enter
                  und Leertaste ab, sonst klappt das Fragezeichen das Accordion
                  mit um. Escape muss durch, damit der Dialog schließt. */}
              {cat.countsAsSavings && (
                <span
                  className="hb-cat-name-help"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
                  }}
                >
                  <HbTooltip
                    size={16}
                    text="Buchungen in dieser Kategorie erscheinen im Ausgaben-Diagramm, zählen aber als Sparen und fließen in die Sparquote ein — nicht in die Ausgaben."
                  />
                </span>
              )}
            </span>

            {/* Budget-Chip: reine Anzeige, gepflegt wird im Budget-View */}
            {isExpense && cat.budget != null && (
              <span
                className="hb-cat-budget-chip"
                title={`Budget pro Monat: ${fmt(cat.budget, 0)}`}
              >
                {fmt(cat.budget, 0)}
              </span>
            )}

            {isCustom && (
              <button
                type="button"
                className="hb-cat-edit-btn"
                onClick={(e) => { e.stopPropagation(); openEditForParent(cat); }}
                aria-label={`${cat.name} bearbeiten`}
                title="Bearbeiten"
              >
                <IconEdit />
              </button>
            )}
            {hasSubs && (
              <IconChevron className={`hb-cat-chevron${isOpen ? " hb-cat-chevron-open" : ""}`} />
            )}
          </div>

          {/* Unterkategorien */}
          {isOpen && hasSubs && (
            <div className="hb-cat-sublist">
              {(cat.subcategories || []).map((sub) => {
                const isCustomSub = !sub.isDefault;
                return (
                  <div key={sub.id} className="hb-cat-subitem">
                    <span
                      className="hb-cat-dot"
                      style={{ background: cat.color || CHART_COLORS.transfer, opacity: 0.65 }}
                    />
                    <span className="hb-cat-subitem-name">{sub.name}</span>

                    {/* Budget-Chip Sub */}
                    {isExpense && sub.budget != null && (
                      <span
                        className="hb-cat-budget-chip"
                        title={`Budget pro Monat: ${fmt(sub.budget, 0)}`}
                      >
                        {fmt(sub.budget, 0)}
                      </span>
                    )}

                    {isCustomSub && (
                      <button
                        type="button"
                        className="hb-cat-edit-btn"
                        onClick={() => openEditForSub(sub, cat)}
                        aria-label={`${sub.name} bearbeiten`}
                        title="Bearbeiten"
                      >
                        <IconEdit />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  const allExpense = filteredExpense;
  const allIncome = filteredIncome;
  const hasIncome = allIncome.length > 0;
  const isEmpty = allExpense.length === 0 && allIncome.length === 0;

  // Der generische Text "Keine Kategorien gefunden." wäre im Custom-Filter
  // irreführend — dort gibt es Kategorien, nur keine eigenen.
  function renderEmptyState() {
    const trimmedSearch = search.trim();

    if (filter !== "custom") {
      return (
        <div className="hb-hcat-empty">
          Keine Kategorien gefunden.
        </div>
      );
    }

    if (trimmedSearch) {
      return (
        <div className="hb-empty hb-empty--sm">
          <div className="hb-empty-icon"><IconSearch /></div>
          <div className="hb-empty-title">Keine eigenen Kategorien gefunden</div>
          <div className="hb-empty-text">
            Für „{trimmedSearch}“ gibt es keine eigene Kategorie.
          </div>
          <button
            type="button"
            className="hb-btn-ghost hb-btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => changeFilter("all")}
          >
            In allen Kategorien suchen
          </button>
        </div>
      );
    }

    return (
      <div className="hb-empty hb-empty--sm">
        <div className="hb-empty-icon"><IconPlus /></div>
        <div className="hb-empty-title">Noch keine eigenen Kategorien</div>
        <div className="hb-empty-text">
          Erstelle über „+ Neue Kategorie“ eine eigene Ober- oder Unterkategorie.
        </div>
      </div>
    );
  }

  return (
    <>
      <EditDialog
        open={open}
        title={
          <span className="hb-title-with-help">
            Kategorien bearbeiten
            <HbTooltip
              placement="bottom"
              text="Budgets legst du in der Ansicht „Budgets“ fest. Hier siehst du nur, welche Kategorien eines haben."
            />
          </span>
        }
        onClose={onClose}
        onSave={null}
        canSave={false}
        saveLabel={null}
        size="wide"
        hideFooter
      >
        <div className="hb-cat-manager">
          {/* Kopfzeile: Tabs links, Filter (Alle/Eigene) rechts daneben */}
          <div className="hb-cat-tabbar">
            <div
              className="hb-segmented hb-segmented--md hb-cat-tabs"
              role="tablist"
              aria-label="Kategorie-Bereiche"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "categories"}
                className={`hb-segmented__item${activeTab === "categories" ? " hb-segmented__item--active" : ""}`}
                onClick={() => setActiveTab("categories")}
              >
                Kategorien
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "transfer"}
                className={`hb-segmented__item${activeTab === "transfer" ? " hb-segmented__item--active" : ""}`}
                onClick={() => setActiveTab("transfer")}
              >
                Sparpositionen
              </button>
            </div>

            {/* Sekundärer Filter: Alle / Eigene — nur im Kategorien-Tab */}
            {activeTab === "categories" && (
              <div className="hb-segmented hb-segmented--md hb-cat-filter-row">
                <button
                  type="button"
                  aria-pressed={filter === "all"}
                  className={`hb-segmented__item${filter === "all" ? " hb-segmented__item--active" : ""}`}
                  onClick={() => changeFilter("all")}
                >
                  Alle Kategorien
                </button>
                <button
                  type="button"
                  aria-pressed={filter === "custom"}
                  className={`hb-segmented__item${filter === "custom" ? " hb-segmented__item--active" : ""}`}
                  onClick={() => changeFilter("custom")}
                >
                  Eigene Kategorien
                </button>
              </div>
            )}
          </div>

          {activeTab === "categories" ? (
            <>
              {/* Header: Suchfeld + Button */}
              <div className="hb-cat-manager-header">
                <div className="hb-search-field">
                  <span className="hb-search-icon"><IconSearch width={16} height={16} /></span>
                  <input
                    className="hb-input"
                    type="text"
                    placeholder="Kategorie suchen..."
                    value={search}
                    onChange={(e) => changeSearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  + Neue Kategorie
                </Button>
              </div>

              {/* Kategorie-Liste */}
              <div className="hb-cat-list">
                {isEmpty && renderEmptyState()}

                {hasIncome && (
                  <>
                    <div className="hb-label" style={{ padding: "6px 0 4px" }}>
                      Einnahmen
                    </div>
                    {renderCategoryList(allIncome, false)}
                  </>
                )}

                {allExpense.length > 0 && (
                  <>
                    <div className="hb-label" style={{ padding: hasIncome ? "12px 0 4px" : "6px 0 4px" }}>
                      Ausgaben
                    </div>
                    {renderCategoryList(allExpense, true)}
                  </>
                )}
              </div>
            </>
          ) : (
            /* Tab: Sparpositionen — Aufbau wie der Kategorien-Tab */
            <>
              <div className="hb-cat-manager-header">
                <div className="hb-search-field">
                  <span className="hb-search-icon"><IconSearch width={16} height={16} /></span>
                  <input
                    className="hb-input"
                    type="text"
                    placeholder="Sparposition suchen..."
                    value={transferSearch}
                    onChange={(e) => setTransferSearch(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <Button size="sm" ref={transferCreateBtnRef} onClick={openTransferCreate}>
                  + Neue Sparposition
                </Button>
              </div>

              <div className="hb-cat-list">
                {transferGroups.length === 0 &&
                  (trimmedTransferSearch ? (
                    <div className="hb-empty hb-empty--sm">
                      <div className="hb-empty-icon"><IconSearch /></div>
                      <div className="hb-empty-title">Keine Sparpositionen gefunden</div>
                      <div className="hb-empty-text">
                        Für „{trimmedTransferSearch}“ gibt es keine Sparposition.
                      </div>
                      <button
                        type="button"
                        className="hb-btn-ghost hb-btn-sm"
                        style={{ marginTop: 10 }}
                        onClick={() => setTransferSearch("")}
                      >
                        Suche zurücksetzen
                      </button>
                    </div>
                  ) : (
                    <div className="hb-empty hb-empty--sm">
                      <div className="hb-empty-icon"><IconTransfer /></div>
                      <div className="hb-empty-title">Noch keine Sparpositionen</div>
                      <div className="hb-empty-text">
                        Lege eine Sparposition an, um Geld in einem Topf einem Zweck zuzuordnen.
                        Raten, Ziele und Fälligkeiten legst du in den Rücklagen fest.
                      </div>
                    </div>
                  ))}

                {transferGroups.map((group, i) => (
                  <React.Fragment key={group.id}>
                    <div className="hb-label" style={{ padding: i > 0 ? "12px 0 4px" : "6px 0 4px" }}>
                      {group.label}
                    </div>
                    {group.items.map((cat) => (
                      <div key={cat.id} className="hb-tpl-row">
                        <div className="hb-tpl-main">
                          <div className="hb-tpl-name">
                            <span title={cat.name}>{cat.name}</span>
                          </div>
                        </div>
                        <div className="hb-tpl-actions">
                          <button
                            type="button"
                            ref={(el) => {
                              transferEditBtnRefs.current[cat.id] = el;
                            }}
                            className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                            aria-label={`„${cat.name}“ bearbeiten`}
                            title="Bearbeiten"
                            onClick={() => openTransferEdit(cat)}
                          >
                            <IconEdit />
                          </button>
                          <OverflowMenu
                            buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                            label={`Weitere Aktionen für „${cat.name}“`}
                            items={[
                              {
                                label: "Löschen",
                                danger: true,
                                onClick: () => deleteTransferCategory(cat),
                              },
                            ]}
                          />
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>
      </EditDialog>

      {/* Sub-Dialog: Sparposition anlegen/bearbeiten */}
      <SavingsPositionFormDialog
        open={transferFormOpen}
        position={transferEditTarget}
        transferCategories={transferCategories}
        pots={pots}
        onClose={closeTransferForm}
        onSave={handleSaveTransfer}
      />

      {/* Sub-Dialog: Neue Kategorie */}
      <CategoryCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        expenseCategories={expenseCategories}
      />

      {/* Sub-Dialog: Kategorie bearbeiten */}
      <CategoryEditDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditTarget(null); }}
        onSave={handleEdit}
        onDelete={handleDelete}
        category={editTarget?.category || null}
        isSubcategory={editTarget?.isSubcategory || false}
      />
    </>
  );
}
