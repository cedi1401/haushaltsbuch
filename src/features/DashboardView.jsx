import React, { useState, useMemo, useCallback } from "react";
import { Button, Card, CardContent } from "../components/ui.jsx";
import CategoryManagerDialog from "../components/CategoryManagerDialog.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../utils/hbUtils.js";
import { IconPots } from "../components/icons.jsx";
import { generateId } from "../utils/idUtils.js";
import { getFinancialMonthRange } from "../utils/financialMonthUtils.js";
import { MONTHS_SHORT } from "../utils/constants.js";
import SurplusSweepDialog, { SWEEP_FALLBACK_POT } from "./insights/SurplusSweepDialog.jsx";

import EntryFormDialog from "./EntryFormDialog.jsx";
import Charts from "./Charts.jsx";
import InsightsPanel from "./InsightsPanel.jsx";
import EntriesTable from "./EntriesTable.jsx";

// "2026-06-18" -> "18. Jun."
function fmtTileDate(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).split("-");
  return `${Number(d)}. ${MONTHS_SHORT[Number(m) - 1] || m}.`;
}

export default function DashboardView({
  activeBook,
  filteredEntries,
  totalIncome,
  totalExpense,
  totalTransfers,
  totalSavingsTransfers,
  totalReserveTransfers,
  balance,
  potBalances,
  expenseByHierarchy,
  incomeByHierarchy,
  monthFilter,
  monthLabel,
  monthStartDay,
  entriesSorted,
  entryActions,
  onUpdateBook,
  patchActiveBook,
  indicateTransferCategories,
}) {
  const fmt = useFmt();
  const [showAllPots, setShowAllPots] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);

  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const incomeCategories = activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES;

  // Aus potBalances (enthält bereits `balance`), damit der Dialog den Topf-Stand
  // nach dem Sweep anzeigen kann.
  const savingsPots = useMemo(
    () => (potBalances || []).filter((p) => p.isSavings),
    [potBalances]
  );

  // Letzte Topf-Bewegung je Topf (Einzahlung = transfer, Auszahlung = withdrawal).
  // Über ALLE Einträge des Buchs, nicht nur die monatsgefilterten – die letzte
  // Bewegung kann aus einem früheren Monat stammen.
  const lastTxByPot = useMemo(() => {
    const map = new Map();
    for (const e of activeBook?.entries || []) {
      if (!e.potId) continue;
      if (e.kind !== "transfer" && e.kind !== "withdrawal") continue;
      const prev = map.get(e.potId);
      if (
        !prev ||
        String(e.date) > String(prev.date) ||
        (e.date === prev.date && Number(e.id) > Number(prev.id))
      ) {
        map.set(e.potId, e);
      }
    }
    return map;
  }, [activeBook?.entries]);

  // Sichtbar/Sortierung: jüngste letzte Buchung zuerst, Töpfe ohne Bewegung ans Ende.
  const sortedPots = useMemo(() => {
    const arr = [...(potBalances || [])];
    arr.sort((a, b) => {
      const ta = lastTxByPot.get(a.id);
      const tb = lastTxByPot.get(b.id);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      if (!ta && !tb) return 0;
      if (ta.date !== tb.date) return ta.date > tb.date ? -1 : 1; // neuer zuerst
      return Number(tb.id) - Number(ta.id); // Tie-Break: neuere id zuerst
    });
    return arr;
  }, [potBalances, lastTxByPot]);

  // Übrigen Frei-Betrag als Sparen-Transfer auf den letzten Tag des Finanzmonats
  // verbuchen. Ohne eigenen Spar-Topf wird ein „Überschuss"-Topf (isSavings) angelegt.
  const handleSweepSurplus = useCallback(
    ({ potId, amount }) => {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
      const range = getFinancialMonthRange(monthFilter, monthStartDay);
      if (!range) return;
      const date = range.endDate;

      patchActiveBook((b) => {
        const pots = b.pots || [];
        let targetId = potId;
        let nextPots = pots;

        if (!potId || potId === SWEEP_FALLBACK_POT) {
          const existing = pots.find((p) => p.id === "surplus" && p.isSavings);
          if (existing) {
            targetId = existing.id;
          } else {
            // id-Kollision mit Legacy-Nicht-Spar-Topf vermeiden
            const collision = pots.some((p) => p.id === "surplus");
            const newId = collision ? generateId("pot") : "surplus";
            nextPots = [...pots, { id: newId, name: "Überschuss", isSavings: true }];
            targetId = newId;
          }
        }

        const entry = {
          id: generateId("entry"),
          date,
          amount: numericAmount,
          category: "",
          kind: "transfer",
          potId: targetId,
          note: `Monatsüberschuss ${monthFilter}`,
          isSurplusSweep: true,
        };

        return { ...b, pots: nextPots, entries: [...(b.entries || []), entry] };
      });
    },
    [monthFilter, monthStartDay, patchActiveBook]
  );

  // Sweep nur bei abgeschlossenem Monat mit positivem Frei-Rest, der noch nicht
  // gefegt wurde. Für einen abgeschlossenen Monat entspricht `balance` dem Frei-Rest.
  const canSweepSurplus = useMemo(() => {
    if (!monthFilter) return false;
    const range = getFinancialMonthRange(monthFilter, monthStartDay);
    if (!range) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    const isCompleted = range.endDate < todayStr;
    if (!isCompleted || !(balance > 0)) return false;
    const alreadySwept = (filteredEntries || []).some(
      (e) => e.kind === "transfer" && e.isSurplusSweep
    );
    return !alreadySwept;
  }, [monthFilter, monthStartDay, balance, filteredEntries]);

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Button onClick={() => entryActions.setAddEntryOpen(true)}>Buchung hinzufügen</Button>
        <Button variant="outline" onClick={() => setCategoryManagerOpen(true)}>
          Kategorien bearbeiten
        </Button>
        {canSweepSurplus && (
          <Button style={{ marginLeft: "auto" }} onClick={() => setSweepOpen(true)}>
            <IconPots width={16} height={16} />
            Überschuss sparen
          </Button>
        )}
      </div>

      {sweepOpen && (
        <SurplusSweepDialog
          open
          defaultAmount={balance}
          savingsPots={savingsPots}
          onClose={() => setSweepOpen(false)}
          onConfirm={({ potId, amount }) => {
            handleSweepSurplus({ potId, amount });
            setSweepOpen(false);
          }}
        />
      )}

      <EntryFormDialog
        open={entryActions.addEntryOpen}
        onClose={entryActions.closeAddEntry}
        onSave={entryActions.handleAddEntry}
        canSave={entryActions.canAddEntry}
        draft={entryActions.addDraft}
        setField={entryActions.setAddField}
        pots={activeBook?.pots || []}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        transferCategories={indicateTransferCategories}
        availableWithdrawalCategories={entryActions.availableWithdrawalCategories}
        onOpenCategoryManager={() => {
          entryActions.setAddEntryOpen(false);
          setCategoryManagerOpen(true);
        }}
      />

      <div className="hb-stat-pills" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="hb-stat-pill hb-stat-pill--ok">
          <span className="hb-stat-pill-label">Einnahmen</span>
          <span className="hb-stat-pill-value hb-ok">+{fmt(totalIncome)}</span>
        </div>
        <div className="hb-stat-pill hb-stat-pill--bad">
          <span className="hb-stat-pill-label">Ausgaben</span>
          <span className="hb-stat-pill-value hb-bad">-{fmt(totalExpense)}</span>
        </div>
        <div className="hb-stat-pill hb-stat-pill--transfer">
          <span className="hb-stat-pill-label">Rücklagen</span>
          <span className="hb-stat-pill-value hb-transfer">{fmt(totalReserveTransfers ?? totalTransfers)}</span>
        </div>
        <div className="hb-stat-pill hb-stat-pill--ok">
          <span className="hb-stat-pill-label">Gespart</span>
          <span className="hb-stat-pill-value hb-ok">{fmt(totalSavingsTransfers ?? 0)}</span>
        </div>
        <div className={`hb-stat-pill ${balance >= 0 ? "hb-stat-pill--ok" : "hb-stat-pill--bad"}`}>
          <span className="hb-stat-pill-label">Frei</span>
          <span className={`hb-stat-pill-value ${balance >= 0 ? "hb-ok" : "hb-bad"}`}>{fmt(balance)}</span>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <div className="hb-row" style={{ marginBottom: 10 }}>
            <h3 className="hb-card-title">Topf-Stände</h3>
          </div>
          {potBalances.length === 0 ? (
            <div className="hb-empty hb-empty--sm">
              <div className="hb-empty-icon"><IconPots /></div>
              <div className="hb-empty-title">Noch keine Töpfe</div>
              <div className="hb-empty-text">Lege Töpfe an, um Geld für bestimmte Zwecke zurückzulegen.</div>
            </div>
          ) : (
            <>
            <div className="hb-pot-grid">
              {(showAllPots ? sortedPots : sortedPots.slice(0, 4)).map((pot) => {
                const txn = lastTxByPot.get(pot.id);
                const isIn = txn?.kind === "transfer";
                return (
                  <div key={pot.id} className="hb-pot-card">
                    <div className="hb-pot-card-top">
                      <div className="hb-pot-card-head">
                        <div className="hb-pot-card-name">{pot.name}</div>
                        <div className="hb-pot-card-amount">
                          {fmt(pot.balance)}
                        </div>
                      </div>
                      {pot.isSavings && <span className="hb-pot-savings-tag">Sparen</span>}
                    </div>

                    {txn ? (
                      <div className="hb-pot-card-foot">
                        <span className="hb-pot-card-foot-label">
                          {isIn ? "Letzte Einzahlung" : "Letzte Auszahlung"}
                        </span>
                        <span className="hb-pot-card-foot-value">
                          <span className={isIn ? "hb-pot-foot-in" : "hb-pot-foot-out"}>
                            {isIn ? "+" : "−"}{fmt(txn.amount)}
                          </span>
                          <span className="hb-pot-card-foot-date"> · {fmtTileDate(txn.date)}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="hb-pot-card-foot hb-pot-card-foot--empty">
                        <span>Noch keine Bewegung</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {potBalances.length > 4 && (
              <div style={{ marginTop: 12, paddingTop: 10, textAlign: "center" }}>
                <Button variant="outline" onClick={() => setShowAllPots((v) => !v)}>
                  {showAllPots ? "Weniger anzeigen" : `Weitere ${potBalances.length - 4} anzeigen`}
                </Button>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="hb-analysis-grid">
        <Charts
          expenseByHierarchy={expenseByHierarchy}
          incomeByHierarchy={incomeByHierarchy}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          totalReserveTransfers={totalReserveTransfers ?? 0}
          totalSavingsTransfers={totalSavingsTransfers ?? 0}
          balance={balance}
        />
        <InsightsPanel
          expenseByHierarchy={expenseByHierarchy}
          filteredEntries={filteredEntries}
          monthFilter={monthFilter}
          entries={activeBook?.entries || []}
          monthStartDay={monthStartDay}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          totalSavingsTransfers={totalSavingsTransfers ?? 0}
          totalReserveTransfers={totalReserveTransfers ?? 0}
          expenseCategories={expenseCategories}
          savingsPots={savingsPots}
          onSweepSurplus={handleSweepSurplus}
        />
      </div>

      <EntriesTable
        entriesSorted={entriesSorted}
        monthLabel={monthLabel}
        monthFilter={monthFilter}
        startEdit={entryActions.startEdit}
        removeEntry={entryActions.removeEntry}
        onAddEntry={() => entryActions.setAddEntryOpen(true)}
      />

      <CategoryManagerDialog
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        transferCategories={indicateTransferCategories}
        onUpdateExpenseCategories={(newCats) =>
          patchActiveBook((b) => ({ ...b, expenseCategories: newCats }))
        }
        onUpdateIncomeCategories={(newCats) =>
          patchActiveBook((b) => ({ ...b, incomeCategories: newCats }))
        }
        onUpdateTransferCategories={(newCats) =>
          patchActiveBook((b) => ({ ...b, transferCategories: newCats }))
        }
      />
    </>
  );
}
