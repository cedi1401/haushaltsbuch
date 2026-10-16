import { useState, useMemo } from "react";
import {
  parseAmount,
  todayISO,
  formatDateDE,
} from "../utils/formatUtils.js";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../utils/bookDefaults.js";
import { getEntryCategoryName } from "../utils/hbUtils.js";
import { generateId } from "../utils/idUtils.js";
import { getWithdrawalCategoriesForPot } from "../utils/potUtils.js";
import { templateToDraftPatch } from "../utils/entryTemplateUtils.js";
import { validTransferCategoryId } from "../utils/transferCategoryUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";

const INITIAL_ADD_DRAFT = {
  amount: "",
  category: "Allgemein",
  kind: "expense",
  source: "month",
  potId: "",
  note: "",
  date: "",
  categoryId: null,
  subcategoryId: null,
  transferCategoryId: "",
};

const INITIAL_EDIT_DRAFT = {
  date: "",
  kind: "expense",
  source: "month",
  potId: "",
  category: "Allgemein",
  categoryId: null,
  subcategoryId: null,
  transferCategoryId: "",
  note: "",
  amount: "",
};

// Felder, deren manuelle Änderung die angewendete Vorlage entwertet — also
// alles, was eine Vorlage strukturell festlegt. Bewusst NICHT enthalten:
//   date   — wird von einer Vorlage nie gesetzt
//   amount — bei „Betrag offen"-Vorlagen der vorgesehene nächste Schritt
//   note   — wird üblicherweise pro Buchung ergänzt
// Diese drei lassen den Aktiv-Zustand (und damit das usageCount-Hochzählen
// beim Speichern) bestehen.
const TEMPLATE_INVALIDATING_FIELDS = new Set([
  "kind",
  "categoryId",
  "subcategoryId",
  "potId",
  "transferCategoryId",
]);

