import React, { useMemo } from "react";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { Card, CardContent, Button } from "../components/ui.jsx";
import { IconReserves, IconInfo } from "../components/icons.jsx";
import { fixedCostKind } from "../utils/hbUtils.js";
import { isSinkingFund } from "../utils/fixedCostUtils.js";

/**
 * Rücklagen-View — Überwachung der Transfer-Fixkosten mit Turnus.
 *
 * Rollenteilung zur Fixkosten-View: dort wird angelegt und monatlich gebucht,
 * hier wird überwacht und der Zyklus abgeschlossen. Beide Views lesen dieselben
 * `recurringExpenses`; dieser hier zeigt ausschliesslich die Transfer-Positionen.
 */
export default function ReservesView({
  activeBook,
  onNavigateToFixed,
}) {
  const recurringExpenses = activeBook?.recurringExpenses || EMPTY_ARRAY;

  const items = useMemo(
    () => recurringExpenses.filter((r) => fixedCostKind(r) === "transfer"),
    [recurringExpenses]
  );

  // Der Hinweisstreifen gilt genau dem Zustand, den die Turnus-Umstellung
  // erzeugt: Positionen vorhanden, aber keine einzige mit Zyklus. Er
  // verschwindet mit der ersten nachgepflegten Position von selbst.
  const hasAnyTurnus = useMemo(() => items.some(isSinkingFund), [items]);

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
                Trag bei einer Transfer-Fixkosten Turnus und nächste Fälligkeit nach — erst
                dann berechnet diese Ansicht Soll-Stand, Zyklus und Status. Ohne Turnus gilt
                eine Position als freies Sparen und zählt nicht als Fixkostenbelastung.
              </div>
            </div>
          </div>
        )}
        <h3 className="hb-card-title">Rücklagen</h3>
      </CardContent>
    </Card>
  );
}
