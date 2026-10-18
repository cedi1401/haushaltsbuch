import React, { useCallback, useMemo, useRef, useState } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { Card, CardContent, Button } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { IconSavings, IconPlus, IconEdit } from "../components/icons.jsx";
import { todayISO } from "../utils/formatUtils.js";
import { generateId } from "../utils/idUtils.js";
import { buildCatchUpRates } from "../utils/fixedCostUtils.js";
import { buildSavingsModel, isVisibleRemainder } from "../utils/savingsUtils.js";
import {
  addTransferCategory,
  applySavingsFields,
  deleteTransferCategory,
  findTransferCategory,
  NO_PURPOSE_LABEL,
} from "../utils/transferCategoryUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { useUndo } from "../contexts/UndoContext.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { buildSavingsColumns, RULE_LABEL } from "./savings/savingsColumns.jsx";
import ReserveDetail from "./savings/ReserveDetail.jsx";
import GoalCards from "./savings/GoalCards.jsx";
import GoalArchive from "./savings/GoalArchive.jsx";
import SavingsPositionDialog from "./savings/SavingsPositionDialog.jsx";
import BillPaidDialog from "./savings/BillPaidDialog.jsx";
import BacklogCatchUpDialog from "./savings/BacklogCatchUpDialog.jsx";

/**
 * Rücklagen-View — wofür liegt das Geld in den Töpfen (F2, Konzept C).
 *
 * Ersetzt die früheren Views Rückstellungen und Sparziele. Rückstellungen und
 * freie Rücklagen sind Zeilen in ihrem Topf; der Topf ist das Band mit seinem
 * Stand. Aktive Sparziele stehen als Karten darunter, damit Wünsche und
 * Vorsorge für Rechnungen nicht vermischt lesen. Unter den Zeilen eines Topfs
 * steht die Überleitung: seine Sparziele und was keiner aktiven Sparposition
 * gehört. Damit ergeben die Zeilen eines Topfs immer genau seinen Stand.
 *
 * Rollenteilung zur Fixkosten-View: hier wird angelegt, bewertet und der
 * Zyklus abgeschlossen; dort wird monatlich gebucht. „Bearbeiten" und
 * „+ Sparposition" in den Fixkosten springen hierher und öffnen den Dialog
 * (`initialIntent`, siehe `dialogFromIntent`).
 */

/**
 * Dialog-Zustand zum Sprung aus den Fixkosten oder dem Buchungsdialog:
 * `{ purposeId }` bearbeitet eine Sparposition, sonst wird eine neue angelegt
 * (optional in `potId` und `groupId`). Mit `returnTo` geht es nach dem
 * Schließen dorthin zurück; `onReturn` erfährt dabei die gespeicherte
 * Sparposition (`{ id, potId }`, bei Abbrechen `null`). Ein unbekannter Zweck
 * (inzwischen gelöscht) öffnet nichts.
 */
function dialogFromIntent(intent, transferCategories, pots) {
  if (!intent) return null;
  if (intent.purposeId) {
    const purpose = findTransferCategory(transferCategories, intent.purposeId);
    return purpose && !purpose.deleted
      ? { key: 1, purpose, returnTo: intent.returnTo, onReturn: intent.onReturn }
      : null;
  }
  if (pots.length === 0) return null;
  return {
    key: 1,
    purpose: null,
    defaultPotId: pots.some((p) => p.id === intent.potId) ? intent.potId : pots[0].id,
    defaultGroupId: intent.groupId || null,
    returnTo: intent.returnTo,
    onReturn: intent.onReturn,
  };
}

