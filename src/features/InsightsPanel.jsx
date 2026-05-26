import React, { useState, useMemo } from "react";
import { Card, CardContent } from "../components/ui.jsx";
import { useFinanceAnalytics } from "../hooks/useFinanceAnalytics.js";
import { calcBudgetStatus } from "../utils/budgetUtils.js";
import InsightTabs from "./insights/InsightTabs.jsx";
import OverviewCard from "./insights/OverviewCard.jsx";
import BehaviorCard from "./insights/BehaviorCard.jsx";
import ForecastCard from "./insights/ForecastCard.jsx";
import BudgetCard from "./insights/BudgetCard.jsx";

export default function InsightsPanel({
  expenseByHierarchy,
  filteredEntries,
  monthFilter,
  entries,
  monthStartDay,
  totalIncome,
  totalExpense,
  expenseCategories,
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
  });

  const budgetItems = useMemo(
    () => calcBudgetStatus(filteredEntries, expenseCategories),
    [filteredEntries, expenseCategories]
  );

  return (
    <Card style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent style={{ display: "flex", flexDirection: "column", padding: "16px 20px 24px", flex: 1 }}>
        <InsightTabs activeCard={activeCard} onTabChange={setActiveCard} />
        <div className="hb-insights-body">
          {activeCard === "overview" && (
            <OverviewCard analytics={analytics.overview} />
          )}
          {activeCard === "budget" && (
            <BudgetCard budgetItems={budgetItems} monthFilter={monthFilter} monthStartDay={monthStartDay} />
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
