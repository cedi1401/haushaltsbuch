import { useState, useEffect, useMemo } from "react";
import {
  parseAmount,
  todayISO,
  formatDateDE,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "../utils/hbUtils.js";
import { generateId } from "../utils/idUtils.js";
import { getWithdrawalCategoriesForPot } from "../utils/potUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";

const INITIAL_ADD_DRAFT = {
  amount: "",
  category: "Allgemein",
  kind: "expense",
  source: "month",
  potId: "",
  note: "",
  date: "",
  categoryId: "cat_unkategorisiert",
  subcategoryId: null,
};

const INITIAL_EDIT_DRAFT = {
  date: "",
  kind: "expense",
  source: "month",
  potId: "",
  category: "Allgemein",
  categoryId: null,
  subcategoryId: null,
  note: "",
  amount: "",
};

// Computes all draft fields that depend on the entry `kind`. Done in the event
// path (see setAddField) rather than via cascading effects, so switching kind
// updates categoryId, subcategoryId and the legacy `category` string in a single
// state update — no Effect → setState → Effect chain.
function applyKindToDraft(draft, kind, transferCategories) {
  const next = { ...draft, kind };
  if (kind === "expense") {
    next.categoryId = "cat_unkategorisiert";
    next.subcategoryId = null;
    // legacy `category` is derived from categoryId in buildEntry — no sync needed
  } else if (kind === "income") {
    next.categoryId = "cat_einnahmen";
    next.subcategoryId = null;
    if (next.category !== "Allgemein") next.category = "Allgemein";
  } else {
    // transfer | withdrawal — legacy `category` must be a valid transfer category
    next.categoryId = null;
    next.subcategoryId = null;
    if (!transferCategories.includes(next.category)) {
      next.category = transferCategories[0] || "";
    }
  }
  return next;
}

export function useEntryActions({
  activeBook,
  patchActiveBook,
  fmt,
  confirm,
  indicateTransferCategories,
}) {
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(() => ({
    ...INITIAL_ADD_DRAFT,
    date: todayISO(),
  }));

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(() => ({
    ...INITIAL_EDIT_DRAFT,
    date: todayISO(),
  }));

  const entries = activeBook?.entries || EMPTY_ARRAY;

  function setAddField(field, value) {
    if (field === "kind") {
      setAddDraft((d) => applyKindToDraft(d, value, indicateTransferCategories));
      return;
    }
    setAddDraft((d) => ({ ...d, [field]: value }));
  }

  // Sync potId when available pots change
  useEffect(() => {
    const pots = activeBook?.pots || [];
    if (pots.length === 0) {
      setAddDraft((d) => ({ ...d, potId: "" }));
      return;
    }
    setAddDraft((d) => {
      if (!pots.some((p) => p.id === d.potId)) return { ...d, potId: pots[0].id };
      return d;
    });
  }, [activeBook?.pots]);

  // Re-validate the legacy `category` when the active book or its transfer
  // categories change. The kind-change path is handled synchronously in
  // setAddField (applyKindToDraft) — this effect only reacts to external data.
  useEffect(() => {
    if (!activeBook) return;
    setAddDraft((d) => {
      const { kind, category } = d;
      if (kind === "transfer" || kind === "withdrawal") {
        if (!indicateTransferCategories.includes(category)) {
          return { ...d, category: indicateTransferCategories[0] || "" };
        }
      } else if (kind === "income") {
        if (category !== "Allgemein") return { ...d, category: "Allgemein" };
      }
      // expense: legacy `category` is derived from categoryId in buildEntry,
      // so the draft string needs no sync here.
      return d;
    });
  }, [activeBook?.id, indicateTransferCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableWithdrawalCategories = useMemo(
    () => getWithdrawalCategoriesForPot(entries, addDraft.potId, indicateTransferCategories),
    [entries, addDraft.potId, indicateTransferCategories]
  );

  const editWithdrawalCategories = useMemo(
    () => getWithdrawalCategoriesForPot(entries, editDraft.potId, indicateTransferCategories),
    [entries, editDraft.potId, indicateTransferCategories]
  );

  function closeAddEntry() {
    setAddEntryOpen(false);
    setAddDraft((prev) => ({ ...INITIAL_ADD_DRAFT, date: todayISO(), potId: prev.potId }));
  }

  function buildEntry(draft, book) {
    const { kind, categoryId, subcategoryId, category, amount, note, date, potId } = draft;
    let legacyCategory = category;
    if (kind === "expense") {
      legacyCategory =
        (book.expenseCategories || DEFAULT_EXPENSE_CATEGORIES).find((c) => c.id === categoryId)?.name || "";
    } else if (kind === "income") {
      legacyCategory =
        (book.incomeCategories || DEFAULT_INCOME_CATEGORIES).find((c) => c.id === categoryId)?.name || "";
    }

    const entry = {
      id: generateId("entry"),
      amount: parseAmount(amount),
      category: legacyCategory,
      kind,
      note: String(note || "").trim(),
      date,
      categoryId: kind === "expense" || kind === "income" ? categoryId : null,
      subcategoryId: kind === "expense" || kind === "income" ? subcategoryId : null,
    };

    if (kind === "expense") entry.source = "month";
    if (kind === "transfer" || kind === "withdrawal") entry.potId = potId;

    return entry;
  }

  function handleAddEntry() {
    if (!activeBook) return;
    const numericAmount = parseAmount(addDraft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!addDraft.date) return;

    const entry = buildEntry(addDraft, activeBook);
    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), entry] }));
    closeAddEntry();
  }

  function addTransferEntry(entry) {
    if (!activeBook) return;
    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), entry] }));
  }

  async function removeEntry(id) {
    if (!activeBook) return;
    const target = (activeBook.entries || []).find((e) => e.id === id) || null;

    let prettyType = "Ausgabe";
    if (target?.kind === "income") prettyType = "Einnahme";
    else if (target?.kind === "transfer") prettyType = "Transfer";
    else if (target?.kind === "withdrawal") prettyType = "Entnahme";

    const prettyAmount = target ? fmt(Number(target.amount || 0)) : "";
    const message = target
      ? `Eintrag wirklich löschen?\n\n${formatDateDE(target.date)} · ${prettyType} · ${target.category || ""}\nBetrag: ${prettyAmount}${target.note ? `\nNotiz: ${target.note}` : ""}`
      : "Eintrag wirklich löschen?";

    const ok = await confirm({
      title: "Eintrag löschen",
      message,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;

    if (editingId === id) {
      setEditOpen(false);
      setEditingId(null);
    }
    patchActiveBook((b) => ({
      ...b,
      entries: (b.entries || []).filter((e) => e.id !== id),
    }));
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    const fallbackCategory =
      entry.kind === "withdrawal"
        ? entry.category || indicateTransferCategories[0] || ""
        : entry.category || "Allgemein";
    setEditDraft({
      date: entry.date || todayISO(),
      kind: entry.kind || "expense",
      source: entry.source || "month",
      potId: entry.potId || "reserve",
      category: fallbackCategory,
      categoryId: entry.categoryId ?? null,
      subcategoryId: entry.subcategoryId ?? null,
      note: entry.note || "",
      amount: String(entry.amount ?? ""),
    });
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditingId(null);
  }

  function saveEdit() {
    if (!activeBook || editingId == null || !editDraft.date) return;
    const numericAmount = parseAmount(editDraft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    patchActiveBook((b) => ({
      ...b,
      entries: (b.entries || []).map((e) => {
        if (e.id !== editingId) return e;

        let legacyCat = editDraft.category;
        if (editDraft.kind === "expense") {
          legacyCat =
            (b.expenseCategories || DEFAULT_EXPENSE_CATEGORIES).find(
              (c) => c.id === editDraft.categoryId
            )?.name || editDraft.category;
        } else if (editDraft.kind === "income") {
          legacyCat =
            (b.incomeCategories || DEFAULT_INCOME_CATEGORIES).find(
              (c) => c.id === editDraft.categoryId
            )?.name || editDraft.category;
        }

        const updated = {
          ...e,
          date: editDraft.date,
          kind: editDraft.kind,
          category: legacyCat,
          categoryId:
            editDraft.kind === "expense" || editDraft.kind === "income"
              ? editDraft.categoryId ?? null
              : null,
          subcategoryId:
            editDraft.kind === "expense" || editDraft.kind === "income"
              ? editDraft.subcategoryId ?? null
              : null,
          note: String(editDraft.note || "").trim(),
          amount: numericAmount,
        };

        if (editDraft.kind === "expense") {
          updated.source = "month";
        } else {
          delete updated.source;
        }

        if (editDraft.kind === "transfer" || editDraft.kind === "withdrawal") {
          updated.potId = editDraft.potId;
        } else {
          delete updated.potId;
        }

        return updated;
      }),
    }));

    setEditOpen(false);
    setEditingId(null);
  }

  const canAddEntry = useMemo(() => {
    const { date, amount, kind, category, potId } = addDraft;
    if (!date) return false;
    const n = parseAmount(amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (kind === "transfer" && (!potId || !category)) return false;
    if (kind === "withdrawal" && (!potId || !category)) return false;
    return true;
  }, [addDraft]);

  const canSaveEdit = useMemo(() => {
    if (!editDraft.date) return false;
    const n = parseAmount(editDraft.amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (!editDraft.kind) return false;
    if (
      (editDraft.kind === "transfer" || editDraft.kind === "withdrawal") &&
      !editDraft.category
    )
      return false;
    return true;
  }, [editDraft]);

  return {
    // Add dialog
    addEntryOpen, setAddEntryOpen,
    addDraft, setAddField,
    closeAddEntry, handleAddEntry, canAddEntry,
    availableWithdrawalCategories,
    // Edit dialog
    editOpen, editingId,
    editDraft, setEditDraft,
    closeEdit, saveEdit, canSaveEdit,
    editWithdrawalCategories,
    // Shared actions
    addTransferEntry, removeEntry, startEdit,
  };
}
