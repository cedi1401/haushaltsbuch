import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import EditDialog from "../components/EditDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import DataTable from "../components/DataTable.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import { HbDatePicker } from "../components/HbDatePicker.jsx";
import { generateId } from "../utils/idUtils.js";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  fixedCostKind,
  formatDateDE,
  parseAmount,
  todayISO,
} from "../utils/hbUtils.js";
import { isSinkingFund, monthlyRate } from "../utils/fixedCostUtils.js";
import { getFinancialMonth } from "../utils/financialMonthUtils.js";
import { GROUP_ACCENT_PALETTE } from "../utils/hbPalette.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/toastContext.js";
import { IconClose, IconEdit, IconFixed, IconPlus, IconTag, IconWarning } from "../components/icons.jsx";
import { useFmt, useBaseCurrency } from "../contexts/CurrencyContext.jsx";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { buildFixedCostColumns, renderBookedStatus } from "./fixed/fixedCostColumns.jsx";

// Die beiden Tabellen des Views, untereinander. Die Reihenfolge ist zugleich
// die Darstellungsreihenfolge.
const TABLES = [
  {
    kind: "expense",
    title: "Ausgaben",
    addLabel: "Ausgabe",
    emptyText:
      "Noch keine wiederkehrenden Ausgaben — z.B. Miete, Abos oder Versicherungen.",
  },
  {
    kind: "transfer",
    title: "Rücklagen & Rückstellungen",
    addLabel: "Transfer",
    emptyText:
      "Noch keine wiederkehrenden Transfers — z.B. eine Rückstellung für die Jahresrechnung "
      + "oder eine monatliche Rücklage in einen Topf.",
  },
];

// Sektions-Schlüssel für Positionen ohne (gültige) Gruppe. Jede Tabelle hat
// ihre eigenen Sektionen, ein gemeinsamer Schlüssel ist daher eindeutig.
const UNGROUPED_KEY = "ungrouped";

// Turnus-Auswahl im Dialog. Der Wert ist bewusst ein String — das <select>
// liefert immer Strings, die Umwandlung nach `number|null` passiert im Handler.
//
// „Monatlich" fehlt bewusst: Bei Turnus 1 ist die Monatsrate der volle
// Rechnungsbetrag, angespart wird also nie. Was monatlich in einen Topf geht,
// ist eine Rücklage ohne Turnus — keine Rückstellung für einen Termin.
const TURNUS_OPTIONS = [
  { value: "", label: "Kein Turnus (Rücklage)" },
  { value: "3", label: "Quartalsweise" },
  { value: "6", label: "Halbjährlich" },
  { value: "12", label: "Jährlich" },
  { value: "24", label: "Alle 2 Jahre" },
  { value: "36", label: "Alle 3 Jahre" },
];

/**
 * Der Katalog, ergänzt um einen Bestandswert, den er nicht (mehr) führt.
 *
 * Ohne die Ergänzung fällt das <select> stumm auf seinen ersten Eintrag zurück:
 * Die Position zeigte „Kein Turnus" und daneben ein aktives Fälligkeitsfeld mit
 * Datum — ein sichtbarer Widerspruch, der beim nächsten Speichern zur stillen
 * Änderung würde. Die Normalisierung lässt jeden Turnus > 0 durch, der Katalog
 * kann also nie alle vorkommenden Werte kennen.
 */
function turnusOptionsFor(turnus) {
  if (!turnus || TURNUS_OPTIONS.some((o) => o.value === String(turnus))) return TURNUS_OPTIONS;
  const label = turnus === 1 ? "Monatlich" : `Alle ${turnus} Monate`;
  return [...TURNUS_OPTIONS, { value: String(turnus), label: `${label} (Bestandswert)` }];
}

/**
 * Kostenregel: Als Fixkosten zählen Ausgaben und Rückstellungen mit
 * Turnus. Ein Transfer ohne Turnus ist eine Rücklage — freies Sparen ohne
 * Rechnung dahinter. Dieselbe Regel wie in `useFixedCostTrend`.
 */
