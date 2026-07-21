import { useMemo } from "react";
import { getEntryFinancialMonth, getFinancialMonthRange, getFinancialMonth } from "../utils/financialMonthUtils.js";
import { toLocalISO } from "../utils/hbUtils.js";
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
  const todayStr = toLocalISO(today);
  const isCurrentMonth = getFinancialMonth(todayStr, startDay)?.yyyymm === monthFilter;

  const msPerDay = 86400000;
  const startDate = new Date(range.startDate + "T00:00:00");
  const endDate = new Date(range.endDate + "T00:00:00");
  const daysInMonth = Math.round((endDate - startDate) / msPerDay) + 1;

  const isFutureMonth = !isCurrentMonth && startDate > today;

  let daysElapsed;
  if (isCurrentMonth) {
    daysElapsed = Math.min(
      Math.round((today - startDate) / msPerDay) + 1,
      daysInMonth
    );
  } else if (isFutureMonth) {
    daysElapsed = 0;
  } else {
    daysElapsed = daysInMonth;
  }

  return {
    startDate: range.startDate,
    daysInMonth,
    daysElapsed,
    daysRemaining: Math.max(0, daysInMonth - daysElapsed),
    isCurrentMonth,
    isFutureMonth,
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
  totalSavingsTransfers,
  totalReserveTransfers,
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
      const key = toLocalISO(d);
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
      dailyTrendPct,
    };
  }, [filteredEntries, prevMonthBehavior, thirtyDayData]);

  const forecast = useMemo(() => {
    const noData = {
      projectedTotal: 0,
      projectedBalance: 0,
      freiBudget: 0,
      sollPerDay: 0,
      daysRemaining: 0,
      daysInMonth: 0,
      burnRate: 0,
      forecastData: [],
      trendVsPrevMonth: null,
      prevMonthExpense: null,
      safeToSpendPerDay: null,
      contextMessage: null,
      hasMonth: false,
      isCurrentMonth: false,
      isFutureMonth: false,
      savingsRate: null,
      trendVsPrevMonthPct: null,
    };

    if (!monthFilter) return noData;

    const monthInfo = getFinancialMonthInfo(monthFilter, monthStartDay);
    if (!monthInfo) return noData;
    const { startDate, daysInMonth, daysElapsed, daysRemaining, isCurrentMonth, isFutureMonth } = monthInfo;

    const expense = totalExpense ?? 0;
    const income = totalIncome ?? 0;
    const totalTransfers = (totalReserveTransfers ?? 0) + (totalSavingsTransfers ?? 0);
    const burnRate = daysElapsed > 0 ? expense / daysElapsed : 0;
    const projectedTotal = isCurrentMonth ? expense + burnRate * daysRemaining : expense;
    const projectedBalance = income - projectedTotal - totalTransfers;

    // Frei-Budget = was nach Rücklagen/Sparen für den Monat übrig bleibt.
    // Der Burn-Down läuft von diesem Startwert idealerweise auf 0.
    const freiBudget = income - totalTransfers;
    const sollPerDay = daysInMonth > 0 ? freiBudget / daysInMonth : 0;

    const safeToSpendPerDay =
      isCurrentMonth && daysRemaining > 0
        ? Math.max(0, income - expense - totalTransfers) / daysRemaining
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

    // Burn-Down: verbleibendes Frei-Budget pro Tag (Frei-Budget − kumulierte Ausgaben).
    // Prognose ab dem letzten Ist-Tag bei aktueller Burnrate; Soll-Pace linear auf 0.
    let running = 0;
    const forecastData = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      running += dailyMap.get(day) || 0;
      // Prognose beginnt am letzten Ist-Tag (day === daysElapsed), damit Ist- und
      // Prognose-Linie nahtlos aneinander anschliessen.
      const projected =
        isCurrentMonth && day >= daysElapsed
          ? freiBudget - (expense + burnRate * (day - daysElapsed))
          : null;
      return {
        day,
        actual: day <= daysElapsed ? freiBudget - running : null,
        projected,
        soll: freiBudget - sollPerDay * day,
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

    // Sparquote: Realisiert = Transfers auf Spar-Töpfe / Einnahmen (nur vergangene Monate)
    const savingsRate =
      !isCurrentMonth && !isFutureMonth && income > 0
        ? Math.round(((totalSavingsTransfers ?? 0) / income) * 100)
        : null;

    // Vormonat-Vergleich in % (nur wenn Vormonatsdaten vorhanden und kein Zukunftsmonat)
    const trendVsPrevMonthPct =
      prevMonthExpense > 0 && !isFutureMonth
        ? Math.round(((projectedTotal - prevMonthExpense) / prevMonthExpense) * 100)
        : null;

    return {
      projectedTotal,
      projectedBalance,
      freiBudget,
      sollPerDay,
      daysRemaining,
      daysInMonth,
      burnRate,
      forecastData,
      trendVsPrevMonth,
      prevMonthExpense,
      safeToSpendPerDay,
      contextMessage,
      hasMonth: true,
      isCurrentMonth,
      isFutureMonth,
      savingsRate,
      trendVsPrevMonthPct,
    };
  }, [filteredEntries, entries, monthFilter, monthStartDay, totalIncome, totalExpense, totalReserveTransfers, totalSavingsTransfers]);

  return { overview, behavior, forecast };
}
