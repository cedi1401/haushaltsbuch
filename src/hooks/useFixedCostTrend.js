import { useMemo } from "react";
import {
  buildFixedCostMonthlyData,
  buildItemTrends,
  detectFixedCostChanges,
} from "../utils/fixedCostTrendUtils.js";

export function useFixedCostTrend({ entries, recurringExpenses, monthly, monthStartDay }) {
  const fixedMonthly = useMemo(
    () => buildFixedCostMonthlyData(entries, recurringExpenses, monthly, monthStartDay),
    [entries, recurringExpenses, monthly, monthStartDay]
  );

  const itemTrends = useMemo(
    () => buildItemTrends(entries, recurringExpenses, monthly, monthStartDay),
    [entries, recurringExpenses, monthly, monthStartDay]
  );

  const changes = useMemo(
    () => detectFixedCostChanges(itemTrends, monthly),
    [itemTrends, monthly]
  );

  const kpis = useMemo(() => {
    const active = (recurringExpenses || []).filter((r) => r.active !== false);
    const configuredTotal = active.reduce((s, r) => s + Number(r.amount || 0), 0);

    const lastMonth = fixedMonthly[fixedMonthly.length - 1] ?? null;
    const prevMonth = fixedMonthly.length > 1 ? fixedMonthly[fixedMonthly.length - 2] : null;

    const bookedLast = lastMonth?.fixedTotal ?? 0;
    const bookedPrev = prevMonth?.fixedTotal ?? 0;
    const momDelta =
      bookedPrev > 0 ? ((bookedLast - bookedPrev) / bookedPrev) * 100 : null;

    const filteredShares = fixedMonthly.filter((m) => m.share != null);
    const avgShare =
      filteredShares.length > 0
        ? filteredShares.reduce((s, m) => s + m.share, 0) / filteredShares.length
        : null;

    const mostExpensive = active.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0] ?? null;

    return { configuredTotal, bookedLast, momDelta, avgShare, activeCount: active.length, mostExpensive };
  }, [fixedMonthly, recurringExpenses]);

  return { fixedMonthly, itemTrends, changes, kpis };
}