function countsAsFixedCost(item) {
  return fixedCostKind(item) === "expense" || isSinkingFund(item);
}

// Schlüssel der Monatsbuchungen. Die Art gehört dazu: eine Entnahme aus
// „Rechnung bezahlt" ist keine Monatsrate und darf den Status nicht setzen.
function bookingKey(kind, id) {
  return `${kind}:${id}`;
}

export default function FixedCostsView({
  activeBook,
  entries,
  monthStartDay = 1,
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
  // Aus einer Tabelle/Gruppe heraus angelegte Positionen erben deren Art —
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
    // Nur für Transfers: Turnus als Zahl (null | 1 | 3 | 6 | 12), Fälligkeit als
    // ISO-String. `""` ist bei HbDatePicker die Darstellung für „kein Datum".
    turnus: null,
    faelligkeit: "",
    groupId: null,
    // false wie in openCreateDialog() — neue Positionen erscheinen erst nach
    // bewusster Wahl in der Trend-Übersicht. Der Wert hier wird nie gerendert
    // (jeder Öffnungspfad setzt den Draft neu), soll aber nicht widersprechen.
    showInOverview: false,
    tags: [],
  });

  // Gruppen-Dialog: `{ mode: "create", kind }` oder `{ mode: "rename", kind, groupId }`
  const [groupDialog, setGroupDialog] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  // Tabelle je Gruppe — Grundlage für Zuordnung und Dialog-Filter
  const groupKindById = useMemo(() => {
    const map = new Map();
    for (const group of fixedCostGroups) map.set(group.id, fixedCostKind(group));
    return map;
  }, [fixedCostGroups]);

  // Gruppen je Tabelle, nach `order` sortiert. Die Reihenfolge bestimmt auch
  // die Bandfarbe — identisch zum Rückstellungs-View.
  const groupsByKind = useMemo(() => {
    const result = { expense: [], transfer: [] };
    for (const group of fixedCostGroups) result[fixedCostKind(group)].push(group);
    result.expense.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    result.transfer.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return result;
  }, [fixedCostGroups]);

  // Buchungen des laufenden Finanzmonats je Position — zugeordnet über
  // `recurringId`, wie im Rückstellungs-View.
  const bookedThisMonth = useMemo(() => {
    const map = new Map();
    const currentMonth = getFinancialMonth(todayISO(), monthStartDay)?.yyyymm;
    if (!currentMonth) return map;
    for (const e of entries || EMPTY_ARRAY) {
      if (!e.recurringId || (e.kind !== "expense" && e.kind !== "transfer")) continue;
      if (getFinancialMonth(e.date, monthStartDay)?.yyyymm !== currentMonth) continue;
      const key = bookingKey(e.kind, e.recurringId);
      const prev = map.get(key);
      map.set(key, {
        count: (prev?.count || 0) + 1,
        amount: (prev?.amount || 0) + Number(e.amount || 0),
        lastDate: !prev || String(e.date) > prev.lastDate ? String(e.date) : prev.lastDate,
      });
    }
    return map;
  }, [entries, monthStartDay]);

  // Zeilen je Tabelle + Kennzahlen der Gesamtzeile
  const { rowsByKind, fixedMonthly, freeMonthly, bookedCount } = useMemo(() => {
    const byKind = { expense: [], transfer: [] };
    let fixed = 0;
    let free = 0;
    let booked = 0;
    for (const item of recurringExpenses) {
      const kind = fixedCostKind(item);
      const bookedEntry = bookedThisMonth.get(bookingKey(kind, item.id)) ?? null;
      byKind[kind].push({ id: item.id, item, booked: bookedEntry });
      if (bookedEntry) booked += 1;
      // Basis ist die Monatsrate, nicht das Rohfeld: bei einer Rückstellung mit
      // Turnus ist `amount` der Zyklusbetrag.
      if (countsAsFixedCost(item)) fixed += monthlyRate(item);
      else free += monthlyRate(item);
    }
    return { rowsByKind: byKind, fixedMonthly: fixed, freeMonthly: free, bookedCount: booked };
  }, [recurringExpenses, bookedThisMonth]);

  const columnCtx = useMemo(
    () => ({
      fmt,
      categoryById: new Map(expenseCategories.map((c) => [c.id, c])),
      potNameById: new Map(pots.map((p) => [p.id, p.name])),
      groupNameById: new Map(fixedCostGroups.map((g) => [g.id, g.name])),
    }),
    [fmt, expenseCategories, pots, fixedCostGroups]
  );

  const columnsByKind = useMemo(
    () => ({
      expense: buildFixedCostColumns("expense", columnCtx),
      transfer: buildFixedCostColumns("transfer", columnCtx),
    }),
    [columnCtx]
  );

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

  // Sektions-Schlüssel einer Position: nur eine existierende Gruppe derselben
  // Art zählt — sonst „Ohne Gruppe".
  function sectionKeyOfItem(item) {
    const gid = item.groupId || null;
    return gid && groupKindById.get(gid) === fixedCostKind(item) ? gid : UNGROUPED_KEY;
  }

  function tableLabel(kind) {
    return TABLES.find((t) => t.kind === kind)?.title || "";
  }

  // Gruppen-CRUD
  function openCreateGroupDialog(kind) {
    setGroupNameDraft("");
    setGroupDialog({ mode: "create", kind });
  }

  function openRenameGroupDialog(group) {
    setGroupNameDraft(group.name || "");
    setGroupDialog({ mode: "rename", kind: fixedCostKind(group), groupId: group.id });
  }

  function saveGroup() {
    const name = (groupNameDraft || "").trim();
    if (!name || !groupDialog) return;
    if (groupDialog.mode === "rename") {
      const updated = fixedCostGroups.map((g) => (g.id === groupDialog.groupId ? { ...g, name } : g));
      onUpdateBook({ ...activeBook, fixedCostGroups: updated });
    } else {
      const maxOrder = fixedCostGroups.reduce((m, g) => Math.max(m, g.order ?? 0), 0);
      const newGroup = { id: generateId("fcg"), name, order: maxOrder + 1, kind: groupDialog.kind };
      onUpdateBook({ ...activeBook, fixedCostGroups: [...fixedCostGroups, newGroup] });
    }
    setGroupDialog(null);
    setGroupNameDraft("");
  }

  async function deleteGroup(group) {
    const itemCount = recurringExpenses.filter((r) => sectionKeyOfItem(r) === group.id).length;
    const ok = await confirm({
      title: "Gruppe löschen",
      message: itemCount > 0
        ? `Gruppe „${group.name}“ löschen? Die ${itemCount === 1 ? "enthaltene Position wird" : `${itemCount} enthaltenen Positionen werden`} nach „Ohne Gruppe“ verschoben.`
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
      turnus: null,
      faelligkeit: "",
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
      turnus: item.turnus ?? null,
      faelligkeit: item.faelligkeit || "",
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

  // Art wechseln: die Gruppe gehört fest zu einer Tabelle, die Position wandert
  // also nach „Ohne Gruppe" der anderen Tabelle. Turnus und Fälligkeit sind
  // Transfer-Felder und werden beim Wechsel auf „Ausgabe" zurückgesetzt — sonst
  // bliebe ein unsichtbarer Wert stehen, der die Speichern-Sperre auslöst.
  function handleKindChange(kind) {
    setDraft((d) => ({
      ...d,
      kind,
      groupId: null,
      turnus: kind === "transfer" ? d.turnus : null,
      faelligkeit: kind === "transfer" ? d.faelligkeit : "",
    }));
  }

  // Turnus wechseln. Fällt der Turnus weg, fällt auch die Fälligkeit weg —
  // sonst bliebe ein Datum am Draft stehen, das nichts mehr bedeutet und beim
  // nächsten Setzen eines Turnus als vermeintlich geprüfter Wert wieder auftaucht.
  function handleTurnusChange(value) {
    const turnus = Number(value) || null;
    setDraft((d) => ({ ...d, turnus, faelligkeit: turnus ? d.faelligkeit : "" }));
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
    // Dieselben Regeln wie in `canSave` — die Doppelung ist nicht redundant:
    // EditDialog löst `onSave` auch per Strg+Enter aus, am Button-Zustand vorbei.
    if (draft.kind === "transfer" && draft.turnus) {
      if (!draft.faelligkeit) return;
      if (monthlyRate({ kind: "transfer", amount: numericAmount, turnus: draft.turnus }) < 0.01) return;
    }

    // Absicherung gegen inkonsistente Zustände: eine Gruppe der anderen Tabelle
    // wird nie übernommen.
    const targetGroupId =
      draft.groupId && groupKindById.get(draft.groupId) === draft.kind ? draft.groupId : null;

    // Turnus und Fälligkeit gehören zusammen: ohne Turnus wird die Fälligkeit
    // nicht mitgeschrieben, damit die Zyklusrechnung nie auf ein verwaistes
    // Datum trifft. `normalizeBook()` erzwingt dieselbe Kopplung beim Laden.
    const isTransfer = draft.kind === "transfer";
    const nextTurnus = isTransfer ? (draft.turnus || null) : null;
    const nextFaelligkeit = nextTurnus ? (draft.faelligkeit || null) : null;

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
              turnus: isTransfer ? nextTurnus : undefined,
              faelligkeit: isTransfer ? nextFaelligkeit : undefined,
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
        newItem.turnus = nextTurnus;
        newItem.faelligkeit = nextFaelligkeit;
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
      // Gebucht wird die Monatsrate — bei einer Rückstellung also der anteilige
      // Betrag, nicht der Zyklusbetrag aus `item.amount`.
      amount: monthlyRate(item),
      category: kind === "transfer" ? item.transferCategory : undefined,
      categoryId: kind === "expense" ? (item.categoryId || null) : null,
      subcategoryId: kind === "expense" ? (item.subcategoryId || null) : null,
      kind,
      // Herkunftskennung: die Trend-Auswertung und der Status „Diesen Monat"
      // ordnen Buchungen darüber ihrer Fixkosten-Position zu. Die Notiz bleibt
      // die Anzeige-Beschriftung in der Eintragsliste — eine umbenannte
      // Position behält so ihre Historie.
      recurringId: item.id,
      note: item.name,
    };
    if (kind === "transfer") entry.potId = item.potId;
    if (kind === "expense") entry.source = "month";
    return entry;
  }

  // Eine in diesem Finanzmonat schon gebuchte Position lässt sich weiterhin
  // buchen (Nachzahlung, Korrektur) — aber nur nach Rückfrage, damit ein
  // zweiter Klick nicht unbemerkt doppelt bucht.
  async function bookNow(item) {
    const booked = bookedThisMonth.get(bookingKey(fixedCostKind(item), item.id));
    if (booked) {
      const last = formatDateDE(booked.lastDate);
      const ok = await confirm({
        title: "Bereits gebucht",
        message:
          (booked.count === 1
            ? `„${item.name}“ wurde in diesem Finanzmonat bereits am ${last} gebucht.`
            : `„${item.name}“ wurde in diesem Finanzmonat bereits ${booked.count}-mal gebucht, zuletzt am ${last}.`) +
          "\n\nWirklich noch einmal buchen?",
        confirmLabel: "Erneut buchen",
      });
      if (!ok) return;
    }
    onAddEntry(buildEntryFromItem(item, todayISO()));
    toast.success(`„${item.name}“ wurde gebucht.`);
  }

  // Sammelbuchung einer Gruppe, der Positionen ohne Gruppe oder einer ganzen
  // Tabelle ohne Gruppen. Alle Einträge gehen als EIN State-Update raus
  // (onAddEntries), damit bei wiederholten Aufrufen auf demselben Snapshot
  // nichts verloren geht.
  async function bookSection(label, items, isGroup) {
    if (!items || items.length === 0) return;
    const today = todayISO();
    const count = items.length;
    const scope = isGroup ? `der Gruppe „${label}“` : `aus „${label}“`;
    // Die Sammelbuchung bucht bewusst alle Positionen — der Hinweis verhindert
    // nur, dass eine schon gebuchte Position unbemerkt doppelt gebucht wird.
    const already = items.filter((item) =>
      bookedThisMonth.has(bookingKey(fixedCostKind(item), item.id))
    ).length;
    const alreadyNote = already === 0
      ? ""
      : already === 1
        ? "\n\n1 Position wurde in diesem Finanzmonat bereits gebucht und wird erneut gebucht."
        : `\n\n${already} Positionen wurden in diesem Finanzmonat bereits gebucht und werden erneut gebucht.`;
    const ok = await confirm({
      title: "Alle Positionen buchen",
      message:
        (count === 1
          ? `Wirklich 1 Position ${scope} buchen?`
          : `Wirklich alle ${count} Positionen ${scope} buchen?`) +
        `\n\nGebucht wird auf das heutige Datum (${formatDateDE(today)}).` +
        alreadyNote,
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

  // Bedeutungswechsel von `amount`: mit Turnus ist der Wert der Zyklusbetrag,
  // gebucht wird die daraus abgeleitete Monatsrate.
  const draftAmount = parseAmount(draft.amount);
  const draftAmountValid = Number.isFinite(draftAmount) && draftAmount > 0;
  const hasTurnus = draft.kind === "transfer" && !!draft.turnus;
  const draftMonthlyRate =
    hasTurnus && draftAmountValid
      ? monthlyRate({ kind: "transfer", amount: draftAmount, turnus: draft.turnus })
      : null;
  // Ein für sich gültiger Zyklusbetrag kann auf eine Rate von 0.00 herunterrunden
  // (0.05 auf zwölf Monate). „Buchen" erzeugte dann Einträge über 0.00.
  const rateTooSmall = draftMonthlyRate !== null && draftMonthlyRate < 0.01;
  // Ein Turnus ohne Fälligkeit ist ein Halbzustand — ohne Startanker lässt sich
  // kein Zyklus berechnen. Das `kind`-Gate steckt in `hasTurnus` und ist zwingend:
  // ohne es würde ein nach dem Artwechsel stehengebliebener Turnus das Speichern
  // einer Ausgabe blockieren, während die Turnus-Felder gar nicht sichtbar sind.
  const missingDueDate = hasTurnus && !draft.faelligkeit;

  // `editingItem` ist ein stabiler Vorher-Snapshot: gesetzt in `openEditDialog()`,
  // bis `closeDialog()` unverändert — kein zusätzlicher State nötig. Beim Anlegen
  // und Duplizieren ist er `null`, die Warnung erscheint dort korrekt nicht.
  const showTurnusSwitchWarning =
    !!editingItem && draft.kind === "transfer" && !editingItem.turnus && !!draft.turnus;

  const canSave =
    !!draft.name.trim() && draftAmountValid && !missingDueDate && !rateTooSmall;

  const dialogGroupOptions = useMemo(
    () => fixedCostGroups.filter((g) => fixedCostKind(g) === draft.kind),
    [fixedCostGroups, draft.kind]
  );

  // Aktionen am Zeilenende — DataTable blendet sie beim Überfahren ein.
  function renderRowActions(row) {
    const item = row.item;
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => bookNow(item)}>Buchen</Button>
        <button
          type="button"
          className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          onClick={() => openEditDialog(item)}
          title="Bearbeiten"
          aria-label={`„${item.name}“ bearbeiten`}
        >
          <IconEdit />
        </button>
        <OverflowMenu
          label={`Weitere Aktionen für „${item.name}“`}
          buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          items={[
            { label: "Duplizieren", onClick: () => openDuplicateDialog(item) },
            { label: "Löschen", danger: true, onClick: () => deleteItem(item) },
          ]}
        />
      </>
    );
  }

  // Eine Sektion = eine Gruppe oder „Ohne Gruppe". Summe, Sammelbuchung und
  // Gruppenverwaltung sitzen rechts im Band.
  function buildSection(kind, group, rows, accent) {
    const label = group ? group.name : "Ohne Gruppe";
    const items = rows.map((r) => r.item);
    const total = items.reduce((sum, item) => sum + monthlyRate(item), 0);
    const menuItems = [
      {
        label: "Position hinzufügen",
        onClick: () => openCreateDialog({ groupId: group?.id ?? null, kind, lockKind: true }),
      },
    ];
    if (group) {
      menuItems.push(
        { label: "Umbenennen", onClick: () => openRenameGroupDialog(group) },
        { label: "Gruppe löschen", danger: true, onClick: () => deleteGroup(group) }
      );
    }
    return {
      key: group ? group.id : UNGROUPED_KEY,
      label,
      accent,
      rows,
      total: fmt(total),
      totalColumnId: "monthlyRate",
      aside: (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bookSection(label, items, !!group)}
            disabled={items.length === 0}
          >
            {group ? "Gruppe buchen" : "Alle buchen"}
          </Button>
          <OverflowMenu
            label={group ? `Aktionen für Gruppe „${label}“` : "Aktionen für Positionen ohne Gruppe"}
            buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
            items={menuItems}
          />
        </>
      ),
    };
  }

  // Gliederung wie im Rückstellungs-View: Gruppen in ihrer `order`, „Ohne
  // Gruppe" ans Ende und ohne Farbe. Ohne jede Gruppe gibt es kein Band.
  // Anders als dort bleiben leere Gruppen sichtbar — hier werden sie verwaltet.
  function buildSections(kind) {
    const groups = groupsByKind[kind];
    const rows = rowsByKind[kind];
    if (groups.length === 0) {
      return [{ key: UNGROUPED_KEY, label: null, accent: null, rows }];
    }
    const byKey = new Map();
    for (const row of rows) {
      const key = sectionKeyOfItem(row.item);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    }
    const sections = groups.map((group, index) =>
      buildSection(
        kind,
        group,
        byKey.get(group.id) || EMPTY_ARRAY,
        GROUP_ACCENT_PALETTE[index % GROUP_ACCENT_PALETTE.length]
      )
    );
    const ungrouped = byKey.get(UNGROUPED_KEY);
    if (ungrouped?.length) sections.push(buildSection(kind, null, ungrouped, null));
    return sections;
  }

  function renderTableToolbar(table) {
    const items = rowsByKind[table.kind].map((r) => r.item);
    // Ohne Gruppen gibt es kein Band — die Sammelbuchung rückt dann hierher.
    const noBands = groupsByKind[table.kind].length === 0;
    return (
      <>
        <h2 className="hb-fixed-table-title">{table.title}</h2>
        {/* Buchungsstand im Kartenkopf: unabhängig von der Spaltenauswahl
            sichtbar und der erste Blickfang der Karte. */}
        {renderBookedStatus(rowsByKind[table.kind], { pill: true })}
        <div className="hb-fixed-table-actions">
          {noBands && items.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => bookSection(table.title, items, false)}>
              Alle buchen
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => openCreateGroupDialog(table.kind)}>
            <IconPlus /> Gruppe
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openCreateDialog({ kind: table.kind, lockKind: true })}
          >
            <IconPlus /> {table.addLabel}
          </Button>
        </div>
      </>
    );
  }

  const isEmpty = recurringExpenses.length === 0 && fixedCostGroups.length === 0;

  return (
    <div>
      {/* Gruppe anlegen/umbenennen — die Tabelle ergibt sich aus dem Aufrufer */}
      <EditDialog
        open={!!groupDialog}
        title={groupDialog?.mode === "rename" ? "Gruppe umbenennen" : "Neue Gruppe"}
        onClose={() => setGroupDialog(null)}
        onSave={saveGroup}
        canSave={!!groupNameDraft.trim()}
        saveLabel={groupDialog?.mode === "rename" ? "Speichern" : "Anlegen"}
      >
        <div className="hb-field">
          <div className="hb-label">Gruppenname</div>
          <input
            className="hb-input"
            style={{ width: "100%", minWidth: 0 }}
            type="text"
            autoFocus
            placeholder={groupDialog?.kind === "transfer" ? "z.B. Steuern, Versicherungen" : "z.B. Wohnen, Abos"}
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && groupNameDraft.trim()) saveGroup(); }}
          />
          {groupDialog?.mode === "create" && (
            <div className="hb-fixed-field-hint">
              Wird in der Tabelle „{tableLabel(groupDialog.kind)}“ angelegt.
            </div>
          )}
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
        <div className="hb-fixed-tables">
          {TABLES.map((table) => {
            const hasContent =
              rowsByKind[table.kind].length > 0 || groupsByKind[table.kind].length > 0;
            return (
              <Card key={table.kind}>
                <CardContent>
                  {hasContent ? (
                    <DataTable
                      columns={columnsByKind[table.kind]}
                      sections={buildSections(table.kind)}
                      storageKey={`fixed-${table.kind}`}
                      label={table.title}
                      toolbar={renderTableToolbar(table)}
                      renderRowActions={renderRowActions}
                      bounded={false}
                    />
                  ) : (
                    <>
                      <div className="hb-dt-toolbar">
                        <div className="hb-dt-toolbar-start">{renderTableToolbar(table)}</div>
                      </div>
                      <div className="hb-empty hb-empty--sm">
                        <div className="hb-empty-icon"><IconFixed /></div>
                        <div className="hb-empty-text">{table.emptyText}</div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Gesamtzeile unter beiden Tabellen. Sie liest sich als Abschluss der
              beiden Summenzeilen darüber — und sagt dazu, warum sie kleiner ist
              als deren Summe: freie Rücklagen stehen in der Transfer-Tabelle,
              zählen nach der Kostenregel aber nicht als Fixkosten. */}
          {/* Bewusst ohne CardContent: dessen 20 px Innenabstand machten aus der
              schmalen Abschlusszeile eine weitere volle Karte. */}
          {recurringExpenses.length > 0 && (
            <Card>
              <div className="hb-fixed-total">
                <div className="hb-fixed-total-row">
                  <span className="hb-fixed-total-label">Fixkosten pro Monat</span>
                  <span className="hb-fixed-total-value">{fmt(fixedMonthly)}</span>
                </div>
                <div className="hb-fixed-total-meta">
                  <HbTooltip
                    inline
                    text="Ausgaben und Rückstellungen mit Turnus, umgerechnet auf den Monat. Rücklagen ohne Turnus sind freies Sparen und zählen nicht zu den Fixkosten."
                  >
                    {freeMonthly > 0 && (
                      <>
                        Ohne {fmt(freeMonthly)} freie Rücklagen aus der Tabelle „Rücklagen &amp;
                        Rückstellungen“
                        <span aria-hidden="true"> · </span>
                      </>
                    )}
                    {bookedCount} von {recurringExpenses.length} diesen Monat gebucht
                  </HbTooltip>
                </div>
              </div>
            </Card>
          )}
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
        // Ohne das klemmt `.hb-modal-body` das Kalender-Popover des
        // HbDatePickers ab und zeigt stattdessen eine Scrollbar.
        bodyScroll={false}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          {/* Betragszeile, Warnung und Ratenhinweis lesen als eine Gruppe — der
              engere Abstand hält sie vom 14er-Raster der übrigen Abschnitte ab. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, width: "100%" }}>
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
                {/* Kurz genug, dass das Label einzeilig bleibt — ein Umbruch würde
                    das Feld aus der Flucht mit dem Namensfeld schieben. */}
                <div className="hb-label">
                  {hasTurnus ? `Betrag pro Zyklus (${baseCurrency})` : `Betrag (${baseCurrency})`}
                </div>
                <input
                  className="hb-input"
                  style={{ width: "100%", minWidth: 0 }}
                  type="text"
                  inputMode="decimal"
                  placeholder={hasTurnus ? "z.B. 1200.00" : "z.B. 12.90"}
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                />
              </div>
            </div>

            {showTurnusSwitchWarning && (
              <div className="hb-infobar hb-infobar--dialog hb-infobar--warning" role="status">
                <div className="hb-infobar-icon"><IconWarning /></div>
                <div className="hb-infobar-content">
                  <div className="hb-infobar-message">
                    Bisher war <strong>{fmt(editingItem.amount)}</strong> der Betrag pro
                    Buchung. Mit dem Turnus wird daraus der Betrag für den ganzen Zyklus —
                    prüf den Wert, er wird nicht automatisch umgerechnet.
                  </div>
                </div>
              </div>
            )}

            {rateTooSmall ? (
              <div className="hb-fixed-field-error">
                Der Betrag ergibt weniger als {fmt(0.01)} pro Monat — bei diesem Turnus
                gäbe es nichts zu buchen. Erhöhe den Zyklusbetrag oder verkürze den Turnus.
              </div>
            ) : draftMonthlyRate !== null ? (
              <div className="hb-fixed-field-hint">
                Ergibt <strong>{fmt(draftMonthlyRate)}</strong> pro Monat — genau dieser
                Betrag wird beim monatlichen Buchen in den Topf gelegt.
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
            <div className="hb-field">
              <div className="hb-label">Art</div>
              <select
                className="hb-input"
                value={draft.kind}
                disabled={kindLocked}
                onChange={(e) => handleKindChange(e.target.value)}
              >
                <option value="expense">Ausgabe</option>
                <option value="transfer">Transfer</option>
              </select>
              {kindLocked && (
                <div className="hb-fixed-field-hint">
                  Durch die Tabelle „{tableLabel(draft.kind)}“ vorgegeben.
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
                <option value="">Ohne Gruppe</option>
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
                    <IconClose width={12} height={12} strokeWidth={2.2} />
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
              {/* Zweck und Topf sagen wohin, Turnus und Fälligkeit wann und wie oft. */}
              <div className="hb-two hb-two--dialog" style={{ width: "100%" }}>
                <div className="hb-field">
                  <div className="hb-label">Turnus</div>
                  <select
                    className="hb-input"
                    value={draft.turnus ?? ""}
                    onChange={(e) => handleTurnusChange(e.target.value)}
                  >
                    {turnusOptionsFor(draft.turnus).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <div className="hb-fixed-field-hint">
                    Mit einem Turnus wird die Position als Rückstellung geführt: Der Betrag
                    gilt für den ganzen Zyklus, gebucht wird monatlich der anteilige Betrag.
                    Ohne Turnus ist es eine Rücklage — freies Sparen ohne festen Termin.
                  </div>
                </div>
                <div className="hb-field">
                  <div className="hb-label">Nächste Fälligkeit</div>
                  {/* Ohne Turnus hat das Datum keine Funktion — deaktiviert statt
                      stumm ignoriert. Der erklärende Text steht im Hint, nicht im
                      Platzhalter: der wird bei `disabled` zu blass zum Lesen. */}
                  <HbDatePicker
                    clearable
                    disabled={!draft.turnus}
                    value={draft.faelligkeit}
                    onChange={(v) => setDraft((d) => ({ ...d, faelligkeit: v }))}
                  />
                  <div className="hb-fixed-field-hint">
                    {draft.turnus
                      ? "Wann die Rechnung das nächste Mal fällig wird — nicht die letzte Zahlung. Das Datum gibt den dauerhaften Rhythmus vor: Der Termin wiederholt sich im Turnus, auch wenn eine Rechnung einmal verspätet kommt."
                      : "Wird erst mit einem Turnus benötigt."}
                  </div>
                  {!!draft.turnus && !draft.faelligkeit && (
                    <div className="hb-fixed-field-error">
                      Zu einem Turnus gehört eine nächste Fälligkeit — daraus ergibt sich
                      der Rhythmus der Zyklen.
                    </div>
                  )}
                </div>
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
