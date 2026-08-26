import { getEntryFinancialMonth } from "./financialMonthUtils.js";
import { isSinkingFund } from "./fixedCostUtils.js";

// Matching-Strategie: entry.recurringId === recurringExpense.id — die
// Herkunftskennung, die "Jetzt buchen" setzt (buildEntryFromItem). Bewusst OHNE
// Fallback auf den Notiztext: eine umbenannte Position behält so ihre Historie,
// und ein manuell erfasster Eintrag mit passendem Namen zählt nicht mit.

// Index über die Positionen: die Kostenregel braucht nicht nur die ID, sondern
// das Item selbst (Turnus).
function buildItemById(recurringExpenses) {
  return new Map((recurringExpenses || []).filter((r) => r?.id).map((r) => [r.id, r]));
}

function buildMonthItemMap(entries, itemById, monthStartDay) {
  const map = new Map(); // ym → Map<recurringId, amount>

  for (const e of entries || []) {
    if (!e.recurringId) continue;
    const item = itemById.get(e.recurringId);
    if (!item) continue;
    // Ausgaben nur aus dem Monatsbudget: eine aus einem Topf bezahlte Ausgabe
    // steckt nicht im Ausgaben-Nenner (m.expense) und würde den Anteilswert
    // überhöhen.
    if (e.kind === "expense") {
      if (e.source !== "month") continue;
    } else if (e.kind === "transfer") {
      // Die Kostenregel: Nur eine Rücklage (Transfer MIT Turnus) ist eine
      // Belastung. Ein Transfer ohne Turnus ist freies Sparen — er zählt weder
      // in die Gebucht-Linie noch in den Anteilswert.
      if (!isSinkingFund(item)) continue;
    } else {
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

/**
 * Gibt pro Monat die gebuchte Fixkostenbelastung und ihren Anteil zurück.
 *
 * Die Bezugsgröße des Anteils ist die **Gesamtbelastung** des Monats, nicht
 * mehr allein die Ausgaben: `basis = m.expense + sinkingTotal`. Vorher stand im
 * Zähler die Rücklage, im Nenner aber nur die Ausgaben — der Anteil war
 * systematisch überhöht und konnte 100 % überschreiten. Eine Rücklage ist ein
 * Transfer, keine Ausgabe; sie muss in beiden Seiten des Bruchs stehen.
 *
 * Die spätere Rechnungszahlung erzeugt dabei keine Doppelzählung: Sie wird als
 * Entnahme aus dem Topf gebucht (`kind: "expense", source: "pot"`) und fällt
 * damit aus Zähler wie Nenner heraus.
 *
 * @returns {Array<{month: string, label: string, fixedTotal: number,
 *   expenseFixedTotal: number, sinkingTotal: number, basis: number,
 *   share: number|null}>}
 */
export function buildFixedCostMonthlyData(entries, recurringExpenses, monthlyAggregates, monthStartDay) {
  const itemById = buildItemById(recurringExpenses);
  const monthItemMap = buildMonthItemMap(entries, itemById, monthStartDay);

  return (monthlyAggregates || []).map((m) => {
    const inner = monthItemMap.get(m.month);
    let expenseFixedTotal = 0;
    let sinkingTotal = 0;
    if (inner) {
      for (const [id, amount] of inner) {
        if (isSinkingFund(itemById.get(id))) sinkingTotal += amount;
        else expenseFixedTotal += amount;
      }
    }
    // fixedTotal behält seinen Namen: Chart-Linie und Sparkline lesen ihn.
    const fixedTotal = expenseFixedTotal + sinkingTotal;
    const basis = (m.expense || 0) + sinkingTotal;
    const share = basis > 0 ? (fixedTotal / basis) * 100 : null;
    return {
      month: m.month,
      label: m.label,
      fixedTotal,
      expenseFixedTotal,
      sinkingTotal,
      basis,
      share,
    };
  });
}

// Gibt pro recurringExpense den monatlichen Betrag zurück (null = nicht gebucht)
export function buildItemTrends(entries, recurringExpenses, monthlyAggregates, monthStartDay) {
  const months = (monthlyAggregates || []).map((m) => m.month);
  const monthSet = new Set(months);
  const monthItemMap = buildMonthItemMap(entries, buildItemById(recurringExpenses), monthStartDay);

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