export default function SavingsView({
  activeBook,
  entries,
  monthStartDay = 1,
  onUpdateBook,
  onAddEntry,
  onAddEntries,
  onNavigateToPots,
  initialIntent = null,
  onNavigate,
}) {
  const fmt = useFmt();
  const undo = useUndo();
  const { confirm } = useConfirm();
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const fixedCostGroups = activeBook?.fixedCostGroups || EMPTY_ARRAY;
  const transferCategories = activeBook?.transferCategories || EMPTY_ARRAY;

  const model = useMemo(
    () => buildSavingsModel(activeBook, entries, { monthStartDay }),
    [activeBook, entries, monthStartDay]
  );

  const potById = useMemo(() => new Map(pots.map((p) => [p.id, p])), [pots]);
  const potNameById = useMemo(() => new Map(pots.map((p) => [p.id, p.name])), [pots]);
  const columns = useMemo(
    () =>
      buildSavingsColumns({
        fmt,
        groupNameById: new Map(fixedCostGroups.map((g) => [g.id, g.name])),
      }),
    [fmt, fixedCostGroups]
  );

  // ── Dialog Sparposition ────────────────────────────────────────────────
  // `key` zählt hoch, damit der Dialog bei jeder Öffnung frisch startet. Die
  // View wird bei jedem Wechsel neu gemountet; ein Sprung aus den Fixkosten
  // öffnet den Dialog deshalb direkt im Anfangszustand, ohne Effekt.
  const [dialog, setDialog] = useState(() => dialogFromIntent(initialIntent, transferCategories, pots));
  const dialogKey = useRef(1);
  const openDialog = useCallback((opts) => {
    dialogKey.current += 1;
    setDialog({ key: dialogKey.current, ...opts });
  }, []);
  const openCreate = useCallback(
    (potId, rule) => openDialog({ purpose: null, defaultPotId: potId || pots[0]?.id, defaultRule: rule }),
    [openDialog, pots]
  );
  const openEdit = useCallback((row) => openDialog({ purpose: row.purpose }), [openDialog]);

  // Vorschläge im Tag-Feld: die Tags der Fixkosten und aller Sparpositionen.
  const recurringExpenses = activeBook?.recurringExpenses || EMPTY_ARRAY;
  const knownTags = useMemo(() => {
    const set = new Set();
    for (const item of [...recurringExpenses, ...transferCategories]) {
      if (!item.deleted) (item.tags || []).forEach((t) => set.add(t));
    }
    return [...set].sort();
  }, [recurringExpenses, transferCategories]);

  // Schließt den Dialog; kam er per Sprung (Fixkosten, Buchungsdialog), geht
  // es dorthin zurück. `saved` ist die gespeicherte Sparposition, sonst null.
  function closeDialog(saved = null) {
    const { returnTo, onReturn } = dialog || {};
    setDialog(null);
    onReturn?.(saved);
    if (returnTo) onNavigate?.(returnTo);
  }

  function saveTransferCategories(next) {
    onUpdateBook({ ...activeBook, transferCategories: next });
  }

  function savePosition(fields) {
    const target = dialog?.purpose;
    let savedId = target?.id;
    if (target) {
      saveTransferCategories(
        transferCategories.map((c) => (c.id === target.id ? applySavingsFields(c, fields, todayISO()) : c))
      );
      undo.offer(`Sparposition „${fields.name}“ gespeichert.`);
    } else {
      // Ein gelöschter Zweck gleichen Namens im selben Topf lebt dabei mit
      // seinen Buchungen wieder auf (addTransferCategory).
      const { list, category } = addTransferCategory(transferCategories, fields.name, fields.potId);
      savedId = category.id;
      saveTransferCategories(
        list.map((c) => (c.id === category.id ? applySavingsFields(c, fields, todayISO()) : c))
      );
      undo.offer(`${RULE_LABEL[fields.rule]} „${fields.name}“ angelegt.`);
    }
    closeDialog({ id: savedId, potId: fields.potId });
  }

  // „Bestehende verwenden": derselbe Dialog, jetzt als Bearbeiten der
  // gefundenen Rücklage — mit den bisher eingegebenen Werten. Ihre Tags bleiben
  // und werden um die eingegebenen ergänzt.
  function adoptExisting(purpose, draft) {
    const tags = [...new Set([...(purpose.tags || []), ...draft.tags])];
    openDialog({
      purpose,
      initialDraft: { ...draft, name: purpose.name, potId: purpose.potId, tags },
      returnTo: dialog?.returnTo,
      onReturn: dialog?.onReturn,
    });
  }

  async function deletePosition(purpose) {
    const ok = await confirm({
      title: "Sparposition löschen",
      message:
        `Sparposition „${purpose.name}“ wirklich löschen?\n\n` +
        `Das Geld bleibt im Topf und zählt hier unter „${NO_PURPOSE_LABEL}“. ` +
        "Bestehende Buchungen behalten ihren Namen.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    saveTransferCategories(deleteTransferCategory(transferCategories, purpose.id));
    undo.offer("Sparposition gelöscht.");
  }

  function patchPurpose(id, patch) {
    saveTransferCategories(transferCategories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function completeGoal(row) {
    patchPurpose(row.id, { completedAt: todayISO(), completedAmount: row.goalProgress.current });
    undo.offer(`Sparziel „${row.purpose.name}“ abgeschlossen.`);
  }

  async function completeGoalEarly(row) {
    const ok = await confirm({
      title: "Ziel vorzeitig abschließen",
      message:
        `„${row.purpose.name}“ hat ${fmt(row.goalProgress.current)} von ${fmt(row.goalProgress.target)} erreicht.\n\n` +
        "Trotzdem abschließen? Das Ziel wandert ins Archiv, das Geld bleibt im Topf.",
      confirmLabel: "Abschließen",
    });
    if (ok) completeGoal(row);
  }

  function reactivateGoal(goal) {
    patchPurpose(goal.id, { completedAt: null, completedAmount: null });
    undo.offer(`Sparziel „${goal.name}“ wieder aktiviert.`);
  }

  // ── Rechnung bezahlt / Rückstand ausgleichen ──────────────────────────
  // „Rückstand ausgleichen" ist eine Einstiegshilfe und genau einmal je
  // Position verfügbar: sobald eine Einzahlung gebucht ist, gibt es nichts mehr
  // nachzuholen, was nicht auch von Hand gebucht werden könnte. Nur
  // Einzahlungen zählen — eine Entnahme aus „Rechnung bezahlt" verbraucht die
  // Verfügbarkeit nicht.
  const bookedPurposeIds = useMemo(() => {
    const set = new Set();
    for (const e of entries || []) {
      if (e.transferCategoryId && e.kind === "transfer") set.add(e.transferCategoryId);
    }
    return set;
  }, [entries]);
  const canCatchUp = useCallback(
    (row) => row.isSinkingFund && row.elapsed > 0 && !bookedPurposeIds.has(row.id),
    [bookedPurposeIds]
  );

  // Beide Aktionen schreiben genau einmal. `EditDialog` löst `onSave` auch per
  // Strg+Enter aus und `canSave` bleibt bis zum Unmount wahr — eine zweite
  // Auslösung erzeugte doppelte Einträge. Der Riegel steht deshalb hier.
  const writingRef = useRef(false);
  const [billTarget, setBillTarget] = useState(null);
  const [billDraft, setBillDraft] = useState(null);
  const [catchUpTarget, setCatchUpTarget] = useState(null);

  const openBillPaid = useCallback((row) => {
    writingRef.current = false;
    setBillTarget(row);
    // Vorbelegt ist die Rechnung, nicht die Monatsrate; die Notiz trägt den
    // Namen, sonst stünde die Zahlung in der Buchungsliste als „—".
    setBillDraft({
      date: todayISO(),
      amount: String(row.item?.amount ?? ""),
      note: String(row.item?.name ?? ""),
    });
  }, []);

  const openCatchUp = useCallback((row) => {
    writingRef.current = false;
    setCatchUpTarget(row);
  }, []);

  const catchUpRates = useMemo(
    () =>
      catchUpTarget
        ? buildCatchUpRates(catchUpTarget.item, { cycleStart: catchUpTarget.cycleStart, monthStartDay })
        : EMPTY_ARRAY,
    [catchUpTarget, monthStartDay]
  );

  function confirmBillPaid(entry) {
    if (writingRef.current) return;
    writingRef.current = true;
    const item = billTarget?.item;
    setBillTarget(null);
    // Die ID entsteht außerhalb des State-Updaters (StrictMode ruft doppelt auf).
    onAddEntry?.({ id: generateId("entry"), ...entry });
    undo.offer(`Zahlung für „${item?.name ?? ""}“ gebucht.`);
  }

  function confirmCatchUp(rates) {
    if (writingRef.current) return;
    writingRef.current = true;
    const item = catchUpTarget?.item;
    setCatchUpTarget(null);
    if (!item || rates.length === 0) return;
    const newEntries = rates.map((r) => ({
      id: generateId("entry"),
      date: r.date,
      amount: r.amount,
      transferCategoryId: item.transferCategoryId || null,
      categoryId: null,
      subcategoryId: null,
      kind: "transfer",
      potId: item.potId,
      note: item.name,
    }));
    // Eine Batch-Buchung: ein patchActiveBook, ein Commit, ein Save.
    onAddEntries?.(newEntries);
    undo.offer(
      rates.length === 1
        ? `1 Rate für „${item.name}“ gebucht.`
        : `${rates.length} Raten für „${item.name}“ gebucht.`
    );
  }

  // ── Tabelle ───────────────────────────────────────────────────────────
  const sections = useMemo(
    () =>
      model.sections.map((s) => {
        const tail = [];
        if (s.goalRows.length > 0) {
          tail.push({
            id: `goals:${s.pot.id}`,
            isRemainder: true,
            label: "Sparziele",
            actual: s.goalBalance,
          });
        }
        if (isVisibleRemainder(s.archivedBalance)) {
          tail.push({
            id: `archived:${s.pot.id}`,
            isRemainder: true,
            label: "Abgeschlossene Sparziele",
            actual: s.archivedBalance,
          });
        }
        if (isVisibleRemainder(s.unassigned)) {
          tail.push({
            id: `rest:${s.pot.id}`,
            isRemainder: true,
            label: NO_PURPOSE_LABEL,
            actual: s.unassigned,
          });
        }
        return {
          key: s.pot.id,
          label: s.pot.name,
          accent: null,
          rows: s.rows,
          tail,
          total: fmt(s.balance),
          totalColumnId: "actual",
          countLabel: (n) => (n === 0 ? "keine Rücklagen" : `${n} Sparposition${n === 1 ? "" : "en"}`),
          aside: (
            <button
              type="button"
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              onClick={() => openCreate(s.pot.id)}
              title="Sparposition in diesem Topf anlegen"
              aria-label={`Sparposition in „${s.pot.name}“ anlegen`}
            >
              <IconPlus />
            </button>
          ),
        };
      }),
    [model.sections, fmt, openCreate]
  );

  function renderDetail(row, hiddenColumns) {
    return (
      <ReserveDetail
        row={row}
        hiddenColumns={hiddenColumns}
        fmt={fmt}
        pot={potById.get(row.purpose?.potId)}
        canCatchUp={canCatchUp(row)}
        onBillPaid={openBillPaid}
        onCatchUp={openCatchUp}
        onEdit={openEdit}
      />
    );
  }

  // Zeilenaktionen: „Rechnung bezahlt" (nur wenn gerade sinnvoll), Bearbeiten
  // und das Menü. Sparziele haben ihre Aktionen auf der Karte.
  function renderRowActions(row) {
    const name = row.purpose?.name ?? "";
    const canPay = row.status === "due" || row.status === "overdue";
    const menu = [];
    if (canCatchUp(row)) menu.push({ label: "Rückstand ausgleichen", onClick: () => openCatchUp(row) });
    menu.push({ label: "Löschen", danger: true, onClick: () => deletePosition(row.purpose) });
    return (
      <>
        {canPay && (
          <Button size="sm" variant="outline" onClick={() => openBillPaid(row)}>Rechnung bezahlt</Button>
        )}
        <button
          type="button"
          className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          onClick={() => openEdit(row)}
          title="Bearbeiten"
          aria-label={`„${name}“ bearbeiten`}
        >
          <IconEdit />
        </button>
        <OverflowMenu
          label={`Weitere Aktionen für „${name}“`}
          buttonClassName="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          items={menu}
        />
      </>
    );
  }

  const { kpis } = model;
  const attention = kpis.behind + kpis.due;

  return (
    <div>
      {pots.length > 0 && (
        <div className="hb-view-actions">
          <Button onClick={() => openCreate()}><IconPlus /> Neue Sparposition</Button>
        </div>
      )}

      {pots.length === 0 ? (
        <Card>
          <CardContent>
            <div className="hb-empty">
              <div className="hb-empty-icon"><IconSavings /></div>
              <div className="hb-empty-title">Noch keine Töpfe</div>
              <div className="hb-empty-text">
                Rücklagen liegen in Töpfen: freie Rücklagen, Rückstellungen für wiederkehrende
                Rechnungen und Sparziele. Lege zuerst einen Topf an.
              </div>
              <Button onClick={() => onNavigateToPots?.()}>Zu den Töpfen</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hb-stat-pills">
            <div className="hb-stat-pill hb-stat-pill--teal">
              <div className="hb-stat-pill-label">Angespart</div>
              <div className="hb-stat-pill-value hb-teal">{fmt(kpis.saved)}</div>
              <div className="hb-stat-pill-sub">
                in {kpis.potCount} {kpis.potCount === 1 ? "Topf" : "Töpfen"}
              </div>
            </div>
            <div className="hb-stat-pill hb-stat-pill--transfer">
              <div className="hb-stat-pill-label">Monatlich eingeplant</div>
              <div className="hb-stat-pill-value">{fmt(kpis.rates)}</div>
              <div className="hb-stat-pill-sub">davon {fmt(kpis.goalRates)} für Sparziele</div>
            </div>
            <div className={"hb-stat-pill " + (attention === 0 ? "hb-stat-pill--ok" : "hb-stat-pill--warn")}>
              <div className="hb-stat-pill-label">Handlungsbedarf</div>
              <div className={"hb-stat-pill-value" + (attention === 0 ? " hb-ok" : "")}>
                {attention === 0 ? "Alles im Plan" : attention}
              </div>
              <div className="hb-stat-pill-sub">
                {attention === 0
                  ? "kein Rückstand, nichts fällig"
                  : `${kpis.behind} im Rückstand · ${kpis.due} fällig`}
              </div>
            </div>
          </div>

          <Card>
            <CardContent>
              <DataTable
                columns={columns}
                sections={sections}
                storageKey="savings"
                defaultSort={null}
                renderDetail={renderDetail}
                renderRowActions={renderRowActions}
                label="Rückstellungen und freie Rücklagen"
                toolbar={<h3 className="hb-card-title">Rückstellungen &amp; freie Rücklagen</h3>}
              />
            </CardContent>
          </Card>

          <GoalCards
            goals={model.activeGoals}
            potNameById={potNameById}
            fmt={fmt}
            hasArchive={model.archivedGoals.length > 0}
            onCreate={() => openCreate(undefined, "goal")}
            onEdit={openEdit}
            onComplete={completeGoal}
            onCompleteEarly={completeGoalEarly}
            onDelete={deletePosition}
          />

          <GoalArchive
            goals={model.archivedGoals}
            potNameById={potNameById}
            fmt={fmt}
            onReactivate={reactivateGoal}
            onDelete={(goal) => deletePosition({ id: goal.id, name: goal.name })}
          />
        </>
      )}

      {dialog && (
        <SavingsPositionDialog
          key={dialog.key}
          open
          purpose={dialog.purpose}
          initialDraft={dialog.initialDraft}
          defaultPotId={dialog.defaultPotId}
          defaultRule={dialog.defaultRule}
          defaultGroupId={dialog.defaultGroupId}
          knownTags={knownTags}
          pots={pots}
          transferCategories={transferCategories}
          fixedCostGroups={fixedCostGroups}
          entries={entries}
          onClose={() => closeDialog()}
          onSave={savePosition}
          onUseExisting={adoptExisting}
        />
      )}

      <BillPaidDialog
        open={Boolean(billTarget)}
        item={billTarget?.item}
        potName={potById.get(billTarget?.item?.potId)?.name}
        actual={billTarget?.actual ?? 0}
        draft={billDraft}
        onDraftChange={setBillDraft}
        onClose={() => setBillTarget(null)}
        onConfirm={confirmBillPaid}
      />

      <BacklogCatchUpDialog
        open={Boolean(catchUpTarget)}
        item={catchUpTarget?.item}
        potName={potById.get(catchUpTarget?.item?.potId)?.name}
        cycleStart={catchUpTarget?.cycleStart}
        rates={catchUpRates}
        actual={catchUpTarget?.actual ?? 0}
        target={catchUpTarget?.target ?? null}
        onClose={() => setCatchUpTarget(null)}
        onConfirm={confirmCatchUp}
      />
    </div>
  );
}
