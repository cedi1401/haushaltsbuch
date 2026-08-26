import { useMemo } from "react";
import {
  buildFixedCostMonthlyData,
  buildItemTrends,
  detectFixedCostChanges,
} from "../utils/fixedCostTrendUtils.js";
import { monthlyRate, isSinkingFund } from "../utils/fixedCostUtils.js";
import { fixedCostKind } from "../utils/hbUtils.js";

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
    // Die Kostenregel bestimmt die Grundmenge aller Kennzahlen dieser Karte:
    // Ausgaben-Fixkosten und Rücklagen (Transfer MIT Turnus) zählen, freies
    // Sparen (Transfer OHNE Turnus) zählt nicht. Die Positionen bleiben in der
    // Übersichtsliste sichtbar und tragen dort eine eigene Pille — nur in die
    // Kennzahlen gehen sie nicht ein.
    const all = (recurringExpenses || []).filter(
      (r) => fixedCostKind(r) === "expense" || isSinkingFund(r)
    );
    // monthlyRate() statt r.amount: Bei einer Rücklage mit Turnus ist `amount`
    // der Rechnungsbetrag des ganzen Zyklus, nicht der Monatsbetrag.
    const configuredTotal = all.reduce((s, r) => s + monthlyRate(r), 0);

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

    // Der Hook liefert bewusst ein aufbereitetes Objekt statt des Roh-Items:
    // Läse der Renderer weiterhin `.amount`, zeigte die Kachel bei einer
    // Jahresrechnung stumm den zwölffachen Wert (Befund C3).
    // Ebenfalls aus der gefilterten Menge: Eine Position, die in keine Kennzahl
    // eingeht, darf nicht als teuerste Belastung ausgewiesen werden.
    const topItem = [...all].sort((a, b) => monthlyRate(b) - monthlyRate(a))[0] ?? null;
    const mostExpensive = topItem
      ? { name: topItem.name, monthlyAmount: monthlyRate(topItem) }
      : null;

    return { configuredTotal, bookedLast, momDelta, avgShare, activeCount: all.length, mostExpensive };
  }, [fixedMonthly, recurringExpenses]);

  // itemTrends bleibt absichtlich intern — außerhalb wird nur `changes` gebraucht.
  return { fixedMonthly, changes, kpis };
}
