import React, { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, RangeTabs } from "../../components/ui.jsx";
import { useCardBg } from "../../hooks/useCardBg.js";
import { formatPercent } from "../../utils/investmentFormat.js";
import { assetClassColor } from "./positionColumns.jsx";

const MODE_OPTIONS = [
  { value: "class", label: "Nach Klasse" },
  { value: "depot", label: "Nach Depot" },
];

const MODE_TITLES = {
  class: "Aufteilung nach Anlageklasse",
  depot: "Aufteilung nach Depot",
};

/**
 * Donut über die Aufteilung des Depotwerts, umschaltbar zwischen Anlageklasse
 * und Depot.
 *
 * Der „Nach Depot"-Zweig ersetzt die frühere eigenständige Vermögensübersicht:
 * beide zeigten denselben Sachverhalt, rechneten die Anteile aber gegen
 * unterschiedliche Summen (die Übersicht gegen den Gesamtwert, die Allokation
 * gegen die Summe der bewerteten Positionen). Zwei Karten mit „Anteil je Depot"
 * und abweichenden Prozenten nebeneinander kosten mehr Vertrauen, als die
 * zweite Darstellung einbringt.
 *
 * Unbewertete Positionen sind im Donut nicht enthalten — das steht als Fußzeile
 * unter der Legende, statt still zu verschwinden.
 *
 * Ob die Karte überhaupt etwas zeigt, entscheidet der View über
 * `hasAllocation()` — sonst bliebe im `hb-two`-Raster eine halbe Spalte leer.
 *
 * @param {object} props
 * @param {Array<object>} props.byClass Ergebnis von calcAllocationByAssetClass
 * @param {Array<object>} props.byDepot Ergebnis von calcAllocationByDepot
 * @param {Array<object>} props.depotSummaries Ergebnis von calcDepotSummaries
 * @param {object} props.total Ergebnis von summarizePositions
 * @param {Map<string, string>} props.depotAccent depotId -> Akzentfarbe
 * @param {number} props.unpricedCount offene Positionen ohne Kurs
 * @param {(n: number) => string} props.fmt
 */
export default function AllocationCard({
  byClass,
  byDepot,
  depotSummaries,
  total,
  depotAccent,
  unpricedCount,
  fmt,
}) {
  const cardBg = useCardBg();
  const [mode, setMode] = useState("class");

  // Notiz des Depots als Zweitzeile der Legende — das Einzige, was bei der
  // Verschmelzung mit der Vermögensübersicht sonst verloren ginge.
  const depotNotes = useMemo(
    () => new Map(depotSummaries.map((d) => [d.depotId, d.note])),
    [depotSummaries],
  );

  // Ein Donut mit einem einzigen Segment sagt nichts, was die Pille
  // „Depotwert" nicht schon sagt.
  const canClass = byClass.length > 1;
  const canDepot = byDepot.length > 1;
  if (!canClass && !canDepot) return null;

  const switchable = canClass && canDepot;
  const activeMode = switchable ? mode : canClass ? "class" : "depot";
  const rows = activeMode === "class" ? byClass : byDepot;

  // Die Farbe folgt der Entität, nie ihrem Rang: die Depotfarben kommen aus
  // derselben Map wie die Bänder der Positionsliste. calcAllocationByDepot
  // sortiert nach Wert — ohne die Map wechselte ein Depot die Farbe, sobald
  // eine Kursbewegung die Rangfolge dreht.
  const colorFor = (key) =>
    activeMode === "class" ? assetClassColor(key) : depotAccent.get(key) || assetClassColor("other");

  const chartRows = rows.map((r) => ({ ...r, color: colorFor(r.key) }));

  return (
    <Card>
      <CardContent>
        <div className="hb-row" style={{ alignItems: "center", marginBottom: 12, gap: 8 }}>
          <h3 className="hb-card-title">{switchable ? "Aufteilung" : MODE_TITLES[activeMode]}</h3>
          {switchable && (
            <RangeTabs
              options={MODE_OPTIONS}
              value={activeMode}
              onChange={setMode}
              ariaLabel="Aufteilung wählen"
            />
          )}
        </div>

        <div className="hb-inv-chart-slot">
          <div className="hb-inv-alloc">
            <div className="hb-inv-alloc-pie">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={chartRows}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={56}
                    outerRadius={96}
                    paddingAngle={0}
                    cornerRadius={4}
                    stroke={cardBg}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {chartRows.map((r) => (
                      <Cell key={r.key} fill={r.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={{ zIndex: 10 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload;
                      return (
                        <div className="hb-chart-tooltip">
                          <span className="hb-chart-tooltip-label">
                            <span className="hb-tooltip-dot" style={{ background: row.color }} />
                            {row.label}
                          </span>
                          <span>
                            {fmt(row.value)} · {formatPercent(row.share, { digits: 1, sign: false })}
                          </span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="hb-pie-center-overlay" style={{ pointerEvents: "none" }}>
                <div className="hb-pie-total-value">
                  {total.marketValue === null ? "—" : fmt(total.marketValue)}
                </div>
                <div className="hb-pie-total-label">Depotwert</div>
              </div>
            </div>

            <div>
              <div className="hb-cg-breakdown hb-cg-breakdown--compact">
                {chartRows.map((row) => (
                  <div key={row.key} className="hb-cg-breakdown-row">
                    <div className="hb-cg-breakdown-top">
                      <div className="hb-cg-breakdown-info">
                        <span className="hb-cat-dot" style={{ background: row.color }} />
                        <div className="hb-cg-breakdown-names">
                          <div className="hb-cg-breakdown-name">{row.label}</div>
                          {activeMode === "depot" && depotNotes.get(row.key) && (
                            <div className="hb-cg-breakdown-parent">{depotNotes.get(row.key)}</div>
                          )}
                        </div>
                      </div>
                      <div className="hb-cg-breakdown-values">
                        <span className="hb-cg-breakdown-amount">{fmt(row.value)}</span>
                        <span className="hb-cg-breakdown-share">
                          {formatPercent(row.share, { digits: 1, sign: false })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {unpricedCount > 0 && (
                <div className="hb-stat-pill-delta-note">
                  {unpricedCount} Position{unpricedCount === 1 ? "" : "en"} ohne Kurs
                  {unpricedCount === 1 ? " ist" : " sind"} hier nicht enthalten.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
