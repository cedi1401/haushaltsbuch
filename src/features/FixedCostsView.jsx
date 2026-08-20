import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { generateId } from "../utils/idUtils.js";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  fixedCostKind,
  formatDateDE,
  parseAmount,
  todayISO,
} from "../utils/hbUtils.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/toastContext.js";
import { IconFixed, IconPlus, IconDelete, IconDrag, IconTag } from "../components/icons.jsx";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { EMPTY_ARRAY } from "../utils/constants.js";

// Die beiden semantischen Spalten des Views. Die Reihenfolge ist zugleich die
// Layout- und (auf schmalen Breiten) die Stapel-Reihenfolge.
const COLUMNS = [
  {
    kind: "expense",
    title: "Ausgaben",
    addLabel: "Neue Ausgabe",
    emptyText:
      "Noch keine wiederkehrenden Ausgaben — z.B. Miete, Abos oder Versicherungen.",
  },
  {
    kind: "transfer",
    title: "Transfers & Rücklagen",
    addLabel: "Neuer Transfer",
    emptyText:
      "Noch keine wiederkehrenden Transfers — z.B. monatliche Rücklagen in einen Topf.",
  },
];

// Sektions-Schlüssel für Drag & Drop: eine Gruppe wird über ihre id
// adressiert, die beiden „Weitere"-Bereiche über je einen eigenen Schlüssel.
// Ein gemeinsamer null-Schlüssel würde die beiden Spalten verwechseln.
const UNGROUPED_KEY = {
  expense: "ungrouped:expense",
  transfer: "ungrouped:transfer",
};

