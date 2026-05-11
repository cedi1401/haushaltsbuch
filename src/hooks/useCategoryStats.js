// src/hooks/useCategoryStats.js
import { useMemo } from "react";
import { calcExpenseByHierarchy, calcIncomeByHierarchy } from "../utils/budgetUtils.js";

export function useCategoryStats(filteredEntries, expenseCategories, incomeCategories, month, monthStartDay = 1) {
  const expenseByHierarchy = useMemo(
    () => calcExpenseByHierarchy(filteredEntries, expenseCategories, month, monthStartDay),
    [filteredEntries, expenseCategories, month, monthStartDay]
  );

  const incomeByHierarchy = useMemo(
    () => calcIncomeByHierarchy(filteredEntries, incomeCategories, month, monthStartDay),
    [filteredEntries, incomeCategories, month, monthStartDay]
  );

  return { expenseByHierarchy, incomeByHierarchy };
}
