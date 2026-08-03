import React, { useState, useMemo, useEffect, useRef } from "react";
import EditDialog from "./EditDialog.jsx";
import CategoryCreateDialog from "./CategoryCreateDialog.jsx";
import CategoryEditDialog from "./CategoryEditDialog.jsx";
import { IconEdit, IconPlus, IconDelete, IconWallet, IconLock, IconTransfer, IconSearch, IconCheck, IconClose } from "./icons.jsx";
import HbTooltip from "./HbTooltip.jsx";
import { CHART_COLORS, DEFAULT_CATEGORY_COLOR } from "../utils/hbPalette.js";
import { Button } from "./ui.jsx";
import { useToast } from "./toastContext.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { canSetParentBudget, canSetSubBudget } from "../utils/hbUtils.js";
import { generateId } from "../utils/idUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";

const MAX_TRANSFER_NAME_LENGTH = 50;

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

function BudgetEditor({ inputRef, value, onChange, onSave, onRemove, onCancel }) {
  return (
    <div className="hb-cat-budget-editor" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="hb-input hb-cat-budget-input"
        type="number"
        min="0"
        step="1"
        placeholder="Monatsbudget..."
        value={value}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Button size="sm" onClick={onSave}>OK</Button>
      {onRemove && (
        <Button size="sm" className="hb-cat-budget-remove-btn" onClick={onRemove}>
          Entfernen
        </Button>
      )}
      <button className="hb-btn-ghost hb-btn-sm" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
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
  onUpdateExpenseCategories,
  onUpdateIncomeCategories,
  onUpdateTransferCategories,
  onRenameTransferCategory,
}) {
  const fmt = useFmt();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [newTransferName, setNewTransferName] = useState("");
  // Inline-Umbenennung: der ursprüngliche Name identifiziert die Zeile,
  // weil Transfer-Zwecke reine Strings ohne id sind.
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

  // Budget-Inline-Editor
  // budgetTarget: { type: "parent"|"sub", categoryId, parentCategoryId? }
  const [budgetTarget, setBudgetTarget] = useState(null);
  const [budgetDraft, setBudgetDraft] = useState("");
  const budgetInputRef = useRef(null);

  useEffect(() => {
    if (budgetTarget) {
      setTimeout(() => budgetInputRef.current?.focus(), 50);
    }
  }, [budgetTarget]);

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
      setBudgetTarget(null);
      setBudgetDraft("");
    }
  }

  // -------------------------------------------------------
  // Transfer-Zwecke CRUD
  // -------------------------------------------------------
  // excludeName: der eigene Name beim Umbenennen, damit die Zeile nicht mit
  // sich selbst kollidiert.
  function validateTransferName(name, excludeName) {
    const trimmed = name.trim();
    if (!trimmed) return "Name darf nicht leer sein.";
    if (trimmed.length > MAX_TRANSFER_NAME_LENGTH)
      return `Name ist zu lang (max. ${MAX_TRANSFER_NAME_LENGTH} Zeichen).`;
    const normalized = trimmed.toLocaleLowerCase("de");
    const isDuplicate = transferCategories.some(
      (c) => c !== excludeName && c.trim().toLocaleLowerCase("de") === normalized
    );
    if (isDuplicate) return "Dieser Transfer-Zweck existiert bereits.";
    return null;
  }

  function addTransferCategory() {
    const error = validateTransferName(newTransferName, null);
    if (error) {
      if (newTransferName.trim()) toast.warning(error);
      return;
    }
    const trimmed = newTransferName.trim();
    onUpdateTransferCategories?.([...transferCategories, trimmed]);
    setNewTransferName("");
    toast.success(`Transfer-Zweck „${trimmed}“ erstellt.`);
  }

  function startTransferEdit(name) {
    setEditingTransfer(name);
    setTransferDraft(name);
  }

  function cancelTransferEdit() {
    const name = editingTransfer;
    setEditingTransfer(null);
    setTransferDraft("");
    // Erst nach dem Re-Render existiert der Stift-Button wieder.
    if (name) requestAnimationFrame(() => transferEditBtnRefs.current[name]?.focus());
  }

  function commitTransferEdit() {
    const oldName = editingTransfer;
    if (!oldName) return;
    const trimmed = transferDraft.trim();
    if (trimmed === oldName) {
      cancelTransferEdit();
      return;
    }
    if (validateTransferName(transferDraft, oldName)) return;

    // Umbenennen muss auch die Buchungen, Fixkosten und Sparziele mitziehen,
    // die den Zweck als Klartext referenzieren — das erledigt der Parent.
    onRenameTransferCategory?.(oldName, trimmed);
    setEditingTransfer(null);
    setTransferDraft("");
    requestAnimationFrame(() => transferEditBtnRefs.current[trimmed]?.focus());
    toast.success(`Transfer-Zweck „${oldName}“ in „${trimmed}“ umbenannt.`);
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

  async function deleteTransferCategory(name) {
    if (transferCategories.length <= 1) {
      toast.warning("Du brauchst mindestens einen Transfer-Zweck.");
      return;
    }
    const ok = await confirm({
      title: "Transfer-Zweck löschen",
      message: `Transfer-Zweck „${name}“ wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    if (editingTransfer === name) {
      setEditingTransfer(null);
      setTransferDraft("");
    }
    onUpdateTransferCategories?.(transferCategories.filter((c) => c !== name));
    toast.success("Transfer-Zweck gelöscht.");
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
  // Budget-Handling
  // -------------------------------------------------------
  function openBudgetEdit(cat, sub = null) {
    if (sub) {
      setBudgetTarget({ type: "sub", categoryId: sub.id, parentCategoryId: cat.id });
      setBudgetDraft(sub.budget != null ? String(sub.budget) : "");
    } else {
      setBudgetTarget({ type: "parent", categoryId: cat.id });
      setBudgetDraft(cat.budget != null ? String(cat.budget) : "");
    }
  }

  function closeBudgetEdit() {
    setBudgetTarget(null);
    setBudgetDraft("");
  }

  function applyBudget(budget) {
    if (!budgetTarget) return;
    if (budgetTarget.type === "parent") {
      const updateList = (list) =>
        list.map((cat) =>
          cat.id === budgetTarget.categoryId ? { ...cat, budget } : cat
        );
      const inExpense = (expenseCategories || []).some((c) => c.id === budgetTarget.categoryId);
      if (inExpense) onUpdateExpenseCategories(updateList(expenseCategories || []));
      else onUpdateIncomeCategories(updateList(incomeCategories || []));
    } else {
      const updateList = (list) =>
        list.map((cat) =>
          cat.id === budgetTarget.parentCategoryId
            ? {
                ...cat,
                subcategories: (cat.subcategories || []).map((sub) =>
                  sub.id === budgetTarget.categoryId ? { ...sub, budget } : sub
                ),
              }
            : cat
        );
      const inExpense = (expenseCategories || []).some((c) => c.id === budgetTarget.parentCategoryId);
      if (inExpense) onUpdateExpenseCategories(updateList(expenseCategories || []));
      else onUpdateIncomeCategories(updateList(incomeCategories || []));
    }
    closeBudgetEdit();
    toast.success(budget != null ? "Budget gespeichert." : "Budget entfernt.");
  }

  function saveBudget() {
    const raw = budgetDraft.trim().replace(",", ".");
    if (raw === "") {
      applyBudget(null);
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast.warning("Bitte einen gültigen Betrag eingeben.");
      return;
    }
    applyBudget(value === 0 ? null : value);
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
  // isExpense: nur Ausgabenkategorien erhalten Budget-Buttons
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
      const isBudgetEditorOpen = budgetTarget?.type === "parent" && budgetTarget?.categoryId === cat.id;
      const canParent = isExpense ? canSetParentBudget(cat) : false;

      return (
        <div key={cat.id} className={`hb-cat-accordion-item${isOpen ? " hb-cat-accordion-open" : ""}`}>
          {/* Accordion Header */}
          <div
            className={`hb-cat-accordion-header${isContextRow ? " hb-cat-accordion-header--context" : ""}`}
            onClick={() => !isBudgetEditorOpen && toggleAccordion(cat.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isBudgetEditorOpen)
                toggleAccordion(cat.id);
            }}
          >
            <span className="hb-cat-dot" style={{ background: cat.color || CHART_COLORS.transfer }} />
            <span className="hb-cat-name">{cat.name}</span>

            {/* Budget-Chip: dauerhaft sichtbar wenn Budget gesetzt */}
            {isExpense && cat.budget != null && !isBudgetEditorOpen && (
              <span className="hb-cat-budget-chip">
                {fmt ? fmt(cat.budget, 0) : cat.budget}
              </span>
            )}

            {/* Budget-Button (nur Ausgaben, hover-reveal). Kontext-Zeilen
                bleiben aktionsfrei: dort sind die Standard-Unterkategorien
                ausgeblendet, das Budget-Schloss wäre nicht nachvollziehbar. */}
            {isExpense && !isBudgetEditorOpen && !isContextRow && (
              <button
                type="button"
                className={`hb-cat-budget-btn${!canParent ? " hb-cat-budget-btn--locked" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canParent) {
                    toast.warning("Entferne zuerst die Sub-Kategorien-Budgets.");
                    return;
                  }
                  openBudgetEdit(cat);
                }}
                title={cat.budget != null ? "Budget ändern" : "Monatsbudget setzen"}
                aria-label="Budget bearbeiten"
              >
                {canParent ? <IconWallet /> : <IconLock />}
              </button>
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
              <span className={`hb-cat-chevron${isOpen ? " hb-cat-chevron-open" : ""}`}>▼</span>
            )}
          </div>

          {/* Budget-Editor für Oberkategorie */}
          {isExpense && isBudgetEditorOpen && (
            <BudgetEditor
              inputRef={budgetInputRef}
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onSave={saveBudget}
              onRemove={cat.budget != null ? () => applyBudget(null) : null}
              onCancel={closeBudgetEdit}
            />
          )}

          {/* Unterkategorien */}
          {isOpen && hasSubs && (
            <div className="hb-cat-sublist">
              {(cat.subcategories || []).map((sub) => {
                const isCustomSub = !sub.isDefault;
                const canSub = isExpense ? canSetSubBudget(cat) : false;
                const isSubEditorOpen = budgetTarget?.type === "sub" && budgetTarget?.categoryId === sub.id;
                return (
                  <React.Fragment key={sub.id}>
                    <div className="hb-cat-subitem">
                      <span
                        className="hb-cat-dot"
                        style={{ background: cat.color || CHART_COLORS.transfer, opacity: 0.65 }}
                      />
                      <span className="hb-cat-subitem-name">{sub.name}</span>

                      {/* Budget-Chip Sub */}
                      {isExpense && sub.budget != null && !isSubEditorOpen && (
                        <span className="hb-cat-budget-chip">
                          {fmt ? fmt(sub.budget, 0) : sub.budget}
                        </span>
                      )}

                      {/* Budget-Button Sub (hover-reveal) */}
                      {isExpense && !isSubEditorOpen && (
                        <button
                          type="button"
                          className={`hb-cat-budget-btn${!canSub ? " hb-cat-budget-btn--locked" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canSub) {
                              toast.warning(`„${cat.name}“ hat bereits ein Oberkategorien-Budget.`);
                              return;
                            }
                            openBudgetEdit(cat, sub);
                          }}
                          title={sub.budget != null ? "Budget ändern" : "Monatsbudget setzen"}
                          aria-label="Sub-Budget bearbeiten"
                        >
                          {canSub ? <IconWallet /> : <IconLock />}
                        </button>
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

                    {/* Budget-Editor für Unterkategorie */}
                    {isExpense && isSubEditorOpen && (
                      <BudgetEditor
                        inputRef={budgetInputRef}
                        value={budgetDraft}
                        onChange={(e) => setBudgetDraft(e.target.value)}
                        onSave={saveBudget}
                        onRemove={sub.budget != null ? () => applyBudget(null) : null}
                        onCancel={closeBudgetEdit}
                      />
                    )}
                  </React.Fragment>
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
        <div className="hb-muted" style={{ padding: "16px 0", textAlign: "center" }}>
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
              text="Um einer Ober- oder Unterkategorie ein Monatsbudget zu setzen, fahre mit der Maus über die jeweilige Zeile und klicke auf das Geldbörsen-Symbol rechts. Ein Budget lässt sich entweder für die Oberkategorie oder für ihre Unterkategorien festlegen – nicht für beide gleichzeitig."
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
                Transfer-Zwecke
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
            /* Tab: Transfer-Zwecke */
            <div className="hb-cat-transfer-panel">
              {/* Hinzufügen-Input oben */}
              <div className="hb-cat-transfer-add">
                <input
                  className="hb-input"
                  type="text"
                  value={newTransferName}
                  onChange={(e) => setNewTransferName(e.target.value)}
                  placeholder="Neuer Transfer-Zweck..."
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTransferCategory();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={addTransferCategory}
                  disabled={!newTransferName.trim()}
                >
                  <IconPlus /> Hinzufügen
                </Button>
              </div>

              {/* Liste der Transfer-Zwecke */}
              <div className="hb-cat-list">
                {transferCategories.length === 0 ? (
                  <div className="hb-empty hb-empty--sm">
                    <div className="hb-empty-icon"><IconTransfer /></div>
                    <div className="hb-empty-title">Noch keine Transfer-Zwecke</div>
                    <div className="hb-empty-text">
                      Lege einen Transfer-Zweck an, um Umbuchungen zwischen Töpfen zu kategorisieren.
                    </div>
                  </div>
                ) : (
                  transferCategories.map((cat) => {
                    const isEditing = editingTransfer === cat;
                    const error = isEditing
                      ? validateTransferName(transferDraft, cat)
                      : null;

                    return (
                      <div
                        key={cat}
                        className={`hb-cat-transfer-item${isEditing ? " hb-cat-transfer-item--editing" : ""}`}
                      >
                        {isEditing ? (
                          <div className="hb-cat-transfer-edit">
                            <input
                              ref={transferInputRef}
                              className={`hb-input hb-cat-transfer-input${error ? " hb-cat-transfer-input--invalid" : ""}`}
                              type="text"
                              value={transferDraft}
                              maxLength={MAX_TRANSFER_NAME_LENGTH}
                              aria-label={`Name von „${cat}“`}
                              aria-invalid={error ? "true" : undefined}
                              aria-describedby={error ? `transfer-error-${cat}` : undefined}
                              onChange={(e) => setTransferDraft(e.target.value)}
                              onKeyDown={handleTransferEditKeyDown}
                              onBlur={handleTransferEditBlur}
                            />
                            {error && (
                              <span id={`transfer-error-${cat}`} className="hb-cat-transfer-error">
                                {error}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="hb-cat-name"
                            onDoubleClick={() => startTransferEdit(cat)}
                            title={cat}
                          >
                            {cat}
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
                                transferEditBtnRefs.current[cat] = el;
                              }}
                              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                              onClick={() => startTransferEdit(cat)}
                              aria-label={`„${cat}“ umbenennen`}
                              title="Umbenennen"
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                              onClick={() => deleteTransferCategory(cat)}
                              aria-label={`„${cat}“ löschen`}
                              title="Löschen"
                              disabled={transferCategories.length <= 1}
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
