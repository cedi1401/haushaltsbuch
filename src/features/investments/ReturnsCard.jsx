import React from "react";
import { Card, CardContent } from "../../components/ui.jsx";
import { IconTrend } from "../../components/icons.jsx";
import { formatPercent, formatSigned } from "../../utils/hbUtils.js";
import { gainClass } from "../../utils/investmentFormat.js";

/**
 * Rendite als Rechnung: Eingesetzt, dann die drei Summanden der
 * Gesamtrendite (nicht realisiert + realisiert + Ausschüttungen) und darunter
 * ihre Summe. Ersetzt die früheren KPI-Pillen über dem View.
 *
 * „Nicht realisiert" steht zusätzlich im Kopf des Views — dort als
 * Schlagzeile, hier als Summand, damit die Summe nachrechenbar bleibt.
 *
 * @param {object} props
 * @param {object} props.total Ergebnis von summarizePositions
 * @param {(n: number) => string} props.fmt
 */
export default function ReturnsCard({ total, fmt }) {
  return (
    <Card>
      <CardContent>
        <h3 className="hb-card-title" style={{ marginBottom: 12 }}>Rendite</h3>

        <div className="hb-inv-detail">
          <div className="hb-inv-detail-row">
            <span className="hb-inv-detail-label">
              Eingesetzt
              <span className="hb-inv-sub"> · inkl. {fmt(total.fees)} Gebühren</span>
            </span>
            <span className="hb-inv-detail-value">{fmt(total.costBasis)}</span>
          </div>
          <div className="hb-inv-detail-row">
            <span className="hb-inv-detail-label">Nicht realisiert</span>
            <span className={`hb-inv-detail-value ${gainClass(total.unrealizedGain)}`}>
              {total.unrealizedGain === null
                ? "—"
                : `${formatSigned(fmt, total.unrealizedGain)} (${formatPercent(total.unrealizedGainPct)})`}
            </span>
          </div>
          <div className="hb-inv-detail-row">
            <span className="hb-inv-detail-label">Realisiert</span>
            <span className={`hb-inv-detail-value ${gainClass(total.realizedGain)}`}>
              {formatSigned(fmt, total.realizedGain)}
            </span>
          </div>
          <div className="hb-inv-detail-row">
            <span className="hb-inv-detail-label">Ausschüttungen</span>
            <span className="hb-inv-detail-value">{fmt(total.dividends)}</span>
          </div>
        </div>

        <div className="hb-inv-overview-total">
          <span className="hb-inv-overview-total-label">
            <IconTrend /> Gesamtrendite
          </span>
          <div>
            <div className={`hb-inv-return-value ${gainClass(total.totalReturn)}`}>
              {formatSigned(fmt, total.totalReturn)}
            </div>
            <div className="hb-inv-return-sub">
              {formatPercent(total.totalReturnPct)} auf die Summe aller Käufe
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
