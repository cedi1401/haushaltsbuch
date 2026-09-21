import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, RangeTabs } from "../../components/ui.jsx";
import HbTooltip from "../../components/HbTooltip.jsx";
import { IconTrend } from "../../components/icons.jsx";
import { useThemeColors } from "../../hooks/themeColors.js";
import { formatCurrencyAxis, formatDateDE } from "../../utils/hbUtils.js";
import { formatPercent, gainClass } from "../../utils/investmentFormat.js";
import { summarizeSnapshots } from "../../utils/investmentUtils.js";

const HELP_HISTORY =
  "Das Haushaltsbuch hält den Depotwert fest, sobald alle offenen Positionen einen Kurs " +
  "haben — höchstens ein Punkt pro Tag, und nur an Tagen, an denen die App geöffnet war. " +
  "Fehlt auch nur ein Kurs, wird für diesen Tag nichts geschrieben: ein zu tiefer Punkt " +
  "bliebe für immer in der Kurve stehen. Wird die App mehrmals am selben Tag geöffnet, " +
  "ersetzt der neuere Wert den älteren — der Tagespunkt ist also der zuletzt gesehene " +
  "Wert des Tages, kein Schlusskurs. Rückwirkend gibt es keine Werte.";

// Erst ab dieser Zahl von Punkten lohnt ein Zeitraum-Umschalter; bei drei
// Punkten wäre er Zierrat.
const RANGE_THRESHOLD = 30;

const RANGE_OPTIONS = [
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: 0, label: "Alles" },
];

/**
 * Verlauf des Depotwerts aus den Tages-Snapshots (Beschluss F).
 *
 * Die Kurve beginnt beim ersten Snapshot und füllt sich von da an — es gibt
 * keine Rückrechnung. Deshalb drei Zustände statt eines leeren Charts:
 * gar kein Punkt (Erklärung), genau ein Punkt (eine Zahl, kein Verlauf) und
 * ab zwei Punkten die Linie.
 *
 * @param {object} props
 * @param {Array<object>} props.snapshots book.investments.snapshots, nach Datum sortiert
 * @param {number} props.depotCount Anzahl Depots — entscheidet über die Aufschlüsselung im Tooltip
 * @param {Map<string, string>} props.depotNames depotId -> Name
 * @param {number} props.unpricedCount offene Positionen ohne Kurs
 * @param {(n: number) => string} props.fmt
 * @param {string} props.baseCurrency
 */
export default function ValueHistoryCard({
  snapshots,
  depotCount,
  depotNames,
  unpricedCount,
  fmt,
  baseCurrency,
}) {
  const themeColors = useThemeColors();
  const [rangeDays, setRangeDays] = useState(0);

  const stats = useMemo(() => summarizeSnapshots(snapshots), [snapshots]);

  // Der Zeitstempel als Zahl: mit einer Kategorieachse sähe eine dreimonatige
  // Lücke genauso breit aus wie ein Tagesabstand — das Diagramm erfände einen
  // Verlauf, den es nie gemessen hat.
  const data = useMemo(() => {
    const rows = (snapshots || []).map((s) => ({
      ...s,
      t: new Date(`${s.date}T12:00:00`).getTime(),
    }));
    if (!rangeDays || rows.length === 0) return rows;
    // Anker ist der letzte Messpunkt, nicht die aktuelle Uhrzeit: Das hält die
    // Berechnung rein (sie hängt nur von den Daten ab) und zeigt auch dann die
    // letzten Wochen, wenn die App längere Zeit nicht offen war.
    const cutoff = rows[rows.length - 1].t - rangeDays * 24 * 60 * 60 * 1000;
    const windowed = rows.filter((r) => r.t >= cutoff);
    // Ein Fenster mit einem einzigen Punkt ergäbe keine Linie — dann lieber alles.
    return windowed.length >= 2 ? windowed : rows;
  }, [snapshots, rangeDays]);

  const header = (
    <div className="hb-row" style={{ alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
      <div>
        <div className="hb-title-with-help">
          <h3 className="hb-card-title">Depotwert-Verlauf</h3>
          <HbTooltip text={HELP_HISTORY} />
        </div>
        {stats.change !== null && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            <span className={gainClass(stats.change)}>
              {stats.change > 0 ? "+" : ""}
              {fmt(stats.change)}
              {stats.changePct !== null && ` (${formatPercent(stats.changePct)})`}
            </span>{" "}
            <span className="hb-muted">seit {formatDateDE(stats.first.date)}</span>
          </div>
        )}
      </div>
      {stats.count > RANGE_THRESHOLD && (
        <RangeTabs
          options={RANGE_OPTIONS}
          value={rangeDays}
          onChange={setRangeDays}
          ariaLabel="Zeitraum wählen"
        />
      )}
    </div>
  );

  return (
    <Card>
      <CardContent>
        {header}
        <div className="hb-inv-chart-slot">
          {stats.count === 0 ? (
            <EmptyHistory unpricedCount={unpricedCount} />
          ) : stats.count === 1 ? (
            <SingleSnapshot snapshot={stats.last} fmt={fmt} />
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={themeColors.muted} strokeOpacity={0.15} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(t) =>
                    new Date(t).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })
                  }
                  height={28}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrencyAxis(v, baseCurrency)}
                  width={64}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 10 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload;
                    const index = data.findIndex((d) => d.date === row.date);
                    const prev = index > 0 ? data[index - 1] : null;
                    const delta = prev ? row.total - prev.total : null;
                    return (
                      <div className="hb-chart-tooltip">
                        <span className="hb-chart-tooltip-label">{formatDateDE(row.date)}</span>
                        <TooltipRow label="Depotwert" value={fmt(row.total)} />
                        {delta !== null && (
                          <TooltipRow
                            label="ggü. Vorpunkt"
                            value={`${delta > 0 ? "+" : ""}${fmt(delta)}`}
                            className={gainClass(delta)}
                          />
                        )}
                        {depotCount > 1 &&
                          row.byDepot.map((d) => (
                            <TooltipRow
                              key={d.depotId}
                              label={depotNames.get(d.depotId) || "Gelöschtes Depot"}
                              value={fmt(d.value)}
                              muted
                            />
                          ))}
                      </div>
                    );
                  }}
                />
                {/* Sichtbare Punkte: die Reihe ist dünn und unregelmäßig besetzt —
                    eine nackte Linie behauptete eine Kontinuität, die es nicht gibt. */}
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={themeColors.accent}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: themeColors.accent }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TooltipRow({ label, value, className, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span className={muted ? "hb-muted" : undefined}>{label}</span>
      <span className={className}>{value}</span>
    </div>
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
 * Ein einzelner Punkt ist eine Zahl, kein Verlauf. Ein Diagramm mit einem
 * Datenpunkt sieht aus wie ein Fehler; die große Zahl sagt dasselbe ehrlich.
 */
function SingleSnapshot({ snapshot, fmt }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="hb-inv-hero-value">{fmt(snapshot.total)}</div>
      <div className="hb-muted" style={{ fontSize: 12, marginTop: 2 }}>
        Stand vom {formatDateDE(snapshot.date)}
      </div>
      <div className="hb-muted" style={{ fontSize: 12, marginTop: 10 }}>
        Ab dem zweiten Messpunkt wird daraus eine Linie.
      </div>
    </div>
  );
}
