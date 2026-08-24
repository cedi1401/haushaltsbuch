import React, { useCallback, useMemo } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { Card, CardContent, Button } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import { IconReserves, IconInfo } from "../components/icons.jsx";
import { fixedCostKind, todayISO } from "../utils/hbUtils.js";
import { isSinkingFund, buildSinkingFundRows } from "../utils/fixedCostUtils.js";
import { getFinancialMonth } from "../utils/financialMonthUtils.js";
import { GROUP_ACCENT_PALETTE } from "../utils/hbPalette.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { buildReserveColumns } from "./reserves/reserveColumns.jsx";
import ReserveDetail from "./reserves/ReserveDetail.jsx";

// Sammelschlüssel für Positionen ohne (gültige) Gruppe. Anders als in der
// Fixkosten-View braucht es hier keinen Schlüssel je Spalte — dieser View zeigt
// ausschliesslich Transfers.
const UNGROUPED_KEY = "ungrouped";

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

  const potById = useMemo(() => new Map(pots.map((p) => [p.id, p])), [pots]);

  const columns = useMemo(() => {
    const potNameById = new Map(pots.map((p) => [p.id, p.name]));
    const groupNameById = new Map(fixedCostGroups.map((g) => [g.id, g.name]));
    return buildReserveColumns({ fmt, potNameById, groupNameById });
  }, [fmt, pots, fixedCostGroups]);

  // „Rückstand ausgleichen" ist eine Einstiegshilfe und genau einmal je Position
  // verfügbar: sobald eine Monatsrate gebucht ist, gibt es nichts mehr
  // nachzuholen, was nicht auch von Hand gebucht werden könnte. Ein Set über
  // alle Einträge statt `entries.some(...)` je Zeile — sonst wäre die Prüfung
  // quadratisch. `kind === "transfer"` grenzt bewusst auf Monatsraten ein: eine
  // Entnahme aus „Rechnung bezahlt" darf die Verfügbarkeit nicht verbrauchen.
  const bookedRecurringIds = useMemo(() => {
    const set = new Set();
    for (const e of entries || []) {
      if (e.recurringId && e.kind === "transfer") set.add(e.recurringId);
    }
    return set;
  }, [entries]);

  const renderDetail = useCallback(
    (row, hiddenColumns) => (
      <ReserveDetail
        row={row}
        hiddenColumns={hiddenColumns}
        fmt={fmt}
        pot={potById.get(row.item?.potId)}
        canCatchUp={row.elapsed > 0 && !bookedRecurringIds.has(row.item?.id)}
      />
    ),
    [fmt, potById, bookedRecurringIds]
  );

  // Gliederung nach den Transfer-Gruppen der Fixkosten-View. Die Reihenfolge ist
  // deren `order` — der Nutzer hat sie dort per Drag festgelegt, eine zweite
  // abweichende Ordnung wäre unnötige Kopfarbeit.
  const transferGroups = useMemo(
    () =>
      fixedCostGroups
        .filter((g) => fixedCostKind(g) === "transfer")
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [fixedCostGroups]
  );

  const sections = useMemo(() => {
    // Zuordnungsregel identisch zur Fixkosten-View: eine Gruppe zählt nur, wenn
    // es sie gibt UND sie dieselbe Art hat. Sonst landet die Position unter
    // „Ohne Gruppe" — genau wie sie dort unter „Weitere" landet.
    const validIds = new Set(transferGroups.map((g) => g.id));
    const byKey = new Map();
    for (const row of rows) {
      const gid = row.item?.groupId || null;
      const key = gid && validIds.has(gid) ? gid : UNGROUPED_KEY;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    }

    // Ohne jede Gruppe bleibt es bei der einen Sektion ohne Band. Ein einzelnes
    // Band „Ohne Gruppe" über der gesamten Tabelle wäre reine Dekoration.
    if (byKey.size === 1 && byKey.has(UNGROUPED_KEY)) {
      return [{ key: UNGROUPED_KEY, label: null, accent: null, meta: null, rows }];
    }

    // Die Farbe hängt an der Position in der Gruppenliste, nicht an den Zeilen —
    // eine vorübergehend leere Gruppe verschiebt die Farben der übrigen nicht.
    const result = [];
    transferGroups.forEach((group, index) => {
      const groupRows = byKey.get(group.id);
      if (!groupRows) return;
      const accent = GROUP_ACCENT_PALETTE[index % GROUP_ACCENT_PALETTE.length];
      result.push({
        key: group.id,
        label: group.name,
        accent,
        meta: <BandMeta rows={groupRows} fmt={fmt} />,
        rows: groupRows,
      });
    });

    // „Ohne Gruppe" immer ans Ende und ohne Farbe — es ist keine Gruppe, sondern
    // ihr Fehlen.
    const ungrouped = byKey.get(UNGROUPED_KEY);
    if (ungrouped) {
      result.push({
        key: UNGROUPED_KEY,
        label: "Ohne Gruppe",
        accent: null,
        meta: <BandMeta rows={ungrouped} fmt={fmt} />,
        rows: ungrouped,
      });
    }
    return result;
  }, [rows, transferGroups, fmt]);

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
          renderDetail={renderDetail}
          label="Rücklagen"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Die rechte Seite eines Gliederungsbandes: `Soll · Ist · Δ` der Gruppe.
 *
 * Freies Sparen hat keinen Soll-Stand (`target === null`) und geht deshalb nur
 * mit seinem Ist-Stand ein — die Differenz der Gruppe bewertet ausschliesslich
 * das, was auch bewertbar ist.
 */
function BandMeta({ rows, fmt }) {
  let target = 0;
  let actual = 0;
  let delta = 0;
  let tolerance = 0;
  for (const row of rows) {
    if (Number.isFinite(row.target)) target += row.target;
    if (Number.isFinite(row.actual)) actual += row.actual;
    if (Number.isFinite(row.delta)) delta += row.delta;
    if (Number.isFinite(row.tolerance)) tolerance += row.tolerance;
  }
  // Dieselbe Regel wie in der Differenz-Spalte: gefärbt wird erst jenseits der
  // aufsummierten Rundungstoleranz, sonst stünde bei exakter Deckung ein rotes
  // „−0.00" im Band.
  const deltaClass =
    delta < -tolerance ? "hb-dt-delta--neg" : delta > tolerance ? "hb-dt-delta--pos" : undefined;

  return (
    <>
      <span className="hb-dt-band-meta-label">Soll</span>
      {fmt(target)}
      <span className="hb-dt-band-meta-sep">·</span>
      <span className="hb-dt-band-meta-label">Ist</span>
      {fmt(actual)}
      <span className="hb-dt-band-meta-sep">·</span>
      <span className="hb-dt-band-meta-label">Δ</span>
      <span className={deltaClass}>{fmt(delta)}</span>
    </>
  );
}
