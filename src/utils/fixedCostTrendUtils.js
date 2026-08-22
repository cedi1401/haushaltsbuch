import { getEntryFinancialMonth } from "./financialMonthUtils.js";

// Matching-Strategie: entry.recurringId === recurringExpense.id — die
// Herkunftskennung, die "Jetzt buchen" setzt (buildEntryFromItem). Bewusst OHNE
// Fallback auf den Notiztext: eine umbenannte Position behält so ihre Historie,
// und ein manuell erfasster Eintrag mit passendem Namen zählt nicht mit.

function buildMonthItemMap(entries, recurringExpenses, monthStartDay) {
  const ids = new Set((recurringExpenses || []).map((r) => r.id).filter(Boolean));
  const map = new Map(); // ym → Map<recurringId, amount>

  for (const e of entries || []) {
    if (!e.recurringId || !ids.has(e.recurringId)) continue;
    // Ausgaben nur aus dem Monatsbudget: eine aus einem Topf bezahlte Ausgabe
    // steckt nicht im Ausgaben-Nenner (m.expense) und würde den Anteilswert
    // überhöhen.
    if (e.kind === "expense") {
      if (e.source !== "month") continue;
    } else if (e.kind !== "transfer") {
      continue;
    }
    const ym = getEntryFinancialMonth(e, monthStartDay);
    if (!ym) continue;
    if (!map.has(ym)) map.set(ym, new Map());
    const inner = map.get(ym);
    inner.set(e.recurringId, (inner.get(e.recurringId) || 0) + Number(e.amount || 0));
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
    id: r.id,
    name: r.name,
    data: months.map((ym) => ({
      month: ym,
      amount: filteredMap.get(ym)?.get(r.id) ?? null,
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
      newItems.push({ id: item.id, name: item.name, firstMonth: firstActive });
    }

    if (lastActive < lastMonth) {
      droppedItems.push({ id: item.id, name: item.name, lastMonth: lastActive });
    }
  }

  return { newItems, droppedItems };
}
