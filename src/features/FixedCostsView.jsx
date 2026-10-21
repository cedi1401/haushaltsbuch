import React, { useMemo, useState } from "react";
import { Card, CardContent, Button } from "../components/ui.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import EditDialog from "../components/EditDialog.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import DataTable from "../components/DataTable.jsx";
import { HierarchicalCategoryPicker } from "../components/HierarchicalCategoryPicker.jsx";
import TagInputField from "../components/TagInputField.jsx";
import TrendToggle from "../components/TrendToggle.jsx";
import { generateId } from "../utils/idUtils.js";
import {
  formatDateDE,
  parseAmount,
  todayISO,
} from "../utils/formatUtils.js";
import { DEFAULT_EXPENSE_CATEGORIES } from "../utils/bookDefaults.js";
import { fixedCostKind } from "../utils/hbUtils.js";
import { clearPurposeRate, getRatedPurposes, purposeToFixedItem } from "../utils/transferCategoryUtils.js";
import { isSinkingFund, monthlyRate } from "../utils/fixedCostUtils.js";
import { getFinancialMonth } from "../utils/financialMonthUtils.js";
import { GROUP_ACCENT_PALETTE } from "../utils/hbPalette.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useUndo } from "../contexts/UndoContext.js";
import { IconEdit, IconFixed, IconPlus } from "../components/icons.jsx";
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
    title: "Sparraten",
    addLabel: "Sparposition",
    emptyText:
      "Noch keine Sparraten — z.B. eine Rückstellung für die Jahresrechnung oder eine "
      + "monatliche Rate für eine freie Rücklage. Sparpositionen mit Rate erscheinen hier.",
  },
];

// Sektions-Schlüssel für Positionen ohne (gültige) Gruppe. Jede Tabelle hat
// ihre eigenen Sektionen, ein gemeinsamer Schlüssel ist daher eindeutig.
const UNGROUPED_KEY = "ungrouped";

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

// Die Position einer Buchung: Ausgaben über `recurringId`, Transfers über den
// Zweck — seit Schema 7 ist der Zweck die Position.
function entryPositionId(e) {
  if (e.kind === "transfer") return e.transferCategoryId || null;
  if (e.kind === "expense") return e.recurringId || null;
  return null;
}

