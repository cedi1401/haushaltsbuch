import React, { useState, useMemo } from "react";
import { Card, CardContent } from "../components/ui.jsx";
import { useFinanceAnalytics } from "../hooks/useFinanceAnalytics.js";
import { buildBudgetRows } from "../utils/budgetUtils.js";
import { buildSavingsModel } from "../utils/savingsUtils.js";
import InsightTabs from "./insights/InsightTabs.jsx";
import OverviewCard from "./insights/OverviewCard.jsx";
import BehaviorCard from "./insights/BehaviorCard.jsx";
import ForecastCard from "./insights/ForecastCard.jsx";
import BudgetCard from "./insights/BudgetCard.jsx";
import ReservesCard from "./insights/ReservesCard.jsx";
import { budgetAlert, forecastAlert, reservesAlert } from "./insights/insightAlerts.js";

export default function InsightsPanel({
  expenseByHierarchy,
  filteredEntries,
  monthFilter,
  entries,
  monthStartDay,
  totalIncome,
  totalExpense,
  totalSavings,
  totalReserveTransfers,
  activeBook,
  expenseCategories,
  includeReserves = false,
  transferCategories,
  onNavigateToBudget,
  onNavigateToSavings,
  onNavigateToFixed,
}) {
  const [activeCard, setActiveCard] = useState("overview");
  const analytics = useFinanceAnalytics({
    filteredEntries,
    expenseByHierarchy,
    monthFilter,
    entries,
    monthStartDay,
    totalIncome,
    totalExpense,
    totalSavings,
    totalReserveTransfers,
    includeReserves,
    expenseCategories,
    transferCategories,
  });

  const budget = useMemo(
    () => buildBudgetRows({ entries, expenseCategories, monthFilter, monthStartDay }),
    [entries, expenseCategories, monthFilter, monthStartDay]
  );

  // Rückstellungen nach heutigem Stand, unabhängig vom Monatsfilter.
  const reserves = useMemo(() => {
    const model = buildSavingsModel(activeBook, entries, { monthStartDay });
    const rows = model.sections
      .flatMap((s) => s.rows)
      .filter((r) => r.rule === "reserve" && r.isSinkingFund);
    return { rows, kpis: model.kpis };
  }, [activeBook, entries, monthStartDay]);

  const tabAlerts = useMemo(
    () => ({
      budget: budgetAlert(budget.budgeted),
      reserves: reservesAlert(reserves.kpis),
      forecast: forecastAlert(analytics.forecast),
    }),
    [budget.budgeted, reserves.kpis, analytics.forecast]
  );

  return (
    <Card style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent style={{ display: "flex", flexDirection: "column", padding: "16px 20px 24px", flex: 1 }}>
        <InsightTabs activeCard={activeCard} onTabChange={setActiveCard} alerts={tabAlerts} />
        <div className="hb-insights-body">
          {activeCard === "overview" && (
            <OverviewCard analytics={analytics.overview} />
          )}
          {activeCard === "budget" && (
            <BudgetCard
              budgetItems={budget.budgeted}
              totals={budget.totals}
              isFallbackMonth={!monthFilter}
              onNavigateToBudget={onNavigateToBudget}
            />
          )}
          {activeCard === "reserves" && (
            <ReservesCard
              rows={reserves.rows}
              counts={reserves.kpis}
              onNavigateToSavings={onNavigateToSavings}
              onNavigateToFixed={onNavigateToFixed}
            />
          )}
          {activeCard === "behavior" && (
            <BehaviorCard analytics={analytics.behavior} />
          )}
          {activeCard === "forecast" && (
            <ForecastCard analytics={analytics.forecast} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
