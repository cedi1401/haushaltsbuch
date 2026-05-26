import { useMemo } from "react";
import { getEntryFinancialMonth, getFinancialMonthRange, getFinancialMonth } from "../utils/financialMonthUtils.js";
import { BURNRATE_DELTA_THRESHOLD_PCT } from "../utils/constants.js";

const DAY_NAMES_MON_FIRST = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// JS getDay(): 0=So,1=Mo,...,6=Sa → Montag-zuerst-Indizes
const MON_FIRST_DOW = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES_FULL_MON = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function getPrevMonthKey(monthFilter) {
  if (!monthFilter) return null;
  const [y, m] = monthFilter.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}

// Liefert Länge und Verlaufsstatus eines finanziellen Monats unter Berücksichtigung
// des konfigurierten Monatsbeginns.
function getFinancialMonthInfo(monthFilter, monthStartDay) {
  if (!monthFilter) return null;
  const startDay = monthStartDay ?? 1;
  const range = getFinancialMonthRange(monthFilter, startDay);
  if (!range) return null;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const isCurrentMonth = getFinancialMonth(todayStr, startDay)?.yyyymm === monthFilter;

  const msPerDay = 86400000;
  const startDate = new Date(range.startDate + "T00:00:00");
  const endDate = new Date(range.endDate + "T00:00:00");
  const daysInMonth = Math.round((endDate - startDate) / msPerDay) + 1;

  let daysElapsed;
  if (isCurrentMonth) {
    daysElapsed = Math.min(
      Math.round((today - startDate) / msPerDay) + 1,
      daysInMonth
    );
  } else {
    daysElapsed = daysInMonth;
  }

  return {
    startDate: range.startDate,
    daysInMonth,
    daysElapsed,
    daysRemaining: Math.max(0, daysInMonth - daysElapsed),
    isCurrentMonth,
  };
}

