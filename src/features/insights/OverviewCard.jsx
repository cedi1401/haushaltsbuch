import React, { memo } from "react";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

function MomDelta({ momDelta, fontSize }) {
  const style = fontSize ? { fontSize } : undefined;
  if (!momDelta) return <span className="hb-insight-mom hb-insight-mom--flat" style={style}>–</span>;
  const arrow = momDelta.dir === "up" ? "↑" : momDelta.dir === "down" ? "↓" : "→";
  const sign = momDelta.dir === "up" ? "+" : momDelta.dir === "down" ? "" : "";
  return (
    <span className={`hb-insight-mom hb-insight-mom--${momDelta.dir}`} style={style}>
      {arrow} {sign}{Math.abs(momDelta.pct).toFixed(0)}%
    </span>
  );
}

const OverviewCard = memo(function OverviewCard({ analytics }) {
  const fmt = useFmt();
  const { top5, avgDailyExpense, biggestMomChange } = analytics;

  return (
    <div className="hb-insights-pane hb-insights-pane--active" style={{ justifyContent: "center" }}>
      {top5.length > 0 && (
        <div className="hb-insight-section">
          <div className="hb-insight-label" style={{ marginBottom: 8 }}>Top Kategorien</div>
          {top5.map((cat) => (
            <div key={cat.name} className="hb-insight-cat-row">
              <div className="hb-insight-cat-meta">
                <span className="hb-dot" style={{ background: cat.color || "var(--muted)" }} />
                <span className="hb-insight-cat-name">{cat.name}</span>
                <span className="hb-insight-cat-amt">{fmt(cat.value)}</span>
                <MomDelta momDelta={cat.momDelta} fontSize={14} />
              </div>
              <div className="hb-insight-bar-track">
                <div
                  className="hb-insight-bar-fill"
                  style={{ "--w": `${cat.pct}%`, "--c": cat.color || "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hb-insight-kpi-grid">
        <div className="hb-insight-block">
          <div className="hb-insight-label">Größte Veränderung</div>
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
