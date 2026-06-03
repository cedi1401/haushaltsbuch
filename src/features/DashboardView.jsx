import React, { useState } from "react";
import { Button, Card, CardContent } from "../components/ui.jsx";
import CategoryManagerDialog from "../components/CategoryManagerDialog.jsx";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../utils/hbUtils.js";

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
  balance,
  potBalances,
  expenseByHierarchy,
  incomeByHierarchy,
  baseCurrency,
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

      <div className="hb-stat-tiles">
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Einnahmen</div>
          <div className="hb-stat-tile-value hb-ok">+{fmt(totalIncome)}</div>
        </div>
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Ausgaben</div>
          <div className="hb-stat-tile-value hb-bad">-{fmt(totalExpense)}</div>
        </div>
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Transfers</div>
          <div className="hb-stat-tile-value hb-transfer"><span className="hb-sign hb-sign-right">↓</span>{" "}{fmt(totalTransfers)}</div>
        </div>
        <div className="hb-stat-tile">
          <div className="hb-stat-tile-label">Saldo</div>
          <div className={`hb-stat-tile-value ${balance >= 0 ? "hb-ok" : "hb-bad"}`}>
            {fmt(balance)}
          </div>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <CardContent>
          <div className="hb-row" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Topf-Stände</h3>
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
        </CardContent>
      </Card>

      <div className="hb-analysis-grid">
        <Charts
          expenseByHierarchy={expenseByHierarchy}
          incomeByHierarchy={incomeByHierarchy}
          baseCurrency={baseCurrency}
        />
        <InsightsPanel
          expenseByHierarchy={expenseByHierarchy}
          filteredEntries={filteredEntries}
          monthFilter={monthFilter}
          entries={activeBook?.entries || []}
          monthStartDay={monthStartDay}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
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