// Computes all draft fields that depend on the entry `kind`. Done in the event
// path (see setAddField) rather than via cascading effects, so switching kind
// updates categoryId, subcategoryId, transferCategoryId and the legacy
// `category` string in a single state update — no Effect → setState → Effect chain.
// `transferCategories` sind nur die aktiven Zwecke (Objekte mit id).
function applyKindToDraft(draft, kind, transferCategories) {
  const next = { ...draft, kind };
  if (kind === "expense") {
    next.categoryId = null;
    next.subcategoryId = null;
    // legacy `category` is derived from categoryId in buildEntry — no sync needed
  } else if (kind === "income") {
    next.categoryId = "cat_einnahmen";
    next.subcategoryId = null;
    if (next.category !== "Allgemein") next.category = "Allgemein";
  } else {
    // transfer | withdrawal — transferCategoryId must be a valid transfer category
    next.categoryId = null;
    next.subcategoryId = null;
    next.transferCategoryId = validTransferCategoryId(transferCategories, next.transferCategoryId);
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

  // id der zuletzt angewendeten Vorlage — für den Aktiv-Zustand der Chips und
  // zum Hochzählen von usageCount beim tatsächlichen Speichern.
  const [appliedTemplateId, setAppliedTemplateId] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(() => ({
    ...INITIAL_EDIT_DRAFT,
    date: todayISO(),
  }));

  const entries = activeBook?.entries || EMPTY_ARRAY;

  function setAddField(field, value) {
    // Manuelle Änderung an einem vorlagenbestimmten Feld hebt den Aktiv-Zustand
    // der Vorlagen-Karte auf (siehe TEMPLATE_INVALIDATING_FIELDS).
    if (TEMPLATE_INVALIDATING_FIELDS.has(field)) setAppliedTemplateId(null);
    if (field === "kind") {
      setAddDraft((d) => applyKindToDraft(d, value, indicateTransferCategories));
      return;
    }
    setAddDraft((d) => ({ ...d, [field]: value }));
  }

  // Vorlage auf den Add-Draft anwenden. Ein einziges setAddDraft (siehe
  // Kommentar über applyKindToDraft — keine Effect → setState → Effect-Kette).
  // `date` wird bewusst nie angefasst.
  function applyTemplate(template) {
    if (!template) return;
    setAppliedTemplateId(template.id);
    setAddDraft((d) => {
      // Reihenfolge zwingend: erst die kind-abhängigen Defaults (eine Quelle
      // der Wahrheit), dann das aufgelöste Patch darüber. Umgekehrt würde
      // applyKindToDraft categoryId/subcategoryId wieder nullen und die
      // Vorlage entwerten.
      const base = applyKindToDraft(d, template.kind || "expense", indicateTransferCategories);
      const patch = templateToDraftPatch(template, {
        expenseCategories: activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES,
        incomeCategories: activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES,
        transferCategories: indicateTransferCategories,
        pots,
        fallbackPotId: d.potId,
      });

      // Bei Entnahmen hängt die Zweck-Liste am Topf. availableWithdrawalCategories
      // basiert noch auf dem alten potId — deshalb hier mit dem aufgelösten Topf
      // frisch rechnen, sonst steht im <select> ein Wert ohne passende Option.
      if (patch.kind === "withdrawal") {
        const allowed = getWithdrawalCategoriesForPot(entries, patch.potId, indicateTransferCategories);
        patch.transferCategoryId = validTransferCategoryId(allowed, patch.transferCategoryId);
      }

      return { ...base, ...patch };
    });
  }

  // Sync potId when available pots change — derived from the prop transition
  // rather than via an Effect (avoids set-state-in-effect). Reacts to async book
  // loads where `pots` arrives after the initial render.
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const [prevPots, setPrevPots] = useState(pots);
  if (pots !== prevPots) {
    setPrevPots(pots);
    setAddDraft((d) => {
      if (pots.length === 0) return d.potId === "" ? d : { ...d, potId: "" };
      if (!pots.some((p) => p.id === d.potId)) return { ...d, potId: pots[0].id };
      return d;
    });
  }

  // Re-validate transferCategoryId / legacy `category` when the active book or its transfer
  // categories change. The kind-change path is handled synchronously in
  // setAddField (applyKindToDraft) — this only reacts to external data. Derived
  // from the prop transition rather than via an Effect (avoids set-state-in-effect).
  const bookId = activeBook?.id;
  const [prevBookId, setPrevBookId] = useState(bookId);
  const [prevTransferCats, setPrevTransferCats] = useState(indicateTransferCategories);
  if (
    activeBook &&
    (bookId !== prevBookId || indicateTransferCategories !== prevTransferCats)
  ) {
    setPrevBookId(bookId);
    setPrevTransferCats(indicateTransferCategories);
    setAddDraft((d) => {
      const { kind, category, transferCategoryId } = d;
      if (kind === "transfer" || kind === "withdrawal") {
        const valid = validTransferCategoryId(indicateTransferCategories, transferCategoryId);
        if (valid !== transferCategoryId) return { ...d, transferCategoryId: valid };
      } else if (kind === "income") {
        if (category !== "Allgemein") return { ...d, category: "Allgemein" };
      }
      // expense: legacy `category` is derived from categoryId in buildEntry,
      // so the draft string needs no sync here.
      return d;
    });
  }

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
    setAppliedTemplateId(null);
    setAddDraft((prev) => ({ ...INITIAL_ADD_DRAFT, date: todayISO(), potId: prev.potId }));
  }

  function buildEntry(draft, book) {
    const { kind, categoryId, subcategoryId, category, transferCategoryId, amount, note, date, potId } = draft;
    let legacyCategory = category;
    if (kind === "expense") {
      legacyCategory =
        (book.expenseCategories || DEFAULT_EXPENSE_CATEGORIES).find((c) => c.id === categoryId)?.name || "";
    } else if (kind === "income") {
      legacyCategory =
        (book.incomeCategories || DEFAULT_INCOME_CATEGORIES).find((c) => c.id === categoryId)?.name || "";
    }

    const isTransferKind = kind === "transfer" || kind === "withdrawal";
    const entry = {
      id: generateId("entry"),
      amount: parseAmount(amount),
      kind,
      note: String(note || "").trim(),
      date,
      categoryId: kind === "expense" || kind === "income" ? categoryId : null,
      subcategoryId: kind === "expense" || kind === "income" ? subcategoryId : null,
    };
    // Legacy-Textfeld nur bei Einnahmen/Ausgaben; Transfers referenzieren ihren
    // Zweck ausschließlich über die ID.
    if (!isTransferKind) entry.category = legacyCategory;

    if (kind === "expense") entry.source = "month";
    if (isTransferKind) {
      entry.potId = potId;
      entry.transferCategoryId = transferCategoryId || null;
    }

    return entry;
  }

  function handleAddEntry() {
    if (!activeBook) return;
    const numericAmount = parseAmount(addDraft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!addDraft.date) return;

    const entry = buildEntry(addDraft, activeBook);
    patchActiveBook((b) => {
      const next = { ...b, entries: [...(b.entries || []), entry] };
      // usageCount erst beim tatsächlichen Speichern hochzählen, nicht beim
      // Anklicken des Chips — sonst verzerren Fehlklicks die Sortierung.
      if (appliedTemplateId) {
        next.entryTemplates = (b.entryTemplates || []).map((t) =>
          t.id === appliedTemplateId ? { ...t, usageCount: (t.usageCount || 0) + 1 } : t
        );
      }
      return next;
    });
    closeAddEntry();
  }

  function addTransferEntry(entry) {
    if (!activeBook) return;
    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), entry] }));
  }

  // Batch-Variante für Sammelbuchungen (z.B. „alle Positionen einer Fixkosten-
  // Gruppe buchen"): ein einziges State-Update statt N Aufrufe — spart N-1
  // Re-Render/Save-Zyklen und macht die Buchung atomar.
  function addEntries(newEntries) {
    if (!activeBook) return;
    if (!Array.isArray(newEntries) || newEntries.length === 0) return;
    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), ...newEntries] }));
  }

  async function removeEntry(id) {
    if (!activeBook) return;
    const target = (activeBook.entries || []).find((e) => e.id === id) || null;

    let prettyType = "Ausgabe";
    if (target?.kind === "income") prettyType = "Einnahme";
    else if (target?.kind === "transfer") prettyType = "Transfer";
    else if (target?.kind === "withdrawal") prettyType = "Entnahme";

    const prettyAmount = target ? fmt(Number(target.amount || 0)) : "";
    const prettyCategory = target
      ? getEntryCategoryName(
          target,
          activeBook.expenseCategories || DEFAULT_EXPENSE_CATEGORIES,
          activeBook.incomeCategories || DEFAULT_INCOME_CATEGORIES,
          activeBook.transferCategories
        )
      : "";
    const message = target
      ? `Eintrag wirklich löschen?\n\n${formatDateDE(target.date)} · ${prettyType} · ${prettyCategory}\nBetrag: ${prettyAmount}${target.note ? `\nNotiz: ${target.note}` : ""}`
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
    const isTransferKind = entry.kind === "transfer" || entry.kind === "withdrawal";
    setEditDraft({
      date: entry.date || todayISO(),
      kind: entry.kind || "expense",
      source: entry.source || "month",
      potId: entry.potId || "reserve",
      category: isTransferKind ? "Allgemein" : entry.category || "Allgemein",
      categoryId: entry.categoryId ?? null,
      subcategoryId: entry.subcategoryId ?? null,
      // Auch ein gelöschter Zweck bleibt erhalten — der Dialog zeigt ihn als
      // eigene Option. Ohne Zweck (z.B. Monatsüberschuss) oder beim späteren
      // Wechsel auf Transfer: erster aktiver.
      transferCategoryId: entry.transferCategoryId || indicateTransferCategories[0]?.id || "",
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

        const isTransferKind = editDraft.kind === "transfer" || editDraft.kind === "withdrawal";
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

        if (isTransferKind) {
          updated.potId = editDraft.potId;
          updated.transferCategoryId = editDraft.transferCategoryId || null;
          delete updated.category;
        } else {
          delete updated.potId;
          delete updated.transferCategoryId;
        }

        return updated;
      }),
    }));

    setEditOpen(false);
    setEditingId(null);
  }

  const canAddEntry = useMemo(() => {
    const { date, amount, kind, transferCategoryId, potId } = addDraft;
    if (!date) return false;
    const n = parseAmount(amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (kind === "transfer" && (!potId || !transferCategoryId)) return false;
    if (kind === "withdrawal" && (!potId || !transferCategoryId)) return false;
    return true;
  }, [addDraft]);

  const canSaveEdit = useMemo(() => {
    if (!editDraft.date) return false;
    const n = parseAmount(editDraft.amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (!editDraft.kind) return false;
    if (
      (editDraft.kind === "transfer" || editDraft.kind === "withdrawal") &&
      !editDraft.transferCategoryId
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
    applyTemplate, appliedTemplateId,
    // Edit dialog
    editOpen, editingId,
    editDraft, setEditDraft,
    closeEdit, saveEdit, canSaveEdit,
    editWithdrawalCategories,
    // Shared actions
    addTransferEntry, addEntries, removeEntry, startEdit,
  };
}
