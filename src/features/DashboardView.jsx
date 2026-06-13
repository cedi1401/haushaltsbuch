import React, { useState } from "react";
import { Button, Card, CardContent } from "../components/ui.jsx";
import CategoryManagerDialog from "../components/CategoryManagerDialog.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../utils/hbUtils.js";
import { IconPots } from "../components/icons.jsx";

import EntryFormDialog from "./EntryFormDialog.jsx";
import Charts from "./Charts.jsx";
import InsightsPanel from "./InsightsPanel.jsx";
import EntriesTable from "./EntriesTable.jsx";

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

  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const incomeCategories = activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES;

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Button onClick={() => entryActions.setAddEntryOpen(true)}>Buchung hinzufügen</Button>
        <Button variant="outline" onClick={() => setCategoryManagerOpen(true)}>
          Kategorien bearbeiten
        </Button>
      </div>

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
            {potBalances.length > 8 && (
              <button
                type="button"
                className="hb-link-btn"
                onClick={() => setShowAllPots((v) => !v)}
              >
                {showAllPots ? "Weniger anzeigen" : `Alle ${potBalances.length} anzeigen`}
              </button>
            )}
          </div>
          {potBalances.length === 0 ? (
            <div className="hb-empty hb-empty--sm">
              <div className="hb-empty-icon"><IconPots /></div>
              <div className="hb-empty-title">Noch keine Töpfe</div>
              <div className="hb-empty-text">Lege Töpfe an, um Geld für bestimmte Zwecke zurückzulegen.</div>
            </div>
          ) : (
            <div className="hb-pot-tiles">
              {(showAllPots ? potBalances : potBalances.slice(0, 8)).map((pot) => (
                <div key={pot.id} className="hb-pot-tile">
                  <div className="hb-stat-title">{pot.name}</div>
                  <div className={`hb-stat-val ${pot.balance >= 0 ? "hb-ok" : "hb-bad"}`}>
                    {fmt(pot.balance)}
                  </div>
                </div>
              ))}
            </div>
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
