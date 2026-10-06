import React, { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, RangeTabs } from "../../components/ui.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";
import { ChartTooltip, ChartTooltipRow, ChartTooltipDivider } from "../../components/ChartTooltip.jsx";
import { IconTrend } from "../../components/icons.jsx";
import { useThemeColors } from "../../hooks/themeColors.js";
import { useCardBg } from "../../hooks/useCardBg.js";
import { formatCurrencyCompact, formatDateDE, formatPercent, formatSigned } from "../../utils/hbUtils.js";
import { CHART_STROKE, CHART_DASH, AMOUNT_AXIS_WIDTH, axisProps, xAxisProps } from "../../utils/chartStyle.js";
import { formatFetchedAt, gainClass } from "../../utils/investmentFormat.js";
import { windowSnapshots } from "../../utils/investmentUtils.js";

const HELP_HISTORY =
  "Das Haushaltsbuch hält den Depotwert fest, sobald alle offenen Positionen einen Kurs " +
  "haben — höchstens ein Punkt pro Tag, und nur an Tagen, an denen die App geöffnet war. " +
  "Fehlt auch nur ein Kurs, wird für diesen Tag nichts geschrieben: ein zu tiefer Punkt " +
  "bliebe für immer in der Kurve stehen. Wird die App mehrmals am selben Tag geöffnet, " +
  "ersetzt der neuere Wert den älteren — der Tagespunkt ist also der zuletzt gesehene " +
  "Wert des Tages, kein Schlusskurs. Rückwirkend gibt es keine Werte.";

const RANGE_OPTIONS = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "Gesamt" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Ab so vielen Punkten werden die Punkte auf der Linie zur Perlenkette.
const DOT_LIMIT = 60;

const toT = (iso) => new Date(`${iso}T12:00:00`).getTime();

/**
 * Achsenmarken für die Zeitachse. Bis etwa sechs Wochen eine Marke pro Woche,
 * darüber je Monatserster — ausgedünnt, sobald es mehr als acht würden.
 */
function buildTicks(startT, endT) {
  if (endT - startT <= 45 * DAY_MS) {
    const ticks = [];
    for (let t = startT; t <= endT; t += 7 * DAY_MS) ticks.push(t);
    return { ticks, monthly: false };
  }
  const months = [];
  const d = new Date(startT);
  d.setDate(1);
  d.setHours(12, 0, 0, 0);
  if (d.getTime() < startT) d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= endT) {
    months.push(d.getTime());
    d.setMonth(d.getMonth() + 1);
  }
  const step = Math.ceil(months.length / 8);
  return { ticks: months.filter((_, i) => i % step === 0), monthly: true };
}

/**
 * Kopfkarte des Investment-Views: links der Depotwert mit nicht realisierter
 * G/V und Kursstand, rechts der Verlauf aus den Tages-Snapshots (Beschluss F).
 *
 * Der Wert links ist der Live-Wert aus den Positionen, nicht der letzte
 * Snapshot — er steht auch dann, wenn es noch keinen Verlauf gibt. Für den
 * Verlauf gibt es drei Zustände: gar kein Punkt (Erklärung), genau ein Punkt
 * (Hinweis, kein Ein-Punkt-Diagramm) und ab zwei Punkten die Fläche.
 *
 * @param {object} props
 * @param {object} props.total Ergebnis von summarizePositions
 * @param {number} props.depotCount
 * @param {Array<object>} props.snapshots book.investments.snapshots, nach Datum sortiert
 * @param {Map<string, string>} props.depotNames depotId -> Name
 * @param {number} props.unpricedCount offene Positionen ohne Kurs
 * @param {string|null} props.oldestFetchedAt ältester Kurszeitpunkt
 * @param {boolean} props.hasStale
 * @param {(n: number) => string} props.fmt
 * @param {string} props.baseCurrency
 */