export default function FixedCostsView({
  activeBook,
  entries,
  monthStartDay = 1,
  onUpdateBook,
  onAddEntry,
  onAddEntries,
  onOpenSavingsPosition,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  // Seit Schema 7 stehen hier nur Ausgaben; die Transfer-Positionen sind die
  // Zwecke mit Rate (transferCategoryUtils.purposeToFixedItem).
  const recurringExpenses = activeBook?.recurringExpenses || EMPTY_ARRAY;
  const fixedCostGroups = activeBook?.fixedCostGroups || EMPTY_ARRAY;
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const allTransferCategories = activeBook?.transferCategories || EMPTY_ARRAY;
  const allItems = useMemo(
    () => [...recurringExpenses, ...getRatedPurposes(allTransferCategories).map(purposeToFixedItem)],
    [recurringExpenses, allTransferCategories]
  );
  const { confirm } = useConfirm();
  const undo = useUndo();

  // Dialog-State — nur für Ausgaben. Sparraten werden in den Rücklagen
  // angelegt und bearbeitet (onOpenSavingsPosition).
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  // Beim Duplizieren: id des Originals, damit die Kopie direkt dahinter landet
  const [duplicateSourceId, setDuplicateSourceId] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    amount: "",
    categoryId: null,
    subcategoryId: null,
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
  // die Bandfarbe.
  const groupsByKind = useMemo(() => {
    const result = { expense: [], transfer: [] };
    for (const group of fixedCostGroups) result[fixedCostKind(group)].push(group);
    result.expense.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    result.transfer.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return result;
  }, [fixedCostGroups]);

  // Buchungen des laufenden Finanzmonats je Position — zugeordnet über
  // entryPositionId().
  const bookedThisMonth = useMemo(() => {
    const map = new Map();
    const currentMonth = getFinancialMonth(todayISO(), monthStartDay)?.yyyymm;
    if (!currentMonth) return map;
    for (const e of entries || EMPTY_ARRAY) {
      const positionId = entryPositionId(e);
      if (!positionId) continue;
      if (getFinancialMonth(e.date, monthStartDay)?.yyyymm !== currentMonth) continue;
      const key = bookingKey(e.kind, positionId);
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
    for (const item of allItems) {
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
  }, [allItems, bookedThisMonth]);

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
    allItems.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [allItems]);

  // Sektions-Schlüssel einer Position: nur eine existierende Gruppe derselben
  // Art zählt — sonst „Sonstige".
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
    const itemCount = allItems.filter((r) => sectionKeyOfItem(r) === group.id).length;
    const ok = await confirm({
      title: "Gruppe löschen",
      message: itemCount > 0
        ? `Gruppe „${group.name}“ löschen? Die ${itemCount === 1 ? "enthaltene Position wird" : `${itemCount} enthaltenen Positionen werden`} nach „Sonstige“ verschoben.`
        : `Gruppe „${group.name}“ wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const updatedItems = recurringExpenses.map((r) =>
      r.groupId === group.id ? { ...r, groupId: null } : r
    );
    const updatedPurposes = allTransferCategories.map((c) =>
      c.groupId === group.id ? { ...c, groupId: null } : c
    );
    const updatedGroups = fixedCostGroups.filter((g) => g.id !== group.id);
    onUpdateBook({
      ...activeBook,
      recurringExpenses: updatedItems,
      transferCategories: updatedPurposes,
      fixedCostGroups: updatedGroups,
    });
    undo.offer("Gruppe gelöscht.");
  }

  // Dialog (nur Ausgaben)
  function openCreateDialog({ groupId = null } = {}) {
    setEditingItem(null);
    setDuplicateSourceId(null);
    setDraft({
      name: "",
      amount: "",
      categoryId: null,
      subcategoryId: null,
      groupId,
      showInOverview: false,
      tags: [],
    });
    setDialogOpen(true);
  }

  // Eine Sparrate ist eine Sparposition: Bearbeitet wird sie in den Rücklagen,
  // im selben Dialog wie dort. Nach dem Schließen geht es zurück hierher.
  function openEditDialog(item) {
    if (fixedCostKind(item) === "transfer") {
      onOpenSavingsPosition?.({ purposeId: item.id, returnTo: "fixed" });
      return;
    }
    setEditingItem(item);
    setDuplicateSourceId(null);
    setDraft(draftFromItem(item));
    setDialogOpen(true);
  }

  // Kopie: bewusst der Edit-Draft als Basis (nicht openCreateDialog), damit
  // showInOverview, Gruppe und Tags vom Original übernommen werden.
  function openDuplicateDialog(item) {
    setEditingItem(null);
    setDuplicateSourceId(item.id);
    setDraft({ ...draftFromItem(item), name: makeCopyName(item.name || "") });
    setDialogOpen(true);
  }

  function draftFromItem(item) {
    return {
      name: item.name || "",
      amount: String(item.amount || ""),
      categoryId: item.categoryId || null,
      subcategoryId: item.subcategoryId || null,
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
  }

  function saveItem() {
    if (!activeBook) return;
    // Dieselben Regeln wie in `canSave` — die Doppelung ist nicht redundant:
    // EditDialog löst `onSave` auch per Strg+Enter aus, am Button-Zustand vorbei.
    const numericAmount = parseAmount(draft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!draft.name.trim()) return;

    // Absicherung gegen inkonsistente Zustände: eine Gruppe der Sparraten wird
    // nie übernommen.
    const targetGroupId =
      draft.groupId && groupKindById.get(draft.groupId) === "expense" ? draft.groupId : null;
    const fields = {
      name: draft.name.trim(),
      amount: numericAmount,
      kind: "expense",
      categoryId: draft.categoryId,
      subcategoryId: draft.subcategoryId || null,
      groupId: targetGroupId,
      showInOverview: draft.showInOverview === true,
      tags: draft.tags || [],
    };

    if (editingItem) {
      const updatedItems = recurringExpenses.map((item) =>
        item.id === editingItem.id ? { ...item, ...fields } : item
      );
      onUpdateBook({ ...activeBook, recurringExpenses: updatedItems });
    } else {
      const newItem = { id: generateId("rec"), ...fields };
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

  async function deleteExpense(item) {
    if (!activeBook) return;
    const ok = await confirm({
      title: "Fixkosten löschen",
      message: `Fixkosten „${item.name}“ wirklich löschen?`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    onUpdateBook({ ...activeBook, recurringExpenses: recurringExpenses.filter((i) => i.id !== item.id) });
    undo.offer("Fixkosten gelöscht.");
  }

  // Eine Sparrate verliert beim Entfernen nur ihre Rate: Die Sparposition
  // bleibt mit ihren Buchungen in den Rücklagen (clearPurposeRate).
  async function removeSavingsRate(item) {
    if (!activeBook) return;
    const isReserve = isSinkingFund(item);
    // Rückstellungen zählen nie als Sparen, freie Rücklagen in einem Spar-Topf
    // schon — der Hinweis nur dann, wenn sich die Sparquote dadurch ändert.
    const inSavingsPot = pots.some((p) => p.id === item.potId && p.isSavings);
    const ok = await confirm({
      title: "Sparrate entfernen",
      message:
        `Sparrate „${item.name}“ wirklich entfernen?\n\n` +
        "Die Position verschwindet aus den Fixkosten, bleibt aber mit ihren Buchungen in den Rücklagen." +
        (isReserve
          ? " Als Rückstellung braucht sie Betrag und Turnus. Ohne Rate wird sie dort als freie Rücklage weitergeführt." +
            (inSavingsPot ? "\n\nDa sie in einem Spar-Topf liegt, zählen ihre Buchungen danach als Sparen." : "")
          : ""),
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    onUpdateBook({
      ...activeBook,
      transferCategories: allTransferCategories.map((c) => (c.id === item.id ? clearPurposeRate(c) : c)),
    });
    undo.offer("Sparrate entfernt.");
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
      transferCategoryId: kind === "transfer" ? item.id : undefined,
      categoryId: kind === "expense" ? (item.categoryId || null) : null,
      subcategoryId: kind === "expense" ? (item.subcategoryId || null) : null,
      kind,
      // Die Notiz bleibt die Anzeige-Beschriftung in der Eintragsliste.
      note: item.name,
    };
    // Herkunftskennung: Trend und Status „Diesen Monat" ordnen Buchungen
    // darüber ihrer Position zu — Ausgaben über `recurringId`, Transfers über
    // den Zweck (er ist die Position). Eine umbenannte Position behält so ihre
    // Historie.
    if (kind === "transfer") entry.potId = item.potId;
    if (kind === "expense") {
      entry.source = "month";
      entry.recurringId = item.id;
    }
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
    undo.offer(`„${item.name}“ wurde gebucht.`);
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
    undo.offer(
      `${count} ${count === 1 ? "Position" : "Positionen"} aus „${label}“ gebucht.`
    );
  }

  const draftAmount = parseAmount(draft.amount);
  const canSave = !!draft.name.trim() && Number.isFinite(draftAmount) && draftAmount > 0;

  const dialogGroupOptions = groupsByKind.expense;

  // Aktionen am Zeilenende — DataTable blendet sie beim Überfahren ein.
  function renderRowActions(row) {
    const item = row.item;
    const isTransfer = fixedCostKind(item) === "transfer";
    const menuItems = isTransfer
      ? [
          {
            label: "Duplizieren",
            onClick: () => onOpenSavingsPosition?.({ duplicateOf: item.id, returnTo: "fixed" }),
          },
          { label: "Sparrate entfernen", danger: true, onClick: () => removeSavingsRate(item) },
        ]
      : [
          { label: "Duplizieren", onClick: () => openDuplicateDialog(item) },
          { label: "Löschen", danger: true, onClick: () => deleteExpense(item) },
        ];
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => bookNow(item)}>Buchen</Button>
        <button
          type="button"
          className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          onClick={() => openEditDialog(item)}
          title={isTransfer ? "In den Rücklagen bearbeiten" : "Bearbeiten"}
          aria-label={
            isTransfer ? `„${item.name}“ in den Rücklagen bearbeiten` : `„${item.name}“ bearbeiten`
          }
        >
          <IconEdit />
        </button>
        <OverflowMenu
          label={`Weitere Aktionen für „${item.name}“`}
          buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          items={menuItems}
        />
      </>
    );
  }

  // Eine Sektion = eine Gruppe oder „Sonstige" (Positionen ohne Gruppe). Die
  // Sammelbuchung behandelt beide gleich. Summe, Sammelbuchung und
  // Gruppenverwaltung sitzen rechts im Band.
  function buildSection(kind, group, rows, accent) {
    const label = group ? group.name : "Sonstige";
    const items = rows.map((r) => r.item);
    const total = items.reduce((sum, item) => sum + monthlyRate(item), 0);
    const menuItems = [
      kind === "transfer"
        ? {
            label: "Sparposition hinzufügen",
            onClick: () => onOpenSavingsPosition?.({ groupId: group?.id ?? null, returnTo: "fixed" }),
          }
        : {
            label: "Position hinzufügen",
            onClick: () => openCreateDialog({ groupId: group?.id ?? null }),
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
            onClick={() => bookSection(label, items, true)}
            disabled={items.length === 0}
          >
            Gruppe buchen
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

  // Gliederung: Gruppen in ihrer `order`, „Ohne
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
            onClick={() =>
              table.kind === "transfer" ? onOpenSavingsPosition?.({ returnTo: "fixed" }) : openCreateDialog()
            }
          >
            <IconPlus /> {table.addLabel}
          </Button>
        </div>
      </>
    );
  }

  const isEmpty = allItems.length === 0 && fixedCostGroups.length === 0;

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
            <div className="hb-field-hint">
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
                      // Sparraten mit neuem Schlüssel: der Katalog hat seit 7c3 die
                      // Spalte Art statt Zweck.
                      storageKey={table.kind === "transfer" ? "fixed-savings" : "fixed-expense"}
                      label={table.title}
                      toolbar={renderTableToolbar(table)}
                      renderRowActions={renderRowActions}
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
          {allItems.length > 0 && (
            <Card>
              <div className="hb-fixed-total">
                <div className="hb-fixed-total-row">
                  <span className="hb-fixed-total-label">Fixkosten pro Monat</span>
                  <span className="hb-fixed-total-value">{fmt(fixedMonthly)}</span>
                </div>
                <div className="hb-fixed-total-meta">
                  <HbTooltip
                    inline
                    text="Ausgaben und Rückstellungen, umgerechnet auf den Monat. Die Raten für freie Rücklagen und Sparziele zählen nicht zu den Fixkosten."
                  >
                    {freeMonthly > 0 && (
                      <>
                        Ohne {fmt(freeMonthly)} Sparraten für freie Rücklagen und Sparziele
                        <span aria-hidden="true"> · </span>
                      </>
                    )}
                    {bookedCount} von {allItems.length} diesen Monat gebucht
                  </HbTooltip>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Dialog: Fixkosten (Ausgaben) erstellen/bearbeiten */}
      <EditDialog
        open={dialogOpen}
        title={editingItem ? "Fixkosten bearbeiten" : duplicateSourceId ? "Fixkosten duplizieren" : "Neue Fixkosten"}
        onClose={closeDialog}
        onSave={saveItem}
        canSave={canSave}
        saveLabel={editingItem ? "Speichern" : duplicateSourceId ? "Duplizieren" : "Erstellen"}
        size="medium"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
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

          <HierarchicalCategoryPicker
            label="Kategorie"
            value={{ categoryId: draft.categoryId, subcategoryId: draft.subcategoryId }}
            categories={expenseCategories}
            onChange={({ categoryId, subcategoryId }) =>
              setDraft((d) => ({ ...d, categoryId, subcategoryId }))
            }
          />

          <div className="hb-field">
            <div className="hb-label">Gruppe</div>
            <select
              className="hb-input"
              value={draft.groupId || ""}
              onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value || null }))}
            >
              <option value="">Sonstige</option>
              {dialogGroupOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <TagInputField
            tags={draft.tags}
            onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
            knownTags={allBookTags}
          />

          <TrendToggle
            checked={draft.showInOverview}
            onChange={(showInOverview) => setDraft((d) => ({ ...d, showInOverview }))}
            subject="Die Position"
          />
        </div>
      </EditDialog>
    </div>
  );
}
