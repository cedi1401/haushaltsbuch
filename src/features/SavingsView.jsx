import React, { useCallback, useMemo, useRef, useState } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { Card, CardContent, Button } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { IconSavings, IconEdit, IconWarningRounded } from "../components/icons.jsx";
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
import CatchUpRevertDialog from "./savings/CatchUpRevertDialog.jsx";
import BacklogTopUpDialog from "./savings/BacklogTopUpDialog.jsx";

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
 * Rollenteilung zur Fixkosten-View: hier wird bewertet und der Zyklus
 * abgeschlossen; dort werden Rückstellungen und freie Rücklagen angelegt und
 * monatlich gebucht. Neu angelegt werden hier nur Sparziele. „Bearbeiten" und
 * „+ Sparposition" in den Fixkosten springen hierher und öffnen den Dialog
 * (`initialIntent`, siehe `dialogFromIntent`).
 */

/**
 * Dialog-Zustand zum Sprung aus den Fixkosten oder dem Buchungsdialog:
 * `{ purposeId }` bearbeitet eine Sparposition, sonst wird eine neue angelegt
 * (optional in `potId` und `groupId`). Mit `returnTo` geht es nach dem
 * Schließen dorthin zurück; `onReturn` erfährt dabei die gespeicherte
 * Sparposition (`{ id, potId }`, bei Abbrechen `null`). `{ duplicateOf }`
 * legt eine Kopie an. Ein unbekannter Zweck (inzwischen gelöscht) öffnet
 * nichts.
 */
