import { useMemo } from "react";

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function useDailyHeatmap({ entries = [], range = 12 }) {
  return useMemo(() => {
    if (!entries.length) return { months: [], monthMeta: [], dayMap: new Map(), minBalance: 0, maxBalance: 0 };

    // 1. Aggregate entries by calendar date (all entries, not range-filtered yet)
    const rawDayMap = new Map();
    for (const e of entries) {
      if (!e.date) continue;
      const dateStr = String(e.date).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

      const prev = rawDayMap.get(dateStr) || {
        net: 0, income: 0, expense: 0, transfer: 0, topEntry: null,
      };
      const amt = Number(e.amount || 0);

      if (e.kind === "income") { prev.income += amt; prev.net += amt; }
      else if (e.kind === "expense") { prev.expense += amt; prev.net -= amt; }
      else if (e.kind === "transfer") { prev.transfer += amt; prev.net -= amt; }

      if (!prev.topEntry || amt > Number(prev.topEntry.amount || 0)) prev.topEntry = e;
      rawDayMap.set(dateStr, prev);
    }

    // 2. Compute running balance across ALL dates (chronological) — regardless of range.
    //    This ensures the balance in the visible range is historically accurate.
    const allDates = Array.from(rawDayMap.keys()).sort();
    let runningBalance = 0;
    const balanceMap = new Map();
    for (const date of allDates) {
      const data = rawDayMap.get(date);
      runningBalance += data.net;
      balanceMap.set(date, { ...data, balance: runningBalance });
    }

    // 3. Determine months to display based on range
    const allMonths = Array.from(new Set(allDates.map((d) => d.slice(0, 7)))).sort();
    const months = range > 0 ? allMonths.slice(-range) : allMonths;
    const monthMeta = months.map((ym) => ({ ym, days: daysInMonth(ym) }));

    // 4. Build display dayMap — only days in visible range
    const monthSet = new Set(months);
    const dayMap = new Map();
    for (const [date, data] of balanceMap) {
      if (monthSet.has(date.slice(0, 7))) dayMap.set(date, data);
    }

    // 5. Balance range for color scaling (relative within visible period)
    let minBalance = Infinity;
    let maxBalance = -Infinity;
    for (const { balance } of dayMap.values()) {
      if (balance < minBalance) minBalance = balance;
      if (balance > maxBalance) maxBalance = balance;
    }
    if (!dayMap.size) { minBalance = 0; maxBalance = 0; }

    return { months, monthMeta, dayMap, minBalance, maxBalance };
  }, [entries, range]);
}
