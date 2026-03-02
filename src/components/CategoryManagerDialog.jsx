import React, { useState, useMemo, useEffect } from "react";
import EditDialog from "./EditDialog.jsx";
import CategoryCreateDialog from "./CategoryCreateDialog.jsx";
import CategoryEditDialog from "./CategoryEditDialog.jsx";

// -------------------------------------------------------
// Haupt-Dialog: Alle Kategorien verwalten
// -------------------------------------------------------
export default function CategoryManagerDialog({
  open,
  onClose,
  expenseCategories,
  incomeCategories,
  onUpdateExpenseCategories,
  onUpdateIncomeCategories,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "custom"
  const [openAccordions, setOpenAccordions] = useState(new Set());

  // Sub-Dialoge
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  // editTarget: { category, isSubcategory, parentCategory? }

  // Reset beim Schliessen
  useEffect(() => {
    if (!open) {
      setSearch("");
      setFilter("all");
      setOpenAccordions(new Set());
      setCreateOpen(false);
      setEditOpen(false);
      setEditTarget(null);
    }
  }, [open]);

  // -------------------------------------------------------
  // Gefilterte Kategorien
  // -------------------------------------------------------
  const filteredExpense = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expenseCategories || [])
      .filter((cat) => {
        if (filter === "custom" && cat.isDefault) return false;
        if (!q) return true;
        if (cat.name.toLowerCase().includes(q)) return true;
        return (cat.subcategories || []).some((s) =>
          s.name.toLowerCase().includes(q)
        );
      })
      .map((cat) => {
        if (!q) return cat;
        // Unterkategorien ebenfalls nach Suche filtern
        return {
          ...cat,
          subcategories: (cat.subcategories || []).filter((s) =>
            s.name.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q)
          ),
        };
      });
  }, [expenseCategories, search, filter]);

  const filteredIncome = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (incomeCategories || [])
      .filter((cat) => {
        if (filter === "custom" && cat.isDefault) return false;
        if (!q) return true;
        if (cat.name.toLowerCase().includes(q)) return true;
        return (cat.subcategories || []).some((s) =>
          s.name.toLowerCase().includes(q)
        );
      })
      .map((cat) => {
        if (!q) return cat;
        return {
          ...cat,
          subcategories: (cat.subcategories || []).filter((s) =>
            s.name.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q)
          ),
        };
      });
  }, [incomeCategories, search, filter]);

  // -------------------------------------------------------
  // Accordion toggle
  // -------------------------------------------------------
  function toggleAccordion(id) {
    setOpenAccordions((prev) => {
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
        id: `sub_custom_${Date.now()}`,
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
        id: `cat_custom_${Date.now()}`,
        name,
        color: color || "#0078d4",
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

  // Kategorie-Liste rendern (Expense + Income zusammengemischt nach Typ-Trennlinie)
  function renderCategoryList(categories, labelPrefix = "") {
    return categories.map((cat) => {
      const isOpen = openAccordions.has(cat.id);
      const hasSubs = (cat.subcategories || []).length > 0;
      const isCustom = !cat.isDefault;

      return (
        <div key={cat.id} className={`hb-cat-accordion-item${isOpen ? " hb-cat-accordion-open" : ""}`}>
          {/* Accordion Header */}
          <div
            className="hb-cat-accordion-header"
            onClick={() => toggleAccordion(cat.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleAccordion(cat.id); }}
          >
            <span
              className="hb-cat-dot"
              style={{ background: cat.color || "#636363" }}
            />
            <span className="hb-cat-name">{cat.name}</span>
            {isCustom && (
              <button
                type="button"
                className="hb-cat-edit-btn"
                onClick={(e) => { e.stopPropagation(); openEditForParent(cat); }}
                aria-label={`${cat.name} bearbeiten`}
                title="Bearbeiten"
              >
                <img src="/icons/edit.svg" alt="Bearbeiten" />
              </button>
            )}
            {hasSubs && (
              <span className={`hb-cat-chevron${isOpen ? " hb-cat-chevron-open" : ""}`}>
                ▼
              </span>
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
                      style={{ background: cat.color || "#636363", opacity: 0.65 }}
                    />
                    <span className="hb-cat-subitem-name">{sub.name}</span>
                    {isCustomSub && (
                      <button
                        type="button"
                        className="hb-cat-edit-btn"
                        onClick={() => openEditForSub(sub, cat)}
                        aria-label={`${sub.name} bearbeiten`}
                        title="Bearbeiten"
                      >
                        <img src="/icons/edit.svg" alt="Bearbeiten" />
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

  return (
    <>
      <EditDialog
        open={open}
        title="Kategorien bearbeiten"
        onClose={onClose}
        onSave={null}
        canSave={false}
        saveLabel={null}
        size="wide"
        hideFooter
      >
        <div className="hb-cat-manager">
          {/* Header: Suchfeld + Button */}
          <div className="hb-cat-manager-header">
            <div className="hb-search-field">
              <span className="hb-search-icon">&#128269;</span>
              <input
                className="hb-input"
                type="text"
                placeholder="Kategorie suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className="hb-btn hb-btn-sm"
              onClick={() => setCreateOpen(true)}
            >
              + Neue Kategorie
            </button>
          </div>

          {/* Filter-Radio */}
          <div className="hb-cat-filter-row">
            <label className="hb-radio-label">
              <input
                type="radio"
                name="cat-filter"
                value="all"
                checked={filter === "all"}
                onChange={() => setFilter("all")}
              />
              Alle Kategorien
            </label>
            <label className="hb-radio-label">
              <input
                type="radio"
                name="cat-filter"
                value="custom"
                checked={filter === "custom"}
                onChange={() => setFilter("custom")}
              />
              Eigene Kategorien
            </label>
          </div>

          {/* Kategorie-Liste */}
          <div className="hb-cat-list">
            {allExpense.length === 0 && allIncome.length === 0 && (
              <div className="hb-muted" style={{ padding: "16px 0", textAlign: "center" }}>
                Keine Kategorien gefunden.
              </div>
            )}

            {allExpense.length > 0 && (
              <>
                {hasIncome && (
                  <div className="hb-label" style={{ padding: "6px 0 4px" }}>
                    Ausgaben
                  </div>
                )}
                {renderCategoryList(allExpense)}
              </>
            )}

            {hasIncome && (
              <>
                <div className="hb-label" style={{ padding: "12px 0 4px" }}>
                  Einnahmen
                </div>
                {renderCategoryList(allIncome)}
              </>
            )}
          </div>
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
