// src/hooks/useCategoryStats.js
import { useMemo } from "react";
import { calcExpenseByHierarchy, calcIncomeByHierarchy } from "../utils/budgetUtils.js";

export function useCategoryStats(filteredEntries, expenseCategories, incomeCategories, month) {
  const expenseByHierarchy = useMemo(
    () => calcExpenseByHierarchy(filteredEntries, expenseCategories, month),
    [filteredEntries, expenseCategories, month]
  );

  const incomeByHierarchy = useMemo(
    () => calcIncomeByHierarchy(filteredEntries, incomeCategories, month),
    [filteredEntries, incomeCategories, month]
  );

  return { expenseByHierarchy, incomeByHierarchy };
}
