import React, { useMemo } from "react";
import { Card, CardContent, Button } from "../../components/ui.jsx";
import { IconWallet } from "../../components/icons.jsx";
import { formatPercent, gainClass } from "../../utils/investmentFormat.js";

/**
 * Vermögensübersicht: die Depots mit Wert, Anteil und G/V (Beschluss G).
 *
 * Der Anteil kommt aus calcAllocationByDepot und nicht aus einer eigenen
 * Division durch den Gesamtwert — beide rechnen damit gegen dieselbe Summe
 * der bewerteten Positionen wie der Donut daneben. Genau dieser Unterschied
 * hatte die frühere Übersicht in 6b ihren Platz gekostet.
 *
 * @param {object} props
 * @param {Array<object>} props.depotSummaries Ergebnis von calcDepotSummaries
 * @param {Array<object>} props.byDepot Ergebnis von calcAllocationByDepot
 * @param {Map<string, string>} props.depotAccent depotId -> Akzentfarbe
 * @param {object} props.total Ergebnis von summarizePositions
 * @param {() => void} props.onManageDepots
 * @param {(n: number) => string} props.fmt
 */
export default function DepotOverviewCard({
  depotSummaries,
  byDepot,
  depotAccent,
  total,
  onManageDepots,
  fmt,
}) {
  const shareByDepot = useMemo(() => new Map(byDepot.map((r) => [r.key, r.share])), [byDepot]);

  return (
    <Card>
      <CardContent>
        <div className="hb-row" style={{ alignItems: "center", marginBottom: 12, gap: 8 }}>
          <h3 className="hb-card-title">Vermögensübersicht</h3>
          <Button size="sm" variant="outline" onClick={onManageDepots}>
            <IconWallet /> Depots verwalten
          </Button>
        </div>

        <div className="hb-cg-breakdown hb-cg-breakdown--compact">
          {depotSummaries.map((d) => {
            const count = d.positions.length;
            const sub = d.note || (count === 0 ? "noch leer" : `${count} Position${count === 1 ? "" : "en"}`);
            const share = shareByDepot.get(d.depotId);
            return (
              <div key={d.depotId} className="hb-cg-breakdown-row">
                <div className="hb-cg-breakdown-top">
                  <div className="hb-cg-breakdown-info">
                    <span className="hb-cat-dot" style={{ background: depotAccent.get(d.depotId) }} />
                    <div className="hb-cg-breakdown-names">
                      <div className="hb-cg-breakdown-name">{d.name}</div>
                      <div className="hb-cg-breakdown-parent">{sub}</div>
                    </div>
                  </div>
                  <div className="hb-cg-breakdown-values">
                    <span className="hb-cg-breakdown-amount">
                      {d.summary.marketValue === null || count === 0 ? "—" : fmt(d.summary.marketValue)}
                    </span>
                    <span className="hb-cg-breakdown-share">
                      {share === undefined ? "—" : formatPercent(share, { digits: 1, sign: false })}
                    </span>
                    <span className={`hb-inv-legend-gain ${gainClass(d.summary.unrealizedGain)}`}>
                      {formatPercent(d.summary.unrealizedGainPct)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hb-inv-overview-total">
          <span className="hb-inv-overview-total-label">Gesamt</span>
          <span className="hb-inv-overview-total-value">
            {total.marketValue === null ? "—" : fmt(total.marketValue)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
