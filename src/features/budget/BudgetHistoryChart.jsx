import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend } from "../../components/ChartLegend.jsx";
import { ChartTooltip, ChartTooltipRow } from "../../components/ChartTooltip.jsx";
import { useThemeColors } from "../../hooks/themeColors.js";
import { useFmt, useBaseCurrency } from "../../contexts/CurrencyContext.jsx";
import { formatCurrencyCompact } from "../../utils/hbUtils.js";
import { CHART_STROKE, CHART_HEIGHT, BAR_MAX_SIZE, BAR_TOP_RADIUS, AMOUNT_AXIS_WIDTH, axisProps, monthAxisProps, averageLineProps } from "../../utils/chartStyle.js";
import { budgetMoney } from "./budgetColumns.jsx";

/**
 * Ist je Monat als Balken gegen das Budget als Linie — Chart-Idiom des
 * Kostenverlaufs im Kostenrechner. Dient der Verlaufs-Card (alle Budgets) und
 * dem Detailbereich einer Zeile (eine Kategorie).
 *
 * Das Budget ist das heutige: Die Linie ist eine Messlatte über alle Monate,
 * kein Verlauf der Budgets. Überschrittene Monate werden deshalb nicht rot —
 * sie lagen über dem heutigen Budget, nicht zwingend über dem damaligen.
 *
 * Mit eigener Balkenfarbe (Detailbereich: die Kategoriefarbe) werden beide
 * Linien neutral: Violett und Orange kommen als Kategoriefarben vor und fielen
 * sonst mit den Balken zusammen.
 *
 * @param {object} props
 * @param {Array<{ ym: string, label: string, total: number, isCurrent: boolean }>} props.data
 * @param {number|null} props.budget - null ⇒ keine Budgetlinie (Zeile ohne Budget)
 * @param {number|null} props.average - Ø Ist der abgeschlossenen Monate
 * @param {string} [props.color] - Balkenfarbe, sonst der Akzent
 * @param {string} [props.budgetLabel]
 * @param {number} [props.height]
 */
export default function BudgetHistoryChart({
  data,
  budget,
  average,
  color,
  budgetLabel = "Budget",
  height = CHART_HEIGHT,
}) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const themeColors = useThemeColors();
  const avgLine = color
    ? { ...averageLineProps(themeColors), stroke: themeColors.muted }
    : averageLineProps(themeColors);
  const barColor = color || themeColors.accent;
  const budgetColor = color ? themeColors.text : themeColors.purple;
  const hasBudget = budget != null && budget > 0;
  const money = (value) => budgetMoney(fmt, value);

  const legend = [
    ...(average != null
      ? [{ label: "Ø Ist", type: "line", color: avgLine.stroke, strokeWidth: avgLine.strokeWidth, dash: avgLine.strokeDasharray }]
      : []),
    ...(hasBudget
      ? [{ label: budgetLabel, type: "line", color: budgetColor, strokeWidth: CHART_STROKE.ref }]
      : []),
  ];

  return (
    <>
      {legend.length > 0 && <ChartLegend style={{ marginBottom: 16 }} items={legend} />}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap="32%">
          <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="label" {...monthAxisProps(themeColors)} />
          <YAxis {...axisProps(themeColors)} tickFormatter={(v) => formatCurrencyCompact(v, baseCurrency)} width={AMOUNT_AXIS_WIDTH} />
          <Tooltip
            wrapperStyle={{ zIndex: 10 }}
            cursor={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload;
              return (
                <ChartTooltip title={label}>
                  <ChartTooltipRow label="Ist" color={barColor} value={money(point.total)} />
                  {hasBudget && (
                    <>
                      <ChartTooltipRow label={budgetLabel} color={budgetColor} value={money(budget)} />
                      <ChartTooltipRow label="Rest" value={money(budget - point.total)} />
                    </>
                  )}
                  {average != null && (
                    <ChartTooltipRow label="Ø Ist" color={avgLine.stroke} value={money(average)} />
                  )}
                  {point.isCurrent && (
                    <div className="hb-chart-tooltip-note">Laufender Monat, noch nicht abgeschlossen</div>
                  )}
                </ChartTooltip>
              );
            }}
          />
          {/* Messlatte durchgezogen, Durchschnitt gestrichelt — doppelt kodiert
              wie im Kostenverlauf. Die Budgetlinie dehnt die Achse, sonst
              verschwände sie über Monaten, die alle darunter liegen. */}
          {hasBudget && (
            <ReferenceLine
              y={budget}
              stroke={budgetColor}
              strokeWidth={CHART_STROKE.ref}
              ifOverflow="extendDomain"
            />
          )}
          {average != null && <ReferenceLine y={average} {...avgLine} />}
          <Bar
            dataKey="total"
            fill={barColor}
            radius={BAR_TOP_RADIUS}
            maxBarSize={BAR_MAX_SIZE}
            isAnimationActive={false}
            activeBar={false}
          >
            {/* Der laufende Monat ist erst zum Teil vorbei — abgeblendet, damit
                er nicht als sparsamer Monat missverstanden wird. */}
            {data.map((p) => (
              <Cell key={p.ym} fillOpacity={p.isCurrent ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
