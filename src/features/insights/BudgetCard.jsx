import React, { memo, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { useThemeColors } from "../../hooks/themeColors.js";
import { IconChevronRight, IconInbox } from "../../components/icons.jsx";
import { AlertBar } from "../../components/ui.jsx";
import { formatPercent } from "../../utils/formatUtils.js";
import { BUDGET_STATUS_LABEL } from "../../utils/budgetUtils.js";
import { budgetMoney } from "../budget/budgetFormat.js";

// Reihenfolge der Zähler: was zuerst Aufmerksamkeit braucht, steht vorn.
const STATUS_ORDER = ["over", "full", "risk", "ok"];
// So viele überschrittene Kategorien nennt die Warnung beim Namen.
const ALERT_NAMES = 3;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Insights-Tab „Budget“ — wie weit ist die Summe aller Budgets im Monat
 * aufgebraucht?
 *
 * Bewusst keine Kategorienliste: die steht im Budget-View. Die Card zeigt
 * links einen Halbkreis-Meter über alle Budgets, rechts die Summen und die
 * Budgets je Status, darunter eine Warnung bei Überschreitungen oder sonst
 * einen Button in den Budget-View. Der Status hängt allein am Verbrauch, ohne
 * Zeitvergleich. In einem schmalen Panel stehen die Spalten untereinander.
 */
const BudgetCard = memo(function BudgetCard({ budgetItems, totals, isFallbackMonth, onNavigateToBudget }) {
  const fmt = useFmt();
  const themeColors = useThemeColors();
  const money = (value) => budgetMoney(fmt, value);

  const isEmpty = !budgetItems || budgetItems.length === 0;

  const counts = useMemo(() => {
    const result = { over: 0, full: 0, risk: 0, ok: 0 };
    for (const item of budgetItems || []) result[item.status] += 1;
    return result;
  }, [budgetItems]);

  // Überschrittene Budgets, die größte Überschreitung zuerst.
  const overItems = useMemo(
    () => (budgetItems || []).filter((item) => item.status === "over").sort((a, b) => a.remaining - b.remaining),
    [budgetItems]
  );

  const goToBudget = onNavigateToBudget ? (
    <button type="button" className="hb-btn hb-btn-outline hb-budget-gauge-link" onClick={onNavigateToBudget}>
      Zum Budget-View <IconChevronRight />
    </button>
  ) : null;

  if (isEmpty) {
    return (
      <div className="hb-insights-pane hb-insights-pane--active">
        <div className="hb-empty hb-empty--sm" style={{ flex: 1 }}>
          <div className="hb-empty-icon"><IconInbox /></div>
          <div className="hb-empty-title">Kein Budget gesetzt</div>
          <div className="hb-empty-text">
            Lege unter „Budgets“ ein Budget für eine Ausgaben-Kategorie fest.
          </div>
          {goToBudget}
        </div>
      </div>
    );
  }

  const { budget, spent, pct, remaining, status } = totals;
  const isOver = status === "over";

  // Statuston aus dem Theme, nicht als CSS-Variable: Recharts setzt die
  // Farbe als SVG-Attribut, und dort greift var() nicht verlässlich.
  const statusColor = {
    ok: themeColors.green,
    risk: themeColors.yellow,
    full: themeColors.muted,
    over: themeColors.red,
  }[status];

  // Zwei Segmente: verbraucht und frei. Bei Überschreitung ist der Bogen voll,
  // der echte Prozentwert steht in der Mitte. Segmente ohne Wert entfallen,
  // sonst zeichnet der Trennstrich einen Splitter an der Kante.
  const used = Math.min(spent, budget);
  const gaugeData = [
    { key: "used", value: used, fill: statusColor },
    { key: "free", value: Math.max(budget - spent, 0), fill: themeColors.border },
  ].filter((d) => d.value > 0);

  const pctText = formatPercent(Math.round(pct * 100), { digits: 0, sign: false });

  const alertNames = overItems
    .slice(0, ALERT_NAMES)
    .map((item) => `${item.name} +${money(-item.remaining)}`)
    .join(", ");
  const alertRest = overItems.length - ALERT_NAMES;
  const alertTitle = `${plural(overItems.length, "Budget", "Budgets")} überschritten`;
  const alertMessage = alertRest > 0 ? `${alertNames} und ${alertRest} weitere` : alertNames;

  return (
    <div className="hb-insights-pane hb-insights-pane--active hb-budget-insight">
      <div className="hb-budget-gauge-head">
        <span className="hb-insight-label">{isFallbackMonth ? "Laufender Monat" : "Gesamt"}</span>
        <span className={`hb-budget-status-pill hb-budget-status-pill--${status}`}>
          {BUDGET_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="hb-budget-insight-body">
        <div className="hb-budget-insight-main">
          <div className="hb-budget-gauge">
            {/* Seitenverhältnis statt fester Höhe: der Bogen wächst mit der
                Spalte. Die Radien sind Prozent des halben Containers (Höhe),
                der Mittelpunkt sitzt knapp über der Unterkante, damit die
                abgerundeten Enden nicht angeschnitten werden. */}
            <ResponsiveContainer width="100%" aspect={1.9}>
              <PieChart>
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  nameKey="key"
                  cx="50%"
                  cy="97%"
                  innerRadius="144%"
                  outerRadius="182%"
                  paddingAngle={0}
                  cornerRadius={4}
                  stroke={themeColors.card}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  startAngle={180}
                  endAngle={0}
                  animationBegin={0}
                  animationDuration={1350}
                >
                  {gaugeData.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="hb-budget-gauge-center">
              <div className="hb-budget-gauge-value">{pctText}</div>
              <div className="hb-budget-gauge-sub">verbraucht</div>
            </div>
          </div>

          <div className="hb-budget-insight-facts">
            <dl className="hb-budget-insight-kpis">
              <div className="hb-budget-insight-kpi">
                <dt>Budgetiert</dt>
                <dd>{money(budget)}</dd>
              </div>
              <div className="hb-budget-insight-kpi">
                <dt>Verbraucht</dt>
                <dd>{money(spent)}</dd>
              </div>
              <div className="hb-budget-insight-kpi">
                <dt>{isOver ? "Über Budget" : "Verbleibend"}</dt>
                <dd className={isOver ? "hb-pot-foot-out" : undefined}>
                  {isOver ? `+${money(-remaining)}` : money(remaining)}
                </dd>
              </div>
            </dl>

            {/* Zähler je Status: Budgets über dem Limit fallen auf, auch wenn
                die Summe noch im Rahmen ist. Status ohne Budget entfallen. */}
            <div>
              <div className="hb-insight-label">
                {plural(budgetItems.length, "Budget", "Budgets")} nach Status
              </div>
              <ul className="hb-budget-gauge-counts">
                {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                  <li key={s} className={`hb-budget-status-pill hb-budget-status-pill--${s}`}>
                    {counts[s]} {BUDGET_STATUS_LABEL[s]}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Die Warnung führt selbst in den Budget-View, dann entfällt der Button. */}
      <div className="hb-budget-gauge-foot">
        {overItems.length > 0 ? (
          <AlertBar
            title={alertTitle}
            message={alertMessage}
            onClick={onNavigateToBudget}
            ariaLabel={`${alertTitle}: ${alertMessage}. Zum Budget-View`}
          />
        ) : (
          goToBudget
        )}
      </div>
    </div>
  );
});

export default BudgetCard;
