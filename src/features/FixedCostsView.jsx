import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import EditDialog from "../components/EditDialog.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { generateId } from "../utils/idUtils.js";
import { DEFAULT_EXPENSE_CATEGORIES, parseAmount } from "../utils/hbUtils.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { IconFixed, IconPlus, IconDelete, IconDrag } from "../components/icons.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";

const EMPTY_ARRAY = [];

export default function FixedCostsView({
  activeBook,
  entries: _entries,
  baseCurrency = "CHF",
  onUpdateBook,
  onAddEntry,
  todayISO,
}) {
  const fmt = useFmt();
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
  const [tagInput, setTagInput] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    amount: "",
    kind: "expense",
    categoryId: "cat_unkategorisiert",
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

  // Drag & Drop
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(undefined);
  const [dropBeforeId, setDropBeforeId] = useState(null);

  // Gruppierung + Summen
  const { groupedItems, ungroupedItems, totalAmount, groupTotals } = useMemo(() => {
    const total = recurringExpenses.reduce((s, i) => s + Number(i.amount || 0), 0);
    const byGroup = new Map();
    const ungrouped = [];
    for (const item of recurringExpenses) {
      const gid = item.groupId || null;
      if (gid && fixedCostGroups.some((g) => g.id === gid)) {
        if (!byGroup.has(gid)) byGroup.set(gid, []);
        byGroup.get(gid).push(item);
      } else {
        ungrouped.push(item);
      }
    }
    const totals = new Map();
    for (const [gid, items] of byGroup) {
      totals.set(gid, items.reduce((s, i) => s + Number(i.amount || 0), 0));
    }
    return { groupedItems: byGroup, ungroupedItems: ungrouped, totalAmount: total, groupTotals: totals };
  }, [recurringExpenses, fixedCostGroups]);

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

  // Gruppen-CRUD
  function createGroup() {
    const name = (groupNameDraft || "").trim();
    if (!name) return;
    const maxOrder = fixedCostGroups.reduce((m, g) => Math.max(m, g.order ?? 0), 0);
    const newGroup = { id: generateId("fcg"), name, order: maxOrder + 1 };
    onUpdateBook({ ...activeBook, fixedCostGroups: [...fixedCostGroups, newGroup] });
    setGroupNameDraft("");
    setRenamingGroupId(null);
  }

  function renameGroup(groupId, newName) {
    const name = (newName || "").trim();
    if (!name) { setRenamingGroupId(null); return; }
    const updated = fixedCostGroups.map((g) => g.id === groupId ? { ...g, name } : g);
    onUpdateBook({ ...activeBook, fixedCostGroups: updated });
    setRenamingGroupId(null);
  }

  async function deleteGroup(group) {
    const itemCount = recurringExpenses.filter((r) => r.groupId === group.id).length;
    const ok = await confirm({
      title: "Gruppe löschen",
      message: itemCount > 0
        ? `Gruppe „${group.name}" löschen? Die ${itemCount} enthaltene${itemCount !== 1 ? "n" : ""} Fixkosten werden nach „Weitere" verschoben.`
        : `Gruppe „${group.name}" wirklich löschen?`,
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
  function openCreateDialog(presetGroupId = null) {
    setEditingItem(null);
    setDraft({
      name: "",
      amount: "",
      kind: "expense",
      categoryId: "cat_unkategorisiert",
      subcategoryId: null,
      transferCategory: transferCategories[0] || "Steuern",
      potId: pots[0]?.id || "",
      groupId: presetGroupId,
      showInOverview: false,
      tags: [],
    });
    setTagInput("");
    setDialogOpen(true);
  }

  function openEditDialog(item) {
    setEditingItem(item);
    setDraft({
      name: item.name || "",
      amount: String(item.amount || ""),
      kind: item.kind || "expense",
      categoryId: item.categoryId || "cat_unkategorisiert",
      subcategoryId: item.subcategoryId || null,
      transferCategory: item.transferCategory || transferCategories[0] || "Steuern",
      potId: item.potId || pots[0]?.id || "",
      groupId: item.groupId || null,
      showInOverview: item.showInOverview !== false,
      tags: item.tags || [],
    });
    setTagInput("");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingItem(null);
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
              groupId: draft.groupId || null,
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
        groupId: draft.groupId || null,
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
      onUpdateBook({ ...activeBook, recurringExpenses: [...recurringExpenses, newItem] });
    }
    closeDialog();
  }

  async function deleteItem(item) {
    if (!activeBook) return;
    const ok = await confirm({
      title: "Fixkosten löschen",
      message: `Fixkosten „${item.name}" wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    onUpdateBook({ ...activeBook, recurringExpenses: recurringExpenses.filter((i) => i.id !== item.id) });
    toast.success("Fixkosten gelöscht.");
  }

  function bookNow(item) {
    const today = todayISO();
    const entry = {
      id: generateId("entry"),
      date: today,
      amount: item.amount,
      category: item.kind === "transfer" ? item.transferCategory : undefined,
      categoryId: item.kind === "expense" ? (item.categoryId || null) : null,
      subcategoryId: item.kind === "expense" ? (item.subcategoryId || null) : null,
      kind: item.kind,
      note: item.name,
    };
    if (item.kind === "transfer") entry.potId = item.potId;
    if (item.kind === "expense") entry.source = "month";
    onAddEntry(entry);
    toast.success(`„${item.name}" wurde gebucht.`);
  }

  // Drag & Drop
  function handleDragStart(e, item) {
    setDraggingId(item.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverGroupId(undefined);
    setDropBeforeId(null);
  }

  function handleDragOverItem(e, targetGroupId, beforeId) {
    if (!draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(targetGroupId);
    setDropBeforeId(beforeId);
  }

  function handleDragOverGroupBody(e, targetGroupId) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(targetGroupId);
    setDropBeforeId(null);
  }

  function handleDrop(e, targetGroupId, beforeId) {
    e.preventDefault();
    e.stopPropagation();
    const dragId = draggingId || e.dataTransfer.getData("text/plain");
    if (!dragId) return handleDragEnd();
    const dragged = recurringExpenses.find((r) => r.id === dragId);
    if (!dragged) return handleDragEnd();

    const rest = recurringExpenses.filter((r) => r.id !== dragId);
    const movedItem = { ...dragged, groupId: targetGroupId || null };

    let insertIndex;
    if (beforeId) {
      insertIndex = rest.findIndex((r) => r.id === beforeId);
      if (insertIndex === -1) insertIndex = rest.length;
    } else {
      const targetKey = targetGroupId || null;
      let lastIdx = -1;
      rest.forEach((r, idx) => {
        const gid = (r.groupId && fixedCostGroups.some((g) => g.id === r.groupId)) ? r.groupId : null;
        if (gid === targetKey) lastIdx = idx;
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

  function renderCatPills(item) {
    if (item.kind === "transfer") {
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
      <span key={tag} className="hb-tag-pill">#{tag}</span>
    ));
  }

  function renderItemCard(item, groupIdOfSection) {
    const isDragging = draggingId === item.id;
    const normGroupId = groupIdOfSection || null;
    const showDropLine =
      dragOverGroupId === normGroupId && dropBeforeId === item.id;

    return (
      <React.Fragment key={item.id}>
        {showDropLine && <div className="hb-fixed-drop-line" />}
        <div
          className={`hb-card hb-fixed-card-wrap${isDragging ? " is-dragging" : ""}`}
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverItem(e, normGroupId, item.id)}
          onDrop={(e) => handleDrop(e, normGroupId, item.id)}
        >
          <div className="hb-card-content">
            <div className="hb-fixed-card">
              <span className="hb-fixed-drag-handle" aria-hidden="true">
                <IconDrag />
              </span>
              <div className="hb-fixed-body">
                <div className="hb-fixed-top">
                  <div className="hb-fixed-info">
                    <h3 className="hb-fixed-name">{item.name}</h3>
                    <div className="hb-fixed-pills">
                      <span
                        className={
                          item.kind === "expense"
                            ? "hb-fixed-kind-pill hb-fixed-kind-pill--expense"
                            : "hb-fixed-kind-pill hb-fixed-kind-pill--transfer"
                        }
                      >
                        {item.kind === "expense" ? "Ausgabe" : "Transfer"}
                      </span>
                      {renderCatPills(item)}
                      {renderTagPills(item)}
                    </div>
                  </div>
                  <div className="hb-fixed-amount hb-bad">-{fmt(item.amount)}</div>
                </div>
                <div className="hb-fixed-actions">
                  <Button size="sm" onClick={() => bookNow(item)}>Jetzt buchen</Button>
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>Bearbeiten</Button>
                  <Button size="sm" variant="outline" onClick={() => deleteItem(item)}>Löschen</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  }

  const sortedGroups = [...fixedCostGroups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const showUngroupedSection = ungroupedItems.length > 0 || fixedCostGroups.length > 0;
  const isEmpty = recurringExpenses.length === 0 && fixedCostGroups.length === 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="hb-fixed-toolbar">
        <div className="hb-fixed-hero">
          <span className="hb-fixed-hero-label">Monatliche Summe</span>
          <span className="hb-fixed-hero-value">{fmt(totalAmount)}</span>
        </div>
        <div className="hb-fixed-toolbar-actions">
          <Button
            variant="outline"
            onClick={() => { setRenamingGroupId("__new__"); setGroupNameDraft(""); }}
          >
            <IconPlus /> Gruppe
          </Button>
          <Button onClick={() => openCreateDialog()}>
            <IconPlus /> Neue Fixkosten
          </Button>
        </div>
      </div>

      {/* Neue Gruppe anlegen */}
      {renamingGroupId === "__new__" && (
        <div className="hb-fixed-group-create">
          <input
            className="hb-input"
            autoFocus
            placeholder="Gruppenname (z.B. Wohnen, Abos)"
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createGroup();
              if (e.key === "Escape") setRenamingGroupId(null);
            }}
          />
          <Button onClick={createGroup} disabled={!groupNameDraft.trim()}>Anlegen</Button>
          <Button variant="outline" onClick={() => setRenamingGroupId(null)}>Abbrechen</Button>
        </div>
      )}

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
        <div className="hb-fixed-groups">
          {/* Definierte Gruppen */}
          {sortedGroups.map((group) => {
            const items = groupedItems.get(group.id) || [];
            const isDropTargetEmpty =
              dragOverGroupId === group.id && dropBeforeId === null && draggingId !== null;

            return (
              <section key={group.id} className="hb-fixed-group">
                <header className="hb-fixed-group-head">
                  {renamingGroupId === group.id ? (
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
                  ) : (
                    <button
                      className="hb-fixed-group-title"
                      onClick={() => { setRenamingGroupId(group.id); setGroupNameDraft(group.name); }}
                      title="Klicken zum Umbenennen"
                    >
                      {group.name}
                    </button>
                  )}
                  <span className="hb-fixed-group-total">{fmt(groupTotals.get(group.id) || 0)}</span>
                  <button
                    className="hb-icon-btn"
                    onClick={() => openCreateDialog(group.id)}
                    title="Fixkosten zu dieser Gruppe hinzufügen"
                    aria-label="Fixkosten hinzufügen"
                  >
                    <IconPlus width={15} height={15} />
                  </button>
                  <button
                    className="hb-icon-btn hb-icon-btn--danger"
                    onClick={() => deleteGroup(group)}
                    title="Gruppe löschen"
                    aria-label="Gruppe löschen"
                  >
                    <IconDelete width={15} height={15} />
                  </button>
                </header>
                <div
                  className={`hb-fixed-group-body${isDropTargetEmpty ? " is-drop-target" : ""}`}
                  onDragOver={(e) => handleDragOverGroupBody(e, group.id)}
                  onDrop={(e) => handleDrop(e, group.id, null)}
                >
                  {items.length === 0 ? (
                    <div className="hb-fixed-group-empty">Fixkosten hierher ziehen</div>
                  ) : (
                    items.map((item) => renderItemCard(item, group.id))
                  )}
                </div>
              </section>
            );
          })}

          {/* Weitere (ungegruppiert) */}
          {showUngroupedSection && (
            <section className="hb-fixed-group hb-fixed-group--ungrouped">
              <header className="hb-fixed-group-head">
                <span className="hb-fixed-group-title hb-fixed-group-title--static">
                  {fixedCostGroups.length > 0 ? "Weitere" : "Alle Fixkosten"}
                </span>
                <span className="hb-fixed-group-total">
                  {fmt(ungroupedItems.reduce((s, i) => s + Number(i.amount || 0), 0))}
                </span>
              </header>
              <div
                className={`hb-fixed-group-body${dragOverGroupId === null && dropBeforeId === null && draggingId !== null ? " is-drop-target" : ""}`}
                onDragOver={(e) => handleDragOverGroupBody(e, null)}
                onDrop={(e) => handleDrop(e, null, null)}
              >
                {ungroupedItems.length === 0 ? (
                  <div className="hb-fixed-group-empty">Fixkosten hierher ziehen</div>
                ) : (
                  ungroupedItems.map((item) => renderItemCard(item, null))
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Dialog: Fixkosten erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingItem ? "Fixkosten bearbeiten" : "Neue Fixkosten"}
        onClose={closeDialog}
        onSave={saveItem}
        canSave={canSave}
        saveLabel={editingItem ? "Speichern" : "Erstellen"}
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
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
              >
                <option value="expense">Ausgabe</option>
                <option value="transfer">Transfer/Rücklage</option>
              </select>
            </div>
            <div className="hb-field">
              <div className="hb-label">Gruppe</div>
              <select
                className="hb-input"
                value={draft.groupId || ""}
                onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value || null }))}
              >
                <option value="">Weitere (keine Gruppe)</option>
                {fixedCostGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div className="hb-field" style={{ width: "100%" }}>
            <div className="hb-label">Tags</div>
            <div className="hb-tag-input-field">
              {draft.tags.map((tag) => (
                <span key={tag} className="hb-tag-chip">
                  #{tag}
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
                    + #{tag}
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
