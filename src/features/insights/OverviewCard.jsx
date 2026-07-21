import React, { memo } from "react";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconInbox } from "../../components/icons.jsx";

function MomDelta({ momDelta, fontSize }) {
  const style = fontSize ? { fontSize } : undefined;
  if (!momDelta) return <span className="hb-insight-mom hb-insight-mom--flat" style={style}>–</span>;
  const arrow = momDelta.dir === "up" ? "▲" : momDelta.dir === "down" ? "▼" : "";
  const sign = momDelta.dir === "up" ? "+" : "";
  return (
    <span className={`hb-insight-mom hb-insight-mom--${momDelta.dir}`} style={style}>
      {arrow ? `${arrow} ` : ""}{sign}{Math.abs(momDelta.pct).toFixed(0)}%
    </span>
  );
}

const OverviewCard = memo(function OverviewCard({ analytics }) {
  const fmt = useFmt();
  const { top5, avgDailyExpense, biggestMomChange } = analytics;

  const slots = Array.from({ length: 5 }, (_, i) => top5[i] || null);

  return (
    <div className="hb-insights-pane hb-insights-pane--active">
      <div className="hb-insight-section">
        <div className="hb-insight-label" style={{ marginBottom: 8 }}>Top Kategorien</div>
        <div className="hb-insight-cat-list">
          {top5.length === 0 && (
            <div className="hb-insight-cat-empty-overlay" aria-live="polite">
              <div className="hb-empty-icon"><IconInbox /></div>
              <div className="hb-empty-title">Keine Daten</div>
              <div className="hb-empty-text">Für diesen Monat liegen noch keine Ausgaben vor.</div>
            </div>
          )}
          {slots.map((cat, i) =>
            cat ? (
              <div key={cat.name} className="hb-insight-cat-row">
                <div className="hb-insight-cat-meta">
                  <span className="hb-dot" style={{ background: cat.color || "var(--muted)" }} />
                  <span className="hb-insight-cat-name">{cat.name}</span>
                  <span className="hb-insight-cat-amt">{fmt(cat.value)}</span>
                  <MomDelta momDelta={cat.momDelta} fontSize={14} />
                </div>
                <div
                  className="hb-insight-bar-track"
                  style={cat.color ? { background: `${cat.color}24` } : undefined}
                >
                  <div
                    className="hb-insight-bar-fill"
                    style={{ "--w": `${cat.pct}%`, "--c": cat.color || "var(--accent)" }}
                  />
                </div>
              </div>
            ) : (
              <div key={`ph-${i}`} className="hb-insight-cat-row hb-insight-cat-row--placeholder" aria-hidden="true">
                <div className="hb-insight-cat-meta">&nbsp;</div>
                <div className="hb-insight-bar-track" />
              </div>
            )
          )}
        </div>
      </div>

      <div className="hb-insight-kpi-grid">
        <div className="hb-insight-block">
          <div className="hb-insight-label">Grösste Veränderung</div>
          {biggestMomChange ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", marginTop: 2 }}>
              <span className="hb-dot" style={{ background: biggestMomChange.color || "var(--muted)", flexShrink: 0 }} />
              <span className="hb-insight-kpi" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {biggestMomChange.name}
              </span>
              <MomDelta momDelta={biggestMomChange.momDelta} fontSize={20} />
            </div>
          ) : (
            <div className="hb-insight-kpi" style={{ color: "var(--muted)" }}>–</div>
          )}
        </div>

        <div className="hb-insight-block" style={{ alignItems: "flex-end" }}>
          <div className="hb-insight-label">Ø Tagesausgaben</div>
          <div className="hb-insight-kpi hb-insight-kpi--info">{fmt(Math.round(avgDailyExpense), 0)}</div>
        </div>
      </div>
    </div>
  );
});

export default OverviewCard;
