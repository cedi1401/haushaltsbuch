import React, { useState, useMemo, useEffect, useRef } from "react";
import EditDialog from "./EditDialog.jsx";
import CategoryCreateDialog from "./CategoryCreateDialog.jsx";
import CategoryEditDialog from "./CategoryEditDialog.jsx";
import { IconEdit, IconPlus, IconDelete, IconTransfer, IconSearch, IconCheck, IconChevron, IconClose } from "./icons.jsx";
import HbTooltip from "./HbTooltip.jsx";
import { CHART_COLORS, DEFAULT_CATEGORY_COLOR } from "../utils/hbPalette.js";
import { Button } from "./ui.jsx";
import { useToast } from "./toastContext.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { generateId } from "../utils/idUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import {
  MAX_TRANSFER_NAME_LENGTH,
  getActiveTransferCategories,
  findTransferCategoryByName,
  addTransferCategory as addTransferCategoryToList,
  renameTransferCategory,
  deleteTransferCategory as deleteTransferCategoryFromList,
  isReservedPurposeName,
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
  transferCategories = [],
  pots = [],
  onUpdateExpenseCategories,
  onUpdateIncomeCategories,
  onUpdateTransferCategories,
}) {
  const fmt = useFmt();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [newTransferName, setNewTransferName] = useState("");
  // Ein Zweck gehört genau einem Topf (Schema 7) — er wird beim Anlegen gewählt.
  const [newTransferPotId, setNewTransferPotId] = useState("");
  const newPotId = pots.some((p) => p.id === newTransferPotId) ? newTransferPotId : pots[0]?.id || "";
  const potNameById = useMemo(() => new Map(pots.map((p) => [p.id, p.name])), [pots]);
  // `transferCategories` ist die volle Liste inkl. gelöschter Zwecke (die
  // bleiben für bestehende Buchungen erhalten); angezeigt werden nur die aktiven.
  const activeTransfers = useMemo(
    () => getActiveTransferCategories(transferCategories),
    [transferCategories]
  );
  // Inline-Umbenennung: id des Zwecks in Bearbeitung
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [transferDraft, setTransferDraft] = useState("");
  const transferInputRef = useRef(null);
  const transferEditBtnRefs = useRef({});
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

  useEffect(() => {
    if (!editingTransfer) return;
    const el = transferInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTransfer]);

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
      setNewTransferName("");
      setEditingTransfer(null);
      setTransferDraft("");
    }
  }

  // -------------------------------------------------------
  // Sparpositionen (Transfer-Zwecke) CRUD
  // -------------------------------------------------------
  // excludeId: der eigene Zweck beim Umbenennen, damit die Zeile nicht mit
  // sich selbst kollidiert. Gelöschte Zwecke zählen nicht als Duplikat.
  function validateTransferName(name, excludeId) {
    const trimmed = name.trim();
    if (!trimmed) return "Name darf nicht leer sein.";
    if (trimmed.length > MAX_TRANSFER_NAME_LENGTH)
      return `Name ist zu lang (max. ${MAX_TRANSFER_NAME_LENGTH} Zeichen).`;
    if (isReservedPurposeName(trimmed))
      return `„${NO_PURPOSE_LABEL}“ ist für Geld ohne Sparposition reserviert.`;
    if (findTransferCategoryByName(transferCategories, trimmed, { excludeId }))
      return "Diese Sparposition existiert bereits.";
    return null;
  }

  function addTransferCategory() {
    const error = validateTransferName(newTransferName, null);
    if (error) {
      if (newTransferName.trim()) toast.warning(error);
      return;
    }
    if (!newPotId) {
      toast.warning("Lege zuerst einen Topf an.");
      return;
    }
    const trimmed = newTransferName.trim();
    // Ein gleichnamiger gelöschter Zweck im selben Topf wird reaktiviert, samt
    // seiner Buchungen.
    onUpdateTransferCategories?.(addTransferCategoryToList(transferCategories, trimmed, newPotId).list);
    setNewTransferName("");
    toast.success(`Sparposition „${trimmed}“ erstellt.`);
  }

  function startTransferEdit(cat) {
    setEditingTransfer(cat.id);
    setTransferDraft(cat.name);
  }

  function cancelTransferEdit() {
    const id = editingTransfer;
    setEditingTransfer(null);
    setTransferDraft("");
    // Erst nach dem Re-Render existiert der Stift-Button wieder.
    if (id) requestAnimationFrame(() => transferEditBtnRefs.current[id]?.focus());
  }

  function commitTransferEdit() {
    const id = editingTransfer;
    const oldName = transferCategories.find((c) => c.id === id)?.name;
    if (!id || oldName === undefined) return;
    const trimmed = transferDraft.trim();
    if (trimmed === oldName) {
      cancelTransferEdit();
      return;
    }
    if (validateTransferName(transferDraft, id)) return;

    // Referenzen laufen über die ID — es reicht, den Namen in der Liste zu ändern.
    onUpdateTransferCategories?.(renameTransferCategory(transferCategories, id, trimmed));
    setEditingTransfer(null);
    setTransferDraft("");
    requestAnimationFrame(() => transferEditBtnRefs.current[id]?.focus());
    toast.success(`Sparposition „${oldName}“ in „${trimmed}“ umbenannt.`);
  }

  // Wegklicken speichert, solange die Eingabe gültig ist — sonst wird verworfen,
  // damit der Fokus nicht in einem ungültigen Feld gefangen bleibt.
  function handleTransferEditBlur() {
    if (!editingTransfer) return;
    if (validateTransferName(transferDraft, editingTransfer)) {
      cancelTransferEdit();
      return;
    }
    commitTransferEdit();
  }

  function handleTransferEditKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTransferEdit();
    } else if (e.key === "Escape") {
      // Ohne stopPropagation würde der globale Handler in EditDialog den
      // kompletten Dialog schließen statt nur das Bearbeiten abzubrechen.
      e.stopPropagation();
      e.preventDefault();
      cancelTransferEdit();
    }
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
    if (editingTransfer === cat.id) {
      setEditingTransfer(null);
      setTransferDraft("");
    }
    onUpdateTransferCategories?.(deleteTransferCategoryFromList(transferCategories, cat.id));
    toast.success("Sparposition gelöscht.");
  }

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
            <span className="hb-cat-name">{cat.name}</span>

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
            /* Tab: Sparpositionen */
            <div className="hb-cat-transfer-panel">
              {/* Hinzufügen-Input oben */}
              <div className="hb-cat-transfer-add">
                <input
                  className="hb-input"
                  type="text"
                  value={newTransferName}
                  onChange={(e) => setNewTransferName(e.target.value)}
                  placeholder="Neue Sparposition …"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTransferCategory();
                    }
                  }}
                />
                <select
                  className="hb-input"
                  style={{ width: "auto", maxWidth: 180 }}
                  aria-label="Topf der neuen Sparposition"
                  value={newPotId}
                  onChange={(e) => setNewTransferPotId(e.target.value)}
                >
                  {pots.length === 0 && <option value="">Kein Topf vorhanden</option>}
                  {pots.map((pot) => (
                    <option key={pot.id} value={pot.id}>{pot.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={addTransferCategory}
                  disabled={!newTransferName.trim() || !newPotId}
                >
                  <IconPlus /> Hinzufügen
                </Button>
              </div>

              {/* Liste der Sparpositionen */}
              <div className="hb-cat-list">
                {activeTransfers.length === 0 ? (
                  <div className="hb-empty hb-empty--sm">
                    <div className="hb-empty-icon"><IconTransfer /></div>
                    <div className="hb-empty-title">Noch keine Sparpositionen</div>
                    <div className="hb-empty-text">
                      Lege eine Sparposition an, um Geld in einem Topf einem Zweck zuzuordnen.
                      Raten, Ziele und Fälligkeiten legst du in den Rücklagen fest.
                    </div>
                  </div>
                ) : (
                  activeTransfers.map((cat) => {
                    const isEditing = editingTransfer === cat.id;
                    const error = isEditing
                      ? validateTransferName(transferDraft, cat.id)
                      : null;

                    return (
                      <div
                        key={cat.id}
                        className={`hb-cat-transfer-item${isEditing ? " hb-cat-transfer-item--editing" : ""}`}
                      >
                        {isEditing ? (
                          <div className="hb-cat-transfer-edit">
                            <input
                              ref={transferInputRef}
                              className={`hb-input hb-cat-transfer-input${error ? " hb-input--invalid" : ""}`}
                              type="text"
                              value={transferDraft}
                              maxLength={MAX_TRANSFER_NAME_LENGTH}
                              aria-label={`Name von „${cat.name}“`}
                              aria-invalid={error ? "true" : undefined}
                              aria-describedby={error ? `transfer-error-${cat.id}` : undefined}
                              onChange={(e) => setTransferDraft(e.target.value)}
                              onKeyDown={handleTransferEditKeyDown}
                              onBlur={handleTransferEditBlur}
                            />
                            {error && (
                              <span id={`transfer-error-${cat.id}`} className="hb-field-error">
                                {error}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="hb-cat-name"
                            onDoubleClick={() => startTransferEdit(cat)}
                            title={cat.name}
                          >
                            {cat.name}
                            {potNameById.has(cat.potId) && (
                              <span className="hb-muted hb-muted--sm" style={{ fontWeight: 500 }}>
                                {" "}· {potNameById.get(cat.potId)}
                              </span>
                            )}
                          </span>
                        )}

                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                              aria-label="Namen speichern"
                              title="Speichern"
                              disabled={!!error}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={commitTransferEdit}
                            >
                              <IconCheck />
                            </button>
                            <button
                              type="button"
                              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                              aria-label="Bearbeiten abbrechen"
                              title="Abbrechen"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={cancelTransferEdit}
                            >
                              <IconClose />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              ref={(el) => {
                                transferEditBtnRefs.current[cat.id] = el;
                              }}
                              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                              onClick={() => startTransferEdit(cat)}
                              aria-label={`„${cat.name}“ umbenennen`}
                              title="Umbenennen"
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                              onClick={() => deleteTransferCategory(cat)}
                              aria-label={`„${cat.name}“ löschen`}
                              title="Löschen"
                            >
                              <IconDelete />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </EditDialog>

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