export function useFinanceAnalytics({
  filteredEntries,
  expenseByHierarchy,
  monthFilter,
  entries,
  monthStartDay,
  totalIncome,
  totalExpense,
}) {
  // Vormonat-Ausgaben pro Kategorie (für Overview MoM)
  const prevMonthCatMap = useMemo(() => {
    const prevKey = getPrevMonthKey(monthFilter);
    if (!prevKey) return new Map();
    const map = new Map();
    for (const e of (entries || [])) {
      if (e.kind !== "expense" || e.source !== "month") continue;
      if (getEntryFinancialMonth(e, monthStartDay ?? 1) !== prevKey) continue;
      const key = e.categoryId || e.category;
      map.set(key, (map.get(key) || 0) + Number(e.amount || 0));
    }
    return map;
  }, [entries, monthFilter, monthStartDay]);

  // Vormonat-Buchungen (für Behavior MoM)
  const prevMonthBehavior = useMemo(() => {
    const prevKey = getPrevMonthKey(monthFilter);
    if (!prevKey) return { avgBookingsPerDay: null, totalBookings: 0 };
    const prevExpenses = (entries || []).filter(
      (e) =>
        e.kind === "expense" &&
        e.source === "month" &&
        getEntryFinancialMonth(e, monthStartDay ?? 1) === prevKey
    );
    const prevActiveDays = new Set(prevExpenses.map((e) => e.date).filter(Boolean));
    return {
      avgBookingsPerDay:
        prevActiveDays.size > 0 ? prevExpenses.length / prevActiveDays.size : null,
      totalBookings: prevExpenses.length,
    };
  }, [entries, monthFilter, monthStartDay]);

  // 30-Tage-Sparkline (letzte 30 Kalendertage aus entries)
  const thirtyDayData = useMemo(() => {
    const today = new Date();
    const dailyMap = new Map();
    for (const e of (entries || [])) {
      if (e.kind !== "expense" || e.source !== "month" || !e.date) continue;
      dailyMap.set(e.date, (dailyMap.get(e.date) || 0) + Number(e.amount || 0));
    }
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - 29 + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, amount: dailyMap.get(key) || 0 };
    });
  }, [entries]);

  const overview = useMemo(() => {
    const expenses = (filteredEntries || []).filter(
      (e) => e.kind === "expense" && e.source === "month"
    );
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    const monthInfo = monthFilter ? getFinancialMonthInfo(monthFilter, monthStartDay) : null;
    const daysElapsed = monthInfo?.daysElapsed ?? 30;

    const avgDailyExpense = daysElapsed > 0 ? expenseTotal / daysElapsed : 0;

    const top5 = (expenseByHierarchy || []).slice(0, 5).map((cat) => {
      const prev = prevMonthCatMap.get(cat.id) || 0;
      let momDelta = null;
      if (prev > 0) {
        const pct = ((cat.value - prev) / prev) * 100;
        momDelta = {
          pct,
          dir: Math.abs(pct) < 2 ? "flat" : pct > 0 ? "up" : "down",
        };
      }
      return {
        name: cat.name,
        value: cat.value,
        color: cat.color,
        pct: expenseTotal > 0 ? (cat.value / expenseTotal) * 100 : 0,
        momDelta,
      };
    });

    const biggestMomChange =
      top5.filter((c) => c.momDelta !== null).sort(
        (a, b) => Math.abs(b.momDelta.pct) - Math.abs(a.momDelta.pct)
      )[0] ?? null;

    return { top5, avgDailyExpense, biggestMomChange, daysElapsed };
  }, [filteredEntries, expenseByHierarchy, monthFilter, monthStartDay, prevMonthCatMap]);

  const behavior = useMemo(() => {
    const expenses = (filteredEntries || []).filter(
      (e) => e.kind === "expense" && e.source === "month"
    );

    // Montag-zuerst: Buckets [Mo,Di,Mi,Do,Fr,Sa,So]
    const dayTotals = new Array(7).fill(0);
    const activeDays = new Set();

    for (const e of expenses) {
      if (!e.date) continue;
      const dow = new Date(e.date + "T12:00:00").getDay(); // 0=So..6=Sa
      const monFirstIdx = MON_FIRST_DOW.indexOf(dow);
      dayTotals[monFirstIdx] += 1;
      activeDays.add(e.date);
    }

    const mostActiveMFIdx = dayTotals.indexOf(Math.max(...dayTotals));
    const dailySpendData = DAY_NAMES_MON_FIRST.map((name, i) => ({
      day: name,
      count: dayTotals[i],
    }));

    const avgBookingsPerDay =
      activeDays.size > 0 ? expenses.length / activeDays.size : 0;

    const catCount = {};
    for (const e of expenses) {
      if (e.category) catCount[e.category] = (catCount[e.category] || 0) + 1;
    }
    const topCatEntry = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
    const topCategory = topCatEntry ? topCatEntry[0] : null;
    const topCategoryPct =
      topCatEntry && expenses.length > 0
        ? Math.round((topCatEntry[1] / expenses.length) * 100)
        : null;

    // Wochenvergleich: letzte 7 Kalendertage vs. davor 7 Tage (aus allen Einträgen)
    const today = new Date();
    const toStr = (d) => d.toISOString().slice(0, 10);
    const todayStr = toStr(today);
    const d6 = new Date(today); d6.setDate(today.getDate() - 6);
    const d7 = new Date(today); d7.setDate(today.getDate() - 7);
    const d13 = new Date(today); d13.setDate(today.getDate() - 13);
    const last7Count = (entries || []).filter(
      (e) => e.kind === "expense" && e.source === "month" && e.date >= toStr(d6) && e.date <= todayStr
    ).length;
    const prev7Count = (entries || []).filter(
      (e) => e.kind === "expense" && e.source === "month" && e.date >= toStr(d13) && e.date <= toStr(d7)
    ).length;
    let weeklyInsight = null;
    if (prev7Count > 0) {
      const diff = last7Count - prev7Count;
      if (diff > 0) weeklyInsight = `${diff} mehr als letzte Woche`;
      else if (diff < 0) weeklyInsight = `${Math.abs(diff)} weniger als letzte Woche`;
      else weeklyInsight = "Gleich viele wie letzte Woche";
    }

    const first15Avg = thirtyDayData.slice(0, 15).reduce((s, d) => s + d.amount, 0) / 15;
    const last15Avg = thirtyDayData.slice(15).reduce((s, d) => s + d.amount, 0) / 15;
    const dailyTrendPct = first15Avg > 0 ? ((last15Avg - first15Avg) / first15Avg) * 100 : null;

    return {
      dailySpendData,
      mostActiveDay: expenses.length > 0 ? DAY_NAMES_FULL_MON[mostActiveMFIdx] : "–",
      avgBookingsPerDay,
      topCategory,
      topCategoryPct,
      totalBookings: expenses.length,
      prevAvgBookingsPerDay: prevMonthBehavior.avgBookingsPerDay,
      prevTotalBookings: prevMonthBehavior.totalBookings,
      thirtyDayData,
      weeklyInsight,
      dailyTrendPct,
    };
  }, [filteredEntries, prevMonthBehavior, thirtyDayData, entries]);

  const forecast = useMemo(() => {
    const noData = {
      projectedTotal: 0,
      projectedBalance: 0,
      daysRemaining: 0,
      burnRate: 0,
      forecastData: [],
      trendVsPrevMonth: null,
      prevMonthExpense: null,
      safeToSpendPerDay: null,
      contextMessage: null,
      hasMonth: false,
    };

    if (!monthFilter) return noData;

    const monthInfo = getFinancialMonthInfo(monthFilter, monthStartDay);
    if (!monthInfo) return noData;
    const { startDate, daysInMonth, daysElapsed, daysRemaining, isCurrentMonth } = monthInfo;

    const expense = totalExpense ?? 0;
    const income = totalIncome ?? 0;
    const burnRate = daysElapsed > 0 ? expense / daysElapsed : 0;
    const projectedTotal = isCurrentMonth ? expense + burnRate * daysRemaining : expense;
    const projectedBalance = income - projectedTotal;

    const safeToSpendPerDay =
      isCurrentMonth && daysRemaining > 0
        ? Math.max(0, income - expense) / daysRemaining
        : null;

    // Tagesgenaue Kumulation für Sparkline (Tag 1 = erster Tag des Finanzmonats)
    const msPerDay = 86400000;
    const financialMonthStart = new Date(startDate + "T00:00:00");
    const dailyMap = new Map();
    for (const e of (filteredEntries || [])) {
      if (e.kind !== "expense" || e.source !== "month" || !e.date) continue;
      const entryDate = new Date(e.date + "T00:00:00");
      const dayIndex = Math.round((entryDate - financialMonthStart) / msPerDay) + 1;
      if (dayIndex < 1 || dayIndex > daysInMonth) continue;
      dailyMap.set(dayIndex, (dailyMap.get(dayIndex) || 0) + Number(e.amount || 0));
    }

    let running = 0;
    const forecastData = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      running += dailyMap.get(day) || 0;
      return {
        day,
        actual: day <= daysElapsed ? running : null,
        projected:
          isCurrentMonth && day > daysElapsed
            ? expense + burnRate * (day - daysElapsed)
            : null,
      };
    });

    // Vormonats-Vergleich
    const prevKey = getPrevMonthKey(monthFilter);
    const prevMonthInfo = prevKey ? getFinancialMonthInfo(prevKey, monthStartDay) : null;
    const daysInPrevMonth = prevMonthInfo?.daysInMonth ?? 30;

    const prevMonthExpense = (entries || [])
      .filter(
        (e) =>
          e.kind === "expense" &&
          e.source === "month" &&
          getEntryFinancialMonth(e, monthStartDay ?? 1) === prevKey
      )
      .reduce((s, e) => s + Number(e.amount || 0), 0);

    const trendVsPrevMonth =
      prevMonthExpense > 0 ? projectedTotal - prevMonthExpense : null;

    // Kontext-Heuristik (Burnrate vs. Vormonat)
    const prevBurnRate =
      prevMonthExpense > 0 ? prevMonthExpense / daysInPrevMonth : null;
    const burnRateDeltaPct =
      prevBurnRate && prevBurnRate > 0
        ? ((burnRate - prevBurnRate) / prevBurnRate) * 100
        : null;

    let contextMessage = null;
    if (burnRateDeltaPct !== null && isCurrentMonth) {
      if (burnRateDeltaPct > BURNRATE_DELTA_THRESHOLD_PCT) {
        contextMessage = `Du liegst ${Math.round(burnRateDeltaPct)}% über deinem Vormonatsniveau`;
      } else if (burnRateDeltaPct < -BURNRATE_DELTA_THRESHOLD_PCT) {
        contextMessage = `Du liegst ${Math.round(Math.abs(burnRateDeltaPct))}% unter deinem Vormonatsniveau`;
      } else {
        contextMessage = "Du liegst im Bereich deines üblichen Niveaus";
      }
    }

    return {
      projectedTotal,
      projectedBalance,
      daysRemaining,
      burnRate,
      forecastData,
      trendVsPrevMonth,
      prevMonthExpense,
      safeToSpendPerDay,
      contextMessage,
      hasMonth: true,
      isCurrentMonth,
    };
  }, [filteredEntries, entries, monthFilter, monthStartDay, totalIncome, totalExpense]);

  return { overview, behavior, forecast };
}
