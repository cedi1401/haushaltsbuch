import { getEntryFinancialMonth } from "./financialMonthUtils.js";

// Matching-Strategie: entry.note === recurringExpense.name (gesetzt durch "Jetzt buchen")
// Sekundär: entry.kind + entry.categoryId zur Bestätigung

function buildMonthItemMap(entries, recurringExpenses, monthStartDay) {
  const names = new Set((recurringExpenses || []).map((r) => r.name).filter(Boolean));
  const map = new Map(); // ym → Map<name, amount>

  for (const e of entries || []) {
    if (!e.note || !names.has(e.note)) continue;
    if (e.kind !== "expense" && e.kind !== "transfer") continue;
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;
    if (!map.has(ym)) map.set(ym, new Map());
    const inner = map.get(ym);
    inner.set(e.note, (inner.get(e.note) || 0) + Number(e.amount || 0));
  }

  return map;
}

// Gibt pro Monat: fixedTotal (tatsächlich gebucht), share (% der Gesamtausgaben)
export function buildFixedCostMonthlyData(entries, recurringExpenses, monthlyAggregates, monthStartDay) {
  const monthItemMap = buildMonthItemMap(entries, recurringExpenses, monthStartDay);

  return (monthlyAggregates || []).map((m) => {
    const inner = monthItemMap.get(m.month);
    const fixedTotal = inner ? Array.from(inner.values()).reduce((s, v) => s + v, 0) : 0;
    const totalExpense = m.expense || 0;
    const share = totalExpense > 0 ? (fixedTotal / totalExpense) * 100 : null;
    return {
      month: m.month,
      label: m.label,
      fixedTotal,
      totalExpense,
      share,
    };
  });
}

// Gibt pro recurringExpense den monatlichen Betrag zurück (null = nicht gebucht)
export function buildItemTrends(entries, recurringExpenses, monthlyAggregates, monthStartDay) {
  const months = (monthlyAggregates || []).map((m) => m.month);
  const monthSet = new Set(months);
  const monthItemMap = buildMonthItemMap(entries, recurringExpenses, monthStartDay);

  // Nur Monate im sichtbaren Bereich berücksichtigen
  const filteredMap = new Map();
  for (const [ym, inner] of monthItemMap) {
    if (monthSet.has(ym)) filteredMap.set(ym, inner);
  }

  return (recurringExpenses || []).map((r) => ({
    name: r.name,
    categoryId: r.categoryId,
    configuredAmount: Number(r.amount || 0),
    data: months.map((ym) => ({
      month: ym,
      amount: filteredMap.get(ym)?.get(r.name) ?? null,
    })),
  }));
}

// Erkennt Fixkosten, die im Zeitraum neu aufgetaucht oder weggefallen sind
export function detectFixedCostChanges(itemTrends, monthlyAggregates) {
  if (!monthlyAggregates?.length) return { newItems: [], droppedItems: [] };

  const firstMonth = monthlyAggregates[0].month;
  const lastMonth = monthlyAggregates[monthlyAggregates.length - 1].month;

  const newItems = [];
  const droppedItems = [];

  for (const item of itemTrends || []) {
    const activeMonths = item.data
      .filter((d) => d.amount != null && d.amount > 0)
      .map((d) => d.month);

    if (!activeMonths.length) continue;

    const firstActive = activeMonths[0];
    const lastActive = activeMonths[activeMonths.length - 1];

    if (firstActive > firstMonth) {
      newItems.push({ name: item.name, firstMonth: firstActive });
    }

    if (lastActive < lastMonth) {
      droppedItems.push({ name: item.name, lastMonth: lastActive });
    }
  }

  return { newItems, droppedItems };
}