function dialogFromIntent(intent, transferCategories, pots) {
  if (!intent) return null;
  if (intent.duplicateOf) {
    const source = findTransferCategory(transferCategories, intent.duplicateOf);
    return source && !source.deleted
      ? { key: 1, purpose: null, duplicateOf: source, returnTo: intent.returnTo, onReturn: intent.onReturn }
      : null;
  }
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
  onRemoveEntries,
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
  const openCreateGoal = useCallback(
    () => openDialog({ purpose: null, defaultPotId: pots[0]?.id, defaultRule: "goal" }),
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
      let next = list.map((c) => (c.id === category.id ? applySavingsFields(c, fields, todayISO()) : c));
      // Kopien direkt hinter dem Original einfügen (wie bei den Fixkosten)
      const sourceId = dialog?.duplicateOf?.id;
      if (sourceId && !transferCategories.some((c) => c.id === category.id)) {
        const copy = next.find((c) => c.id === category.id);
        next = next.filter((c) => c.id !== category.id);
        const idx = next.findIndex((c) => c.id === sourceId);
        if (idx !== -1) next.splice(idx + 1, 0, copy);
        else next.push(copy);
      }
      saveTransferCategories(next);
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

  // ── Rechnung bezahlt / Raten nachbuchen / Rückstand ausgleichen ───────
  // „Raten nachbuchen" ist eine Einstiegshilfe und genau einmal je
  // Position verfügbar: sobald eine Einzahlung gebucht ist, gibt es keine
  // Historie mehr nachzuholen. Nur Einzahlungen zählen — eine Entnahme aus
  // „Rechnung bezahlt" verbraucht die Verfügbarkeit nicht.
  //
  // Danach übernimmt „Rückstand ausgleichen": eine einzelne Einzahlung über
  // den aktuellen Fehlbetrag, verfügbar, solange die Position unter dem Soll
  // liegt. Die beiden schließen sich aus, es steht immer höchstens eine da.
  //
  // Die nachgebuchten Raten tragen eine gemeinsame `catchUpBatchId`. Damit
  // lassen sie sich als Ganzes zurücknehmen — etwa wenn der Rechnungsbetrag
  // beim Anlegen nur geschätzt war. Danach ist das Nachbuchen wieder verfügbar,
  // sofern keine weitere Einzahlung gebucht ist.
  const { depositsByPurpose, catchUpByPurpose } = useMemo(() => {
    const deposits = new Map();
    const catchUp = new Map();
    for (const e of entries || []) {
      if (!e.transferCategoryId || e.kind !== "transfer") continue;
      deposits.set(e.transferCategoryId, (deposits.get(e.transferCategoryId) || 0) + 1);
      if (e.catchUpBatchId) {
        const list = catchUp.get(e.transferCategoryId) || [];
        list.push(e);
        catchUp.set(e.transferCategoryId, list);
      }
    }
    return { depositsByPurpose: deposits, catchUpByPurpose: catchUp };
  }, [entries]);
  const canCatchUp = useCallback(
    (row) => row.isSinkingFund && row.elapsed > 0 && !depositsByPurpose.has(row.id),
    [depositsByPurpose]
  );
  const canRevertCatchUp = useCallback((row) => catchUpByPurpose.has(row.id), [catchUpByPurpose]);
  // Bewusst unabhängig vom Status: auch eine fällige Position darf vor dem
  // Bezahlen noch aufgefüllt werden.
  const canTopUp = useCallback(
    (row) =>
      row.isSinkingFund && row.delta !== null && row.delta < -row.tolerance && depositsByPurpose.has(row.id),
    [depositsByPurpose]
  );

  // Beide Aktionen schreiben genau einmal. `EditDialog` löst `onSave` auch per
  // Strg+Enter aus und `canSave` bleibt bis zum Unmount wahr — eine zweite
  // Auslösung erzeugte doppelte Einträge. Der Riegel steht deshalb hier.
  const writingRef = useRef(false);
  const [billTarget, setBillTarget] = useState(null);
  const [billDraft, setBillDraft] = useState(null);
  const [catchUpTarget, setCatchUpTarget] = useState(null);
  const [revertTarget, setRevertTarget] = useState(null);
  const [topUpTarget, setTopUpTarget] = useState(null);
  const [topUpDraft, setTopUpDraft] = useState(null);

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

  const openRevertCatchUp = useCallback((row) => {
    writingRef.current = false;
    setRevertTarget(row);
  }, []);

  const openTopUp = useCallback((row) => {
    writingRef.current = false;
    setTopUpTarget(row);
    // Vorbelegt ist der ganze Fehlbetrag; die Notiz trägt den Namen wie bei
    // „Rechnung bezahlt", sonst stünde die Buchung in der Liste als „—".
    setTopUpDraft({
      date: todayISO(),
      amount: (Math.round(-row.delta * 100) / 100).toFixed(2),
      note: String(row.item?.name ?? ""),
    });
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

  function confirmTopUp(entry) {
    if (writingRef.current) return;
    writingRef.current = true;
    const item = topUpTarget?.item;
    setTopUpTarget(null);
    onAddEntry?.({ id: generateId("entry"), ...entry });
    undo.offer(`Einzahlung für „${item?.name ?? ""}“ gebucht.`);
  }

  function confirmCatchUp(rates) {
    if (writingRef.current) return;
    writingRef.current = true;
    const item = catchUpTarget?.item;
    setCatchUpTarget(null);
    if (!item || rates.length === 0) return;
    const catchUpBatchId = generateId("catchup");
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
      catchUpBatchId,
    }));
    // Eine Batch-Buchung: ein patchActiveBook, ein Commit, ein Save.
    onAddEntries?.(newEntries);
    undo.offer(
      rates.length === 1
        ? `1 Rate für „${item.name}“ gebucht.`
        : `${rates.length} Raten für „${item.name}“ gebucht.`
    );
  }

  function confirmRevertCatchUp(list) {
    if (writingRef.current) return;
    writingRef.current = true;
    const name = revertTarget?.purpose?.name ?? "";
    setRevertTarget(null);
    if (list.length === 0) return;
    onRemoveEntries?.(list.map((e) => e.id));
    undo.offer(
      list.length === 1
        ? `1 nachgebuchte Rate für „${name}“ gelöscht.`
        : `${list.length} nachgebuchte Raten für „${name}“ gelöscht.`
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
        };
      }),
    [model.sections, fmt]
  );

  function renderDetail(row, hiddenColumns) {
    return (
      <ReserveDetail
        row={row}
        hiddenColumns={hiddenColumns}
        fmt={fmt}
        canCatchUp={canCatchUp(row)}
        canRevertCatchUp={canRevertCatchUp(row)}
        canTopUp={canTopUp(row)}
        onBillPaid={openBillPaid}
        onCatchUp={openCatchUp}
        onTopUp={openTopUp}
        onRevertCatchUp={openRevertCatchUp}
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
    if (canCatchUp(row)) menu.push({ label: "Raten nachbuchen", onClick: () => openCatchUp(row) });
    if (canTopUp(row)) menu.push({ label: "Rückstand ausgleichen", onClick: () => openTopUp(row) });
    if (canRevertCatchUp(row)) menu.push({ label: "Nachbuchung zurücknehmen", onClick: () => openRevertCatchUp(row) });
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
  // Handlungsbedarf nach Gewicht: überfällig (rot) vor Rückstand (gelb) vor
  // fällig (blau wie die Status-Pille „Fällig“ in der Tabelle).
  const positions = (n) => `${n} ${n === 1 ? "Position" : "Positionen"}`;
  const attention =
    kpis.overdue > 0 ? { tone: "bad", text: `${positions(kpis.overdue)} überfällig` }
    : kpis.behind > 0 ? { tone: "warn", text: `${positions(kpis.behind)} im Rückstand` }
    : kpis.due > 0 ? { tone: "accent", text: `${positions(kpis.due)} fällig` }
    : { tone: "ok", text: "Alles im Plan" };
  const attentionParts = [
    kpis.overdue > 0 && `${kpis.overdue} überfällig`,
    kpis.behind > 0 && `${kpis.behind} im Rückstand`,
    kpis.due > 0 && `${kpis.due} fällig`,
  ].filter(Boolean);

  return (
    <div>
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
            <div className={"hb-stat-pill hb-stat-pill--" + attention.tone}>
              <div className="hb-stat-pill-label">Handlungsbedarf</div>
              <div className={"hb-stat-pill-value hb-" + attention.tone}>
                {attention.tone === "bad" && <IconWarningRounded aria-hidden="true" />}
                <span>{attention.text}</span>
              </div>
              <div className="hb-stat-pill-sub">
                {attentionParts.length === 0
                  ? "kein Rückstand, nichts fällig"
                  : attentionParts.join(" · ")}
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
            onCreate={openCreateGoal}
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
          duplicateOf={dialog.duplicateOf}
          defaultPotId={dialog.defaultPotId}
          defaultRule={dialog.defaultRule}
          defaultGroupId={dialog.defaultGroupId}
          knownTags={knownTags}
          pots={pots}
          transferCategories={transferCategories}
          expenseCategories={activeBook?.expenseCategories || EMPTY_ARRAY}
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

      <BacklogTopUpDialog
        open={Boolean(topUpTarget)}
        item={topUpTarget?.item}
        potName={potById.get(topUpTarget?.item?.potId)?.name}
        actual={topUpTarget?.actual ?? 0}
        draft={topUpDraft}
        onDraftChange={setTopUpDraft}
        onClose={() => setTopUpTarget(null)}
        onConfirm={confirmTopUp}
      />

      <CatchUpRevertDialog
        open={Boolean(revertTarget)}
        name={revertTarget?.purpose?.name}
        entries={revertTarget ? catchUpByPurpose.get(revertTarget.id) : EMPTY_ARRAY}
        actual={revertTarget?.actual ?? 0}
        otherDeposits={
          revertTarget
            ? (depositsByPurpose.get(revertTarget.id) || 0) - (catchUpByPurpose.get(revertTarget.id)?.length || 0)
            : 0
        }
        monthStartDay={monthStartDay}
        onClose={() => setRevertTarget(null)}
        onConfirm={confirmRevertCatchUp}
      />
    </div>
  );
}