export default function ValueHistoryCard({
  total,
  depotCount,
  snapshots,
  depotNames,
  unpricedCount,
  oldestFetchedAt,
  hasStale,
  fmt,
  baseCurrency,
}) {
  const themeColors = useThemeColors();
  const cardBg = useCardBg();
  const gradientId = useId();
  const [range, setRange] = useState("all");

  const count = (snapshots || []).length;

  // Zeitstempel als Zahl: mit einer Kategorieachse sähe eine dreimonatige
  // Lücke genauso breit aus wie ein Tagesabstand — das Diagramm erfände einen
  // Verlauf, den es nie gemessen hat.
  const view = useMemo(() => {
    const { rows, domainStart } = windowSnapshots(snapshots, range);
    const data = rows.map((s) => ({ ...s, t: toT(s.date) }));
    if (data.length < 2) return { data, startT: null, endT: null, ticks: [], monthly: false };
    const startT = toT(domainStart);
    const endT = data[data.length - 1].t;
    return { data, startT, endT, ...buildTicks(startT, endT) };
  }, [snapshots, range]);

  // Veränderung im gewählten Zeitraum. Sie enthält Käufe und Verkäufe — ein
  // Kauf für 5000 erschiene als +5000. Deshalb neutral und nicht als Gewinn
  // eingefärbt.
  const delta =
    view.data.length >= 2 ? view.data[view.data.length - 1].total - view.data[0].total : null;

  const accent = themeColors.accent;
  const gain = total.unrealizedGain;

  return (
    <Card className="hb-inv-cell--hero">
      <CardContent>
        <div className="hb-inv-hero">
          <div className="hb-inv-hero-summary">
            <div>
              <div className="hb-inv-hero-label">Depotwert</div>
              <div className="hb-inv-hero-value">
                {total.marketValue === null ? "—" : fmt(total.marketValue)}
              </div>
              {gain !== null && (
                <div className="hb-inv-hero-gain">
                  <span className={gainClass(gain)}>
                    {formatSigned(fmt, gain)} ({formatPercent(total.unrealizedGainPct)})
                  </span>{" "}
                  <span className="hb-muted">nicht realisiert</span>
                </div>
              )}
              {delta !== null && (
                <div
                  className="hb-inv-hero-delta"
                  title="Wertveränderung im gewählten Zeitraum, inklusive Käufe und Verkäufe"
                >
                  {formatSigned(fmt, delta)} seit {formatDateDE(view.data[0].date)}
                </div>
              )}
            </div>

            <div className="hb-inv-hero-meta">
              <div>
                {total.positionCount} Position{total.positionCount === 1 ? "" : "en"} in{" "}
                {depotCount} Depot{depotCount === 1 ? "" : "s"}
              </div>
              <div className="hb-inv-hero-meta-row">
                <span>
                  {oldestFetchedAt
                    ? `Kurse: Stand ${formatFetchedAt(oldestFetchedAt)}`
                    : "Noch keine Kurse abgerufen"}
                </span>
                {hasStale && (
                  <span
                    className="hb-badge hb-inv-pill hb-inv-pill--stale"
                    title="Die App konnte die Kurse nicht neu abrufen und zeigt die letzten bekannten."
                  >
                    veraltet
                  </span>
                )}
              </div>
              {unpricedCount > 0 && (
                <div className="hb-stat-pill-delta-note">
                  {unpricedCount} Position{unpricedCount === 1 ? "" : "en"} ohne Kurs
                </div>
              )}
            </div>
          </div>

          <div className="hb-inv-hero-chart">
            <div className="hb-inv-hero-chart-head">
              <HbTooltip text={HELP_HISTORY} />
              {count >= 2 && (
                <RangeTabs
                  options={RANGE_OPTIONS}
                  value={range}
                  onChange={setRange}
                  ariaLabel="Zeitraum wählen"
                />
              )}
            </div>

            <div className="hb-inv-hero-slot">
              {count === 0 ? (
                <EmptyHistory unpricedCount={unpricedCount} />
              ) : count === 1 ? (
                <SingleSnapshot snapshot={snapshots[0]} />
              ) : (
                <div className="hb-inv-hero-fill">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={view.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                          <stop offset="70%" stopColor={accent} stopOpacity={0.08} />
                          <stop offset="100%" stopColor={accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                      {/* allowDataOverflow schneidet den Vorpunkt vor dem Fensterbeginn
                          am linken Rand ab — die Linie beginnt am Rand, die Achse
                          dehnt sich aber nicht auf seinen Zeitpunkt aus. */}
                      <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={[view.startT, view.endT]}
                        allowDataOverflow
                        ticks={view.ticks}
                        {...xAxisProps(themeColors)}
                        tickFormatter={(t) =>
                          new Date(t).toLocaleDateString(
                            "de-CH",
                            view.monthly ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "2-digit" },
                          )
                        }
                      />
                      {/* Basis 0: eine Fläche kodiert Menge ab der Grundlinie; eine
                          abgeschnittene Achse dramatisierte jede Schwankung. */}
                      <YAxis
                        {...axisProps(themeColors)}
                        tickFormatter={(v) => formatCurrencyCompact(v, baseCurrency)}
                        width={AMOUNT_AXIS_WIDTH}
                        domain={[0, "auto"]}
                        tickCount={4}
                      />
                      <Tooltip
                        wrapperStyle={{ zIndex: 10 }}
                        cursor={{ stroke: themeColors.muted, strokeWidth: CHART_STROKE.aux, strokeDasharray: CHART_DASH.secondary }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload;
                          const index = view.data.findIndex((d) => d.date === row.date);
                          const prev = index > 0 ? view.data[index - 1] : null;
                          const step = prev ? row.total - prev.total : null;
                          return (
                            <ChartTooltip title={formatDateDE(row.date)}>
                              <ChartTooltipRow label="Depotwert" color={accent} value={fmt(row.total)} />
                              {step !== null && (
                                <ChartTooltipRow
                                  label="ggü. Vorpunkt"
                                  value={formatSigned(fmt, step)}
                                  valueClassName={gainClass(step)}
                                />
                              )}
                              {depotCount > 1 && <ChartTooltipDivider />}
                              {depotCount > 1 &&
                                row.byDepot.map((d) => (
                                  <ChartTooltipRow
                                    key={d.depotId}
                                    label={depotNames.get(d.depotId) || "Gelöschtes Depot"}
                                    value={fmt(d.value)}
                                  />
                                ))}
                            </ChartTooltip>
                          );
                        }}
                      />
                      {/* Sichtbare Punkte, solange die Reihe dünn ist: sie ist
                          unregelmäßig besetzt, eine nackte Linie behauptete eine
                          Kontinuität, die es nicht gibt. */}
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke={accent}
                        strokeWidth={CHART_STROKE.main}
                        fill={`url(#${gradientId})`}
                        dot={view.data.length <= DOT_LIMIT ? { r: 2.5, strokeWidth: 0, fill: accent } : false}
                        activeDot={{ r: 4, stroke: cardBg, strokeWidth: 2, fill: accent }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyHistory({ unpricedCount }) {
  return (
    <div className="hb-empty hb-empty--sm">
      <div className="hb-empty-icon"><IconTrend /></div>
      <div className="hb-empty-title">Der Verlauf beginnt mit dem ersten Kurs</div>
      <div className="hb-empty-text">
        Das Haushaltsbuch hält den Depotwert fest, sobald alle offenen Positionen einen Kurs
        haben — ein Punkt pro Tag, an dem die App geöffnet ist. Rückwirkend gibt es keine
        Werte, die Kurve wächst ab jetzt.
      </div>
      {unpricedCount > 0 && (
        <div className="hb-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Heute fehlt noch ein Kurs für {unpricedCount} Position{unpricedCount === 1 ? "" : "en"} —
          deshalb steht noch kein Punkt in der Kurve.
        </div>
      )}
    </div>
  );
}

/**
 * Ein einzelner Punkt ist kein Verlauf; ein Diagramm mit einem Datenpunkt
 * sieht aus wie ein Fehler. Der Wert selbst steht schon links.
 */
function SingleSnapshot({ snapshot }) {
  return (
    <div className="hb-empty hb-empty--sm">
      <div className="hb-empty-icon"><IconTrend /></div>
      <div className="hb-empty-text">
        Erster Messpunkt am {formatDateDE(snapshot.date)}. Ab dem zweiten wird daraus eine Linie.
      </div>
    </div>
  );
}
