import React, { useMemo, useState } from "react";
import { Card, CardContent, ChartScrollNav } from "../../components/ui.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";
import { IconTrend } from "../../components/icons.jsx";
import { calcHistoryAverage } from "../../utils/budgetUtils.js";
import BudgetHistoryChart from "./BudgetHistoryChart.jsx";

const WINDOW_MONTHS = 12;

const HELP =
  "Die Balken zeigen, was du je Monat in den Kategorien mit Budget ausgegeben hast. " +
  "Die durchgezogene Linie ist die Summe deiner heutigen Budgets: Vergangene Monate werden an dem " +
  "gemessen, was heute gilt, nicht an dem, was damals galt. Die gestrichelte Linie ist der " +
  "Durchschnitt der abgeschlossenen Monate im sichtbaren Zeitraum. Ausgaben aus Töpfen zählen nicht mit.";

/**
 * Card „Budget und Ist im Verlauf“: das Ist aller budgetierten Kategorien je
 * Monat gegen die heutige Budgetsumme. Höchstens zwölf Monate sichtbar, ältere
 * über ‹ › — wie der Kostenverlauf im Kostenrechner.
 *
 * @param {object} props
 * @param {Array} props.series - Reihe aus buildBudgetHistory(), älteste zuerst
 * @param {number} props.budget - Summe der heutigen Budgets
 */
export default function BudgetHistoryCard({ series, budget }) {
  const [offset, setOffset] = useState(0);
  const maxOffset = Math.max(0, series.length - WINDOW_MONTHS);
  // Das Buch kann wechseln oder Buchungen verlieren, während der Versatz steht.
  const safeOffset = Math.min(offset, maxOffset);

  const visible = useMemo(() => {
    const start = Math.max(0, series.length - WINDOW_MONTHS - safeOffset);
    return series.slice(start, start + WINDOW_MONTHS);
  }, [series, safeOffset]);
  // Der Ø gilt dem sichtbaren Fenster: er beschreibt die Balken, über denen er liegt.
  const average = useMemo(() => calcHistoryAverage(visible), [visible]);

  const hasData = visible.length > 0;
  const windowLabel = !hasData
    ? ""
    : visible.length === 1
      ? visible[0].label
      : `${visible[0].label} – ${visible[visible.length - 1].label}`;

  return (
    <Card style={{ marginBottom: "var(--card-gap)" }}>
      <CardContent>
        <div className={`hb-card-head${hasData ? " hb-card-head--legend" : ""}`}>
          <span className="hb-title-with-help">
            <h3 className="hb-card-title">Budget und Ist im Verlauf</h3>
            <HbTooltip size={16} text={HELP} />
          </span>
          {maxOffset > 0 && (
            <ChartScrollNav
              offset={safeOffset}
              maxOffset={maxOffset}
              onOffsetChange={setOffset}
              label={windowLabel}
            />
          )}
        </div>

        {hasData ? (
          <BudgetHistoryChart data={visible} budget={budget} average={average} budgetLabel="Budgetsumme" />
        ) : (
          <div className="hb-empty hb-empty--sm">
            <div className="hb-empty-icon"><IconTrend /></div>
            <div className="hb-empty-title">Noch kein Verlauf</div>
            <div className="hb-empty-text">
              Sobald die erste Buchung erfasst ist, erscheint hier das Ist je Monat gegen deine Budgets.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
