import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "../../components/ui.jsx";
import { useCardBg } from "../../hooks/useCardBg.js";
import { useThemeColors } from "../../hooks/themeColors.js";
import { formatPercent, gainClass } from "../../utils/investmentFormat.js";

// Aufgelöste Klassenfarben für die SVG-Füllung. Recharts schreibt `fill` als
// Attribut, und `var()` in SVG-Präsentationsattributen löst nicht jeder
// Browser auf — die Legendenpunkte nehmen dieselben Werte, damit Punkt und
// Segment garantiert gleich aussehen.
const CLASS_COLOR_KEYS = {
  stock: "invStock",
  etf: "invEtf",
  metal: "invMetal",
  crypto: "invCrypto",
  other: "invOther",
};

/**
 * Donut über die Aufteilung des Depotwerts nach Anlageklasse.
 *
 * Die Sicht „nach Depot" lebt in der Vermögensübersicht daneben; eine zweite
 * Darstellung desselben Sachverhalts wäre doppelt.
 *
 * Unbewertete Positionen sind im Donut nicht enthalten — das steht als Fußzeile
 * unter der Legende, statt still zu verschwinden. Ob die Karte überhaupt
 * erscheint, entscheidet der View (ab zwei Klassen).
 *
 * @param {object} props
 * @param {Array<object>} props.byClass Ergebnis von calcAllocationByAssetClass
 * @param {number} props.unpricedCount offene Positionen ohne Kurs
 * @param {(n: number) => string} props.fmt
 */
export default function AllocationCard({ byClass, unpricedCount, fmt }) {
  const cardBg = useCardBg();
  const themeColors = useThemeColors();

  const pricedTotal = byClass.reduce((s, r) => s + r.value, 0);
  const chartRows = byClass.map((r) => ({
    ...r,
    color: themeColors[CLASS_COLOR_KEYS[r.key] || CLASS_COLOR_KEYS.other],
  }));

  return (
    <Card>
      <CardContent>
        <h3 className="hb-card-title" style={{ marginBottom: 12 }}>
          Aufteilung nach Anlageklasse
        </h3>

        <div className="hb-inv-alloc">
          <div className="hb-inv-alloc-pie">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={chartRows}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={62}
                  outerRadius={102}
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
              <div className="hb-pie-total-value">{fmt(pricedTotal)}</div>
              <div className="hb-pie-total-label">bewertet</div>
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
                        <div className="hb-cg-breakdown-parent">{fmt(row.value)}</div>
                      </div>
                    </div>
                    <div className="hb-cg-breakdown-values">
                      <span className="hb-cg-breakdown-share">
                        {formatPercent(row.share, { digits: 1, sign: false })}
                      </span>
                      <span className={`hb-inv-legend-gain ${gainClass(row.unrealizedGain)}`}>
                        {formatPercent(row.unrealizedGainPct)}
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
      </CardContent>
    </Card>
  );
}
