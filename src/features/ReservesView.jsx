import React, { useMemo } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { Card, CardContent, Button } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import { IconReserves, IconInfo } from "../components/icons.jsx";
import { fixedCostKind, todayISO } from "../utils/hbUtils.js";
import { isSinkingFund, buildSinkingFundRows } from "../utils/fixedCostUtils.js";
import { getFinancialMonth } from "../utils/financialMonthUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { buildReserveColumns } from "./reserves/reserveColumns.jsx";

/**
 * Rücklagen-View — Überwachung der Transfer-Fixkosten mit Turnus.
 *
 * Rollenteilung zur Fixkosten-View: dort wird angelegt und monatlich gebucht,
 * hier wird überwacht und der Zyklus abgeschlossen. Beide Views lesen dieselben
 * `recurringExpenses`; dieser hier zeigt ausschliesslich die Transfer-Positionen.
 */
export default function ReservesView({
  activeBook,
  entries,
  monthStartDay = 1,
  onNavigateToFixed,
}) {
  const fmt = useFmt();
  const recurringExpenses = activeBook?.recurringExpenses || EMPTY_ARRAY;
  const pots = activeBook?.pots || EMPTY_ARRAY;
  const fixedCostGroups = activeBook?.fixedCostGroups || EMPTY_ARRAY;

  const items = useMemo(
    () => recurringExpenses.filter((r) => fixedCostKind(r) === "transfer"),
    [recurringExpenses]
  );

  // Der Hinweisstreifen gilt genau dem Zustand, den die Turnus-Umstellung
  // erzeugt: Positionen vorhanden, aber keine einzige mit Zyklus. Er
  // verschwindet mit der ersten nachgepflegten Position von selbst.
  const hasAnyTurnus = useMemo(() => items.some(isSinkingFund), [items]);

  // Gebuchte Beträge des laufenden Finanzmonats je Position. Zugeordnet wird
  // über `recurringId` — der Notiztext ist seit P2 nicht mehr die Grundlage,
  // eine umbenannte Position behält so ihre Historie.
  const bookedByRecurringId = useMemo(() => {
    const currentMonth = getFinancialMonth(todayISO(), monthStartDay)?.yyyymm;
    const map = new Map();
    if (!currentMonth) return map;
    for (const e of entries || []) {
      if (e.kind !== "transfer" || !e.recurringId) continue;
      if (getFinancialMonth(e.date, monthStartDay)?.yyyymm !== currentMonth) continue;
      map.set(e.recurringId, (map.get(e.recurringId) || 0) + Number(e.amount || 0));
    }
    return map;
  }, [entries, monthStartDay]);

  const rows = useMemo(
    () =>
      buildSinkingFundRows(items, entries, { monthStartDay }).map((row) => ({
        ...row,
        id: row.item.id,
        bookedThisMonth: bookedByRecurringId.get(row.item.id) ?? null,
      })),
    [items, entries, monthStartDay, bookedByRecurringId]
  );

  const columns = useMemo(() => {
    const potNameById = new Map(pots.map((p) => [p.id, p.name]));
    const groupNameById = new Map(fixedCostGroups.map((g) => [g.id, g.name]));
    return buildReserveColumns({ fmt, potNameById, groupNameById });
  }, [fmt, pots, fixedCostGroups]);

  // Eine einzige Sektion ohne Band — die Gliederung nach Gruppen kommt in P7.1.
  const sections = useMemo(
    () => [{ key: "__ungrouped", label: null, accent: null, meta: null, rows }],
    [rows]
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="hb-empty">
            <div className="hb-empty-icon"><IconReserves /></div>
            <div className="hb-empty-title">Noch keine Rücklagen</div>
            <div className="hb-empty-text">
              Rücklagen entstehen aus Fixkosten vom Typ Transfer: Du legst monatlich einen
              Teilbetrag in einen Topf, bis die Rechnung fällig wird. Sobald eine solche
              Position angelegt ist, erscheint sie hier.
            </div>
            <Button onClick={() => onNavigateToFixed?.()}>Zur Fixkosten-Ansicht</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {!hasAnyTurnus && (
          <div className="hb-infobar" role="status">
            <div className="hb-infobar-icon"><IconInfo /></div>
            <div className="hb-infobar-content">
              <div className="hb-infobar-title">Noch keine Position mit Turnus</div>
              <div className="hb-infobar-message">
                Trag bei einer Transfer-Position Turnus und nächste Fälligkeit nach — erst
                dann berechnet diese Ansicht Soll-Stand, Zyklus und Status. Ohne Turnus gilt
                eine Position als freies Sparen und zählt nicht als Fixkostenbelastung.
              </div>
            </div>
          </div>
        )}
        <DataTable
          columns={columns}
          sections={sections}
          storageKey="reserves"
          defaultSort={{ columnId: "nextDue", dir: "asc" }}
        />
      </CardContent>
    </Card>
  );
}
