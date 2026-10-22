import { getEntryFinancialMonth } from "./financialMonthUtils.js";
import { isSinkingFund } from "./fixedCostUtils.js";

// Matching-Strategie: Ausgaben über entry.recurringId === recurringExpense.id —
// die Herkunftskennung, die "Jetzt buchen" setzt (buildEntryFromItem). Bewusst
// OHNE Fallback auf den Notiztext: eine umbenannte Position behält so ihre
// Historie, und ein manuell erfasster Eintrag mit passendem Namen zählt nicht mit.
//
// Transfers über entry.transferCategoryId: Seit Schema 7 ist der Zweck selbst
// die Position (transferCategoryUtils.purposeToFixedItem, id = Zweck-ID). Jede
// Einzahlung auf den Zweck zählt — auch eine Sondereinzahlung, sie gehört
// bewusst zur Position.

function matchId(e) {
  if (e.kind === "transfer") return e.transferCategoryId || null;
  return e.recurringId || null;
}

// Index über die Positionen: die Kostenregel braucht nicht nur die ID, sondern
// das Item selbst (Turnus).
function buildItemById(recurringExpenses) {
  return new Map((recurringExpenses || []).filter((r) => r?.id).map((r) => [r.id, r]));
}

function buildMonthItemMap(entries, itemById, monthStartDay) {
  const map = new Map(); // ym → Map<Positions-ID, amount>

  for (const e of entries || []) {
    const id = matchId(e);
    if (!id) continue;
    const item = itemById.get(id);
    if (!item) continue;
    // Ausgaben nur aus dem Monatsbudget: eine aus einem Topf bezahlte Ausgabe
    // steckt nicht im Ausgaben-Nenner (m.expense) und würde den Anteilswert
    // überhöhen.
    if (e.kind === "expense") {
      if (e.source !== "month") continue;
    } else if (e.kind === "transfer") {
      // Die Kostenregel: Nur eine Rückstellung (Transfer MIT Turnus) ist eine
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
    inner.set(id, (inner.get(id) || 0) + Number(e.amount || 0));
  }

  return map;
}

/**
 * Gibt pro Monat die gebuchte Fixkostenbelastung und ihren Anteil zurück.
 *
 * Die Bezugsgröße des Anteils ist die **Gesamtbelastung** des Monats, nicht
 * mehr allein die Ausgaben: `basis = m.expense + m.savingsExpense + sinkingTotal`. Vorher stand im
 * Zähler die Rückstellung, im Nenner aber nur die Ausgaben — der Anteil war
 * systematisch überhöht und konnte 100 % überschreiten. Eine Rückstellung ist ein
 * Transfer, keine Ausgabe; sie muss in beiden Seiten des Bruchs stehen.
 *
 * Die spätere Rechnungszahlung erzeugt dabei keine Doppelzählung: Sie wird als
 * Entnahme aus dem Topf gebucht (`kind: "expense", source: "pot"`) und fällt
 * damit aus Zähler wie Nenner heraus.
 *
 * `m.savingsExpense` (Ausgaben in „Sparen und Anlegen“) zählt in der
 * Monatsreihe unter Sparen, nicht unter `m.expense`. Ein Sparplan als
 * Fixkosten-Position steht aber im Zähler — deshalb gehört er auch in die
 * Basis, sonst wäre der Anteil wieder überhöht.
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
    const basis = (m.expense || 0) + (m.savingsExpense || 0) + sinkingTotal;
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