export default function FixedCostsView({
  activeBook,
  entries: _entries,
  onUpdateBook,
  onAddEntry,
  onAddEntries,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const recurringExpenses = activeBook?.recurringExpenses || EMPTY_ARRAY;
  const fixedCostGroups = activeBook?.fixedCostGroups || EMPTY_ARRAY;
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const transferCategories = activeBook?.transferCategories || EMPTY_ARRAY;
  const { confirm } = useConfirm();
  const toast = useToast();

  // Dialog-State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // Beim Duplizieren: id des Originals, damit die Kopie direkt dahinter landet
  const [duplicateSourceId, setDuplicateSourceId] = useState(null);
  // Aus einer Gruppe/Spalte heraus angelegte Positionen erben deren Art —
  // sie ist dann im Dialog fest vorgegeben.
  const [kindLocked, setKindLocked] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    amount: "",
    kind: "expense",
    categoryId: null,
    subcategoryId: null,
    transferCategory: transferCategories[0] || "Steuern",
    potId: pots[0]?.id || "",
    groupId: null,
    showInOverview: true,
    tags: [],
  });

  // Gruppen-Verwaltung
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  // Spalte, in der die neue Gruppe angelegt wird — kein Auswahlschritt im Dialog
  const [groupDialogKind, setGroupDialogKind] = useState("expense");

  // Drag & Drop
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [dropBeforeId, setDropBeforeId] = useState(null);

  // Spalte je Gruppe — Grundlage für Zuordnung, Drop-Regeln und Dialog-Filter
  const groupKindById = useMemo(() => {
    const map = new Map();
    for (const group of fixedCostGroups) map.set(group.id, fixedCostKind(group));
    return map;
  }, [fixedCostGroups]);

  // Gruppen je Spalte, innerhalb der Spalte nach `order` sortiert
  const groupsByColumn = useMemo(() => {
    const result = { expense: [], transfer: [] };
    for (const group of fixedCostGroups) result[fixedCostKind(group)].push(group);
    result.expense.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    result.transfer.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return result;
  }, [fixedCostGroups]);

  // Positionen je Sektion + Summen (Sektion, Spalte, gesamt)
  const { itemsBySection, sectionTotals, columnTotals, columnCounts, totalAmount } = useMemo(() => {
    const bySection = new Map();
    const secTotals = new Map();
    const colTotals = { expense: 0, transfer: 0 };
    const colCounts = { expense: 0, transfer: 0 };
    let total = 0;

    for (const item of recurringExpenses) {
      const kind = fixedCostKind(item);
      const amount = Number(item.amount || 0);
      total += amount;
      colTotals[kind] += amount;
      colCounts[kind] += 1;

      // Nur eine existierende Gruppe derselben Spalte zählt — sonst „Weitere"
      const gid = item.groupId || null;
      const key = gid && groupKindById.get(gid) === kind ? gid : UNGROUPED_KEY[kind];
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key).push(item);
      secTotals.set(key, (secTotals.get(key) || 0) + amount);
    }

    return {
      itemsBySection: bySection,
      sectionTotals: secTotals,
      columnTotals: colTotals,
      columnCounts: colCounts,
      totalAmount: total,
    };
  }, [recurringExpenses, groupKindById]);

  const allBookTags = useMemo(() => {
    const set = new Set();
    recurringExpenses.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [recurringExpenses]);

  const availableTagSuggestions = useMemo(() => {
    const existing = new Set(draft.tags);
    const base = tagInput.trim()
      ? allBookTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !existing.has(t))
      : allBookTags.filter((t) => !existing.has(t));
    return base.slice(0, 8);
  }, [allBookTags, draft.tags, tagInput]);

  // Sektions-Schlüssel einer Position — identisch zur Zuordnung oben
  function sectionKeyOfItem(item) {
    const kind = fixedCostKind(item);
    const gid = item.groupId || null;
    return gid && groupKindById.get(gid) === kind ? gid : UNGROUPED_KEY[kind];
  }

  function columnLabel(kind) {
    return COLUMNS.find((c) => c.kind === kind)?.title || "";
  }

  // Gruppen-CRUD
  function openGroupDialog(kind) {
    setGroupDialogKind(kind);
    setGroupNameDraft("");
    setGroupDialogOpen(true);
  }

  function createGroup() {
    const name = (groupNameDraft || "").trim();
    if (!name) return;
    const maxOrder = fixedCostGroups.reduce((m, g) => Math.max(m, g.order ?? 0), 0);
    const newGroup = { id: generateId("fcg"), name, order: maxOrder + 1, kind: groupDialogKind };
    onUpdateBook({ ...activeBook, fixedCostGroups: [...fixedCostGroups, newGroup] });
    setGroupNameDraft("");
    setGroupDialogOpen(false);
  }

  function renameGroup(groupId, newName) {
    const name = (newName || "").trim();
    if (!name) { setRenamingGroupId(null); return; }
    const updated = fixedCostGroups.map((g) => g.id === groupId ? { ...g, name } : g);
    onUpdateBook({ ...activeBook, fixedCostGroups: updated });
    setRenamingGroupId(null);
  }

  async function deleteGroup(group) {
    const itemCount = (itemsBySection.get(group.id) || EMPTY_ARRAY).length;
    const ok = await confirm({
      title: "Gruppe löschen",
      message: itemCount > 0
        ? `Gruppe „${group.name}“ löschen? Die ${itemCount === 1 ? "enthaltene Position wird" : `${itemCount} enthaltenen Positionen werden`} nach „Weitere“ verschoben.`
        : `Gruppe „${group.name}“ wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const updatedItems = recurringExpenses.map((r) =>
      r.groupId === group.id ? { ...r, groupId: null } : r
    );
    const updatedGroups = fixedCostGroups.filter((g) => g.id !== group.id);
    onUpdateBook({ ...activeBook, recurringExpenses: updatedItems, fixedCostGroups: updatedGroups });
    toast.success("Gruppe gelöscht.");
  }

  // Dialog
  function openCreateDialog({ groupId = null, kind = "expense", lockKind = false } = {}) {
    setEditingItem(null);
    setDuplicateSourceId(null);
    setKindLocked(lockKind);
    setDraft({
      name: "",
      amount: "",
      kind,
      categoryId: null,
      subcategoryId: null,
      transferCategory: transferCategories[0] || "Steuern",
      potId: pots[0]?.id || "",
      groupId,
      showInOverview: false,
      tags: [],
    });
    setTagInput("");
    setDialogOpen(true);
  }

  function openEditDialog(item) {
    setEditingItem(item);
    setDuplicateSourceId(null);
    setKindLocked(false);
    setDraft(draftFromItem(item));
    setTagInput("");
    setDialogOpen(true);
  }

  // Kopie: bewusst der Edit-Draft als Basis (nicht openCreateDialog), damit
  // showInOverview, Gruppe und Tags vom Original übernommen werden.
  function openDuplicateDialog(item) {
    setEditingItem(null);
    setDuplicateSourceId(item.id);
    setKindLocked(false);
    setDraft({ ...draftFromItem(item), name: makeCopyName(item.name || "") });
    setTagInput("");
    setDialogOpen(true);
  }

  function draftFromItem(item) {
    return {
      name: item.name || "",
      amount: String(item.amount || ""),
      kind: fixedCostKind(item),
      categoryId: item.categoryId || null,
      subcategoryId: item.subcategoryId || null,
      transferCategory: item.transferCategory || transferCategories[0] || "Steuern",
      potId: item.potId || pots[0]?.id || "",
      groupId: item.groupId || null,
      showInOverview: item.showInOverview !== false,
      tags: item.tags || [],
    };
  }

  function makeCopyName(baseName) {
    const taken = new Set(recurringExpenses.map((r) => (r.name || "").trim()));
    const first = `${baseName} (Kopie)`;
    if (!taken.has(first)) return first;
    let n = 2;
    while (taken.has(`${baseName} (Kopie ${n})`)) n += 1;
    return `${baseName} (Kopie ${n})`;
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingItem(null);
    setDuplicateSourceId(null);
    setKindLocked(false);
  }

  // Art wechseln: die Gruppe gehört fest zu einer Spalte, die Position wandert
  // also in den „Weitere"-Bereich der anderen Spalte.
  function handleKindChange(kind) {
    setDraft((d) => ({ ...d, kind, groupId: null }));
  }

  function handleTagAdd(tagText) {
    const tag = tagText.trim().slice(0, 30);
    if (!tag || draft.tags.includes(tag)) return;
    setDraft((d) => ({ ...d, tags: [...d.tags, tag] }));
    setTagInput("");
  }

  function handleTagRemove(tag) {
    setDraft((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  }

  function saveItem() {
    if (!activeBook) return;
    const numericAmount = parseAmount(draft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!draft.name.trim()) return;

    // Absicherung gegen inkonsistente Zustände: eine Gruppe der anderen Spalte
    // wird nie übernommen.
    const targetGroupId =
      draft.groupId && groupKindById.get(draft.groupId) === draft.kind ? draft.groupId : null;

    if (editingItem) {
      const updatedItems = recurringExpenses.map((item) =>
        item.id === editingItem.id
          ? {
              ...item,
              name: draft.name.trim(),
              amount: numericAmount,
              kind: draft.kind,
              categoryId: draft.kind === "expense" ? draft.categoryId : undefined,
              subcategoryId: draft.kind === "expense" ? (draft.subcategoryId || null) : undefined,
              transferCategory: draft.kind === "transfer" ? draft.transferCategory : undefined,
              potId: draft.kind === "transfer" ? draft.potId : undefined,
              groupId: targetGroupId,
              showInOverview: draft.showInOverview === true,
              tags: draft.tags || [],
            }
          : item
      );
      onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
    } else {
      const newItem = {
        id: generateId("rec"),
        name: draft.name.trim(),
        amount: numericAmount,
        kind: draft.kind,
        groupId: targetGroupId,
        showInOverview: draft.showInOverview === true,
        tags: draft.tags || [],
      };
      if (draft.kind === "expense") {
        newItem.categoryId = draft.categoryId;
        newItem.subcategoryId = draft.subcategoryId || null;
      } else if (draft.kind === "transfer") {
        newItem.transferCategory = draft.transferCategory;
        newItem.potId = draft.potId;
      }
      // Kopien direkt hinter dem Original einfügen, sonst ans Ende anhängen
      const idx = duplicateSourceId
        ? recurringExpenses.findIndex((r) => r.id === duplicateSourceId)
        : -1;
      const next = idx === -1
        ? [...recurringExpenses, newItem]
        : [...recurringExpenses.slice(0, idx + 1), newItem, ...recurringExpenses.slice(idx + 1)];
      onUpdateBook({ ...activeBook, recurringExpenses: next });
    }
    closeDialog();
  }

  async function deleteItem(item) {
    if (!activeBook) return;
    const ok = await confirm({
      title: "Fixkosten löschen",
      message: `Fixkosten „${item.name}“ wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    onUpdateBook({ ...activeBook, recurringExpenses: recurringExpenses.filter((i) => i.id !== item.id) });
    toast.success("Fixkosten gelöscht.");
  }

  // Einzige Quelle für die Entry-Erzeugung — Einzel- und Sammelbuchung teilen sie.
  function buildEntryFromItem(item, date) {
    const kind = fixedCostKind(item);
    const entry = {
      id: generateId("entry"),
      date,
      amount: item.amount,
      category: kind === "transfer" ? item.transferCategory : undefined,
      categoryId: kind === "expense" ? (item.categoryId || null) : null,
      subcategoryId: kind === "expense" ? (item.subcategoryId || null) : null,
      kind,
      note: item.name,
    };
    if (kind === "transfer") entry.potId = item.potId;
    if (kind === "expense") entry.source = "month";
    return entry;
  }

  function bookNow(item) {
    onAddEntry(buildEntryFromItem(item, todayISO()));
    toast.success(`„${item.name}“ wurde gebucht.`);
  }

  // Sammelbuchung einer Gruppe bzw. eines „Weitere"-Bereichs. Alle Einträge
  // gehen als EIN State-Update raus (onAddEntries), damit bei wiederholten
  // Aufrufen auf demselben Snapshot nichts verloren geht.
  async function bookSection(label, items, isGroup) {
    if (!items || items.length === 0) return;
    const today = todayISO();
    const count = items.length;
    const scope = isGroup ? `der Gruppe „${label}“` : `aus „${label}“`;
    const ok = await confirm({
      title: "Alle Positionen buchen",
      message:
        (count === 1
          ? `Wirklich 1 Position ${scope} buchen?`
          : `Wirklich alle ${count} Positionen ${scope} buchen?`) +
        `\n\nGebucht wird auf das heutige Datum (${formatDateDE(today)}).`,
      confirmLabel: "Buchen",
    });
    if (!ok) return;

    const newEntries = items.map((item) => buildEntryFromItem(item, today));
    if (typeof onAddEntries === "function") {
      onAddEntries(newEntries);
    } else {
      // Fallback: onAddEntry arbeitet mit funktionalen State-Updates, mehrfache
      // Aufrufe auf demselben Snapshot sind daher unkritisch.
      newEntries.forEach((entry) => onAddEntry(entry));
    }
    toast.success(
      `${count} ${count === 1 ? "Position" : "Positionen"} aus „${label}“ gebucht.`
    );
  }

  // Drag & Drop
  const draggingKind = useMemo(() => {
    if (!draggingId) return null;
    const item = recurringExpenses.find((r) => r.id === draggingId);
    return item ? fixedCostKind(item) : null;
  }, [draggingId, recurringExpenses]);

  function handleDragStart(e, item) {
    // Die ganze Karte ist draggable — ein Mousedown auf einem Button (Kebab,
    // "Jetzt buchen", …) darf keinen Karten-Drag starten.
    if (e.target.closest("button")) {
      e.preventDefault();
      return;
    }
    setDraggingId(item.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverKey(null);
    setDropBeforeId(null);
  }

  // Kein preventDefault → der Browser lehnt den Drop ab; zusätzlich wird ein
  // eventuell noch stehender Indikator gelöscht.
  function rejectDrop() {
    setDragOverKey(null);
    setDropBeforeId(null);
  }

  function handleDragOverItem(e, sectionKind, sectionKey, beforeId) {
    if (!draggingId) return;
    if (draggingKind !== sectionKind) { rejectDrop(); return; }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(sectionKey);
    setDropBeforeId(beforeId);
  }

  function handleDragOverGroupBody(e, sectionKind, sectionKey) {
    if (!draggingId) return;
    if (draggingKind !== sectionKind) { rejectDrop(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(sectionKey);
    setDropBeforeId(null);
  }

  function handleDrop(e, sectionKind, targetGroupId, beforeId) {
    e.preventDefault();
    e.stopPropagation();
    const dragId = draggingId || e.dataTransfer.getData("text/plain");
    if (!dragId) return handleDragEnd();
    const dragged = recurringExpenses.find((r) => r.id === dragId);
    if (!dragged) return handleDragEnd();
    // Spaltenwechsel per Drag ist nicht vorgesehen — die Art einer Position
    // wird ausschliesslich im Dialog geändert.
    if (fixedCostKind(dragged) !== sectionKind) return handleDragEnd();

    const rest = recurringExpenses.filter((r) => r.id !== dragId);
    const movedItem = { ...dragged, groupId: targetGroupId || null };

    let insertIndex;
    if (beforeId) {
      insertIndex = rest.findIndex((r) => r.id === beforeId);
      if (insertIndex === -1) insertIndex = rest.length;
    } else {
      const targetKey = targetGroupId || UNGROUPED_KEY[sectionKind];
      let lastIdx = -1;
      rest.forEach((r, idx) => {
        if (sectionKeyOfItem(r) === targetKey) lastIdx = idx;
      });
      insertIndex = lastIdx === -1 ? rest.length : lastIdx + 1;
    }

    const next = [...rest.slice(0, insertIndex), movedItem, ...rest.slice(insertIndex)];
    onUpdateBook({ ...activeBook, recurringExpenses: next });
    handleDragEnd();
  }

  const canSave = useMemo(() => {
    if (!draft.name.trim()) return false;
    const n = parseAmount(draft.amount);
    return Number.isFinite(n) && n > 0;
  }, [draft]);

  const dialogGroupOptions = useMemo(
    () => fixedCostGroups.filter((g) => fixedCostKind(g) === draft.kind),
    [fixedCostGroups, draft.kind]
  );

  function renderCatPills(item) {
    if (fixedCostKind(item) === "transfer") {
      const potName = pots.find((p) => p.id === item.potId)?.name || item.potId;
      return (
        <span className="hb-fixed-cat-pill">
          {item.transferCategory || "Transfer"} → {potName}
        </span>
      );
    }
    const cat = expenseCategories.find((c) => c.id === item.categoryId);
    if (!cat) {
      return <span className="hb-fixed-cat-pill">{item.category || "Unkategorisiert"}</span>;
    }
    const sub = item.subcategoryId
      ? (cat.subcategories || []).find((s) => s.id === item.subcategoryId)
      : null;
    return (
      <>
        <span className="hb-fixed-cat-pill">
          {cat.color && <span className="hb-fixed-cat-dot" style={{ background: cat.color }} />}
          {cat.name}
        </span>
        {sub && (
          <span className="hb-fixed-cat-pill">
            {cat.color && (
              <span className="hb-fixed-cat-dot" style={{ background: cat.color }} />
            )}
            {sub.name}
          </span>
        )}
      </>
    );
  }

  function renderTagPills(item) {
    if (!item.tags || item.tags.length === 0) return null;
    return item.tags.map((tag) => (
      <span key={tag} className="hb-tag-pill"><IconTag width={13} height={13} />{tag}</span>
    ));
  }

  function renderItemCard(item, sectionKind, sectionKey, groupIdOfSection) {
    const isDragging = draggingId === item.id;
    const showDropLine = dragOverKey === sectionKey && dropBeforeId === item.id;

    return (
      <React.Fragment key={item.id}>
        {showDropLine && <div className="hb-fixed-drop-line" />}
        <div
          className={`hb-card hb-fixed-card-wrap${isDragging ? " is-dragging" : ""}`}
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverItem(e, sectionKind, sectionKey, item.id)}
          onDrop={(e) => handleDrop(e, sectionKind, groupIdOfSection, item.id)}
        >
          <div className="hb-card-content">
            <div className="hb-fixed-card">
              <span className="hb-fixed-drag-handle" aria-hidden="true">
                <IconDrag />
              </span>
              <div className="hb-fixed-body">
                <div className="hb-fixed-top">
                  <div className="hb-fixed-info">
                    <div className="hb-fixed-title-row">
                      <h3 className="hb-fixed-name">{item.name}</h3>
                      <div className="hb-fixed-amount hb-bad">-{fmt(item.amount)}</div>
                    </div>
                    <div className="hb-fixed-pills">
                      {renderCatPills(item)}
                      {renderTagPills(item)}
                    </div>
                  </div>
                </div>
                <div className="hb-fixed-actions">
                  <Button size="sm" onClick={() => bookNow(item)}>Jetzt buchen</Button>
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>Bearbeiten</Button>
                  <OverflowMenu
                    label={`Weitere Aktionen für „${item.name}“`}
                    buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                    items={[
                      { label: "Duplizieren", onClick: () => openDuplicateDialog(item) },
                      { label: "Löschen", danger: true, onClick: () => deleteItem(item) },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  }

  // Eine Sektion = eine Gruppe oder der „Weitere"-Bereich einer Spalte.
  // Beide verhalten sich funktional gleich (Drop-Ziel, „+", Sammelbuchung).
  function renderSection(columnKind, group) {
    const isGroup = !!group;
    const sectionKey = isGroup ? group.id : UNGROUPED_KEY[columnKind];
    const groupIdOfSection = isGroup ? group.id : null;
    const items = itemsBySection.get(sectionKey) || EMPTY_ARRAY;
    const total = sectionTotals.get(sectionKey) || 0;
    const label = isGroup
      ? group.name
      : (groupsByColumn[columnKind].length > 0 ? "Weitere" : "Alle Positionen");
    const isDropTargetEmpty =
      draggingId !== null && dragOverKey === sectionKey && dropBeforeId === null;

    return (
      <section
        key={sectionKey}
        className={`hb-fixed-group${isGroup ? "" : " hb-fixed-group--ungrouped"}`}
      >
        <header className="hb-fixed-group-head">
          {isGroup && renamingGroupId === group.id ? (
            <input
              className="hb-input hb-fixed-group-rename"
              autoFocus
              value={groupNameDraft}
              onChange={(e) => setGroupNameDraft(e.target.value)}
              onBlur={() => renameGroup(group.id, groupNameDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameGroup(group.id, groupNameDraft);
                if (e.key === "Escape") setRenamingGroupId(null);
              }}
            />
          ) : isGroup ? (
            <button
              className="hb-fixed-group-title"
              onClick={() => { setRenamingGroupId(group.id); setGroupNameDraft(group.name); }}
              title="Klicken zum Umbenennen"
            >
              {group.name}
            </button>
          ) : (
            <span className="hb-fixed-group-title hb-fixed-group-title--static">{label}</span>
          )}
          <span className="hb-fixed-group-total">{fmt(total)}</span>
          <Button
            size="sm"
            variant="outline"
            className="hb-fixed-group-book"
            onClick={() => bookSection(label, items, isGroup)}
            disabled={items.length === 0}
          >
            Alle buchen
          </Button>
          <button
            className="hb-icon-btn hb-icon-btn--sm"
            onClick={() => openCreateDialog({ groupId: groupIdOfSection, kind: columnKind, lockKind: true })}
            title={isGroup ? `Position zur Gruppe „${label}“ hinzufügen` : "Position ohne Gruppe hinzufügen"}
            aria-label="Position hinzufügen"
          >
            <IconPlus width={15} height={15} />
          </button>
          {isGroup && (
            <button
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--danger"
              onClick={() => deleteGroup(group)}
              title="Gruppe löschen"
              aria-label="Gruppe löschen"
            >
              <IconDelete width={15} height={15} />
            </button>
          )}
        </header>
        <div
          className={`hb-fixed-group-body${isDropTargetEmpty ? " is-drop-target" : ""}`}
          onDragOver={(e) => handleDragOverGroupBody(e, columnKind, sectionKey)}
          onDrop={(e) => handleDrop(e, columnKind, groupIdOfSection, null)}
        >
          {items.length === 0 ? (
            <div className="hb-fixed-group-empty">Positionen hierher ziehen</div>
          ) : (
            items.map((item) => renderItemCard(item, columnKind, sectionKey, groupIdOfSection))
          )}
        </div>
      </section>
    );
  }

  const isEmpty = recurringExpenses.length === 0 && fixedCostGroups.length === 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="hb-fixed-toolbar">
        <div className="hb-stat-pill hb-stat-pill--accent hb-fixed-toolbar-pill">
          <span className="hb-stat-pill-label">Gesamt</span>
          <span className="hb-stat-pill-value">{fmt(totalAmount)}</span>
        </div>
        <div className="hb-fixed-toolbar-actions">
          <Button onClick={() => openCreateDialog()}>
            <IconPlus /> Neue Fixkosten
          </Button>
        </div>
      </div>

      {/* Neue Gruppe anlegen — die Spalte ergibt sich aus dem Aufrufer */}
      <EditDialog
        open={groupDialogOpen}
        title="Neue Gruppe"
        onClose={() => setGroupDialogOpen(false)}
        onSave={createGroup}
        canSave={!!groupNameDraft.trim()}
        saveLabel="Anlegen"
      >
        <div className="hb-field">
          <div className="hb-label">Gruppenname</div>
          <input
            className="hb-input"
            style={{ width: "100%", minWidth: 0 }}
            type="text"
            placeholder={groupDialogKind === "expense" ? "z.B. Wohnen, Abos" : "z.B. Steuern, Rücklagen"}
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && groupNameDraft.trim()) createGroup(); }}
          />
          <div className="hb-fixed-field-hint">
            Wird in der Spalte „{columnLabel(groupDialogKind)}“ angelegt.
          </div>
        </div>
      </EditDialog>

      {/* Empty State */}
      {isEmpty ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconFixed /></div>
              <div className="hb-empty-title">Noch keine Fixkosten</div>
              <div className="hb-empty-text">
                Erfasse wiederkehrende Ausgaben wie Miete, Abos oder Versicherungen,
                um sie monatlich mit einem Klick zu buchen.
              </div>
              <Button onClick={() => openCreateDialog()}>
                <IconPlus /> Neue Fixkosten
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="hb-fixed-columns">
          {COLUMNS.map((column) => {
            const columnGroups = groupsByColumn[column.kind];
            const ungroupedItems = itemsBySection.get(UNGROUPED_KEY[column.kind]) || EMPTY_ARRAY;
            const isColumnEmpty = columnGroups.length === 0 && ungroupedItems.length === 0;
            const count = columnCounts[column.kind];

            return (
              <section
                key={column.kind}
                className={`hb-fixed-column hb-fixed-column--${column.kind}`}
                aria-label={column.title}
              >
                <header className="hb-fixed-col-head">
                  <div className="hb-fixed-col-heading">
                    <h2 className="hb-fixed-col-title">{column.title}</h2>
                    <div className="hb-fixed-col-meta">
                      {count === 1 ? "1 Position" : `${count} Positionen`}
                    </div>
                  </div>
                  <div className="hb-fixed-col-total">{fmt(columnTotals[column.kind])}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openGroupDialog(column.kind)}
                  >
                    <IconPlus /> Gruppe
                  </Button>
                </header>

                {isColumnEmpty ? (
                  <div className="hb-fixed-col-empty">
                    <div>{column.emptyText}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCreateDialog({ kind: column.kind, lockKind: true })}
                    >
                      <IconPlus /> {column.addLabel}
                    </Button>
                  </div>
                ) : (
                  <div className="hb-fixed-col-body">
                    {columnGroups.map((group) => renderSection(column.kind, group))}
                    {renderSection(column.kind, null)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Dialog: Fixkosten erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingItem ? "Fixkosten bearbeiten" : duplicateSourceId ? "Fixkosten duplizieren" : "Neue Fixkosten"}
        onClose={closeDialog}
        onSave={saveItem}
        canSave={canSave}
        saveLabel={editingItem ? "Speichern" : duplicateSourceId ? "Duplizieren" : "Erstellen"}
        size="medium"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, width: "100%" }}>
            <div className="hb-field">
              <div className="hb-label">Name</div>
              <input
                className="hb-input"
                style={{ width: "100%", minWidth: 0 }}
                type="text"
                placeholder="z.B. Spotify, Miete, Versicherung"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="hb-field">
              <div className="hb-label">Betrag ({baseCurrency})</div>
              <input
                className="hb-input"
                style={{ width: "100%", minWidth: 0 }}
                type="text"
                inputMode="decimal"
                placeholder="z.B. 12.90"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%" }}>
            <div className="hb-field">
              <div className="hb-label">Art</div>
              <select
                className="hb-input"
                value={draft.kind}
                disabled={kindLocked}
                onChange={(e) => handleKindChange(e.target.value)}
              >
                <option value="expense">Ausgabe</option>
                <option value="transfer">Transfer/Rücklage</option>
              </select>
              {kindLocked && (
                <div className="hb-fixed-field-hint">
                  Durch die Spalte „{columnLabel(draft.kind)}“ vorgegeben.
                </div>
              )}
            </div>
            <div className="hb-field">
              <div className="hb-label">Gruppe</div>
              <select
                className="hb-input"
                value={draft.groupId || ""}
                onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value || null }))}
              >
                <option value="">Weitere (keine Gruppe)</option>
                {dialogGroupOptions.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {editingItem && !kindLocked && (
                <div className="hb-fixed-field-hint">
                  Beim Wechsel der Art verliert die Position ihre Gruppe.
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="hb-field" style={{ width: "100%" }}>
            <div className="hb-label">Tags</div>
            <div className="hb-tag-input-field">
              {draft.tags.map((tag) => (
                <span key={tag} className="hb-tag-chip">
                  <IconTag width={13} height={13} />
                  {tag}
                  <button
                    type="button"
                    className="hb-tag-chip-remove"
                    onClick={() => handleTagRemove(tag)}
                    aria-label={`Tag ${tag} entfernen`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={draft.tags.length === 0 ? "Tag eingeben und Enter drücken…" : ""}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTagAdd(tagInput);
                  } else if (e.key === "Backspace" && !tagInput && draft.tags.length > 0) {
                    handleTagRemove(draft.tags[draft.tags.length - 1]);
                  } else if (e.key === ",") {
                    e.preventDefault();
                    handleTagAdd(tagInput);
                  }
                }}
              />
            </div>
            {availableTagSuggestions.length > 0 && (
              <div className="hb-tag-suggestions">
                {availableTagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="hb-tag-suggestion-pill"
                    onClick={() => handleTagAdd(tag)}
                  >
                    <IconPlus width={12} height={12} />
                    <IconTag width={13} height={13} />
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {draft.kind === "expense" && (
            <HierarchicalCategoryPicker
              label="Kategorie"
              value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId }}
              categories={expenseCategories}
              onChange={({ categoryId, subcategoryId }) =>
                setDraft((d) => ({ ...d, categoryId, subcategoryId }))
              }
            />
          )}

          {draft.kind === "transfer" && (
            <>
              <div className="hb-field">
                <div className="hb-label">Transfer-Zweck</div>
                <select
                  className="hb-input"
                  value={draft.transferCategory}
                  onChange={(e) => setDraft((d) => ({ ...d, transferCategory: e.target.value }))}
                >
                  {transferCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="hb-field">
                <div className="hb-label">In Topf</div>
                <select
                  className="hb-input"
                  value={draft.potId}
                  onChange={(e) => setDraft((d) => ({ ...d, potId: e.target.value }))}
                >
                  {pots.map((pot) => (
                    <option key={pot.id} value={pot.id}>{pot.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <label className="hb-fct-annual-toggle">
            <input
              type="checkbox"
              checked={draft.showInOverview}
              onChange={(e) => setDraft((d) => ({ ...d, showInOverview: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>In Übersicht anzeigen</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Position in der Fixkosten-Übersicht im Trendview anzeigen (inkl. Jahresbetrag)
              </div>
            </div>
          </label>
        </div>
      </EditDialog>
    </div>
  );
}
