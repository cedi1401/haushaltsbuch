import React, { memo } from "react";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconInbox } from "../../components/icons.jsx";
import { formatPercent } from "../../utils/formatUtils.js";

function MomDelta({ momDelta, fontSize }) {
  const style = fontSize ? { fontSize } : undefined;
  if (!momDelta) return <span className="hb-insight-mom hb-insight-mom--flat" style={style}>–</span>;
  const arrow = momDelta.dir === "up" ? "▲" : momDelta.dir === "down" ? "▼" : "";
  return (
    <span className={`hb-insight-mom hb-insight-mom--${momDelta.dir}`} style={style}>
      {arrow ? `${arrow} ` : ""}{formatPercent(Math.abs(momDelta.pct), { digits: 0, sign: momDelta.dir === "up" })}
    </span>
  );
}

const OverviewCard = memo(function OverviewCard({ analytics }) {
  const fmt = useFmt();
  const { topCategories } = analytics;

  const slots = Array.from({ length: 6 }, (_, i) => topCategories[i] || null);

  return (
    <div className="hb-insights-pane hb-insights-pane--active">
      <div className="hb-insight-section hb-insight-section--fill">
        <div className="hb-insight-label" style={{ marginBottom: 8 }}>Top Kategorien</div>
        <div className="hb-insight-cat-list">
          {topCategories.length === 0 && (
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
                  <MomDelta momDelta={cat.momDelta} fontSize="var(--type-body-size)" />
                </div>
                <div
                  className={`hb-meter hb-meter--lg${cat.color ? " hb-meter--tinted hb-meter--cat" : ""}`}
                  style={cat.color ? { "--meter-tone": cat.color } : undefined}
                >
                  <div
                    className="hb-meter-fill hb-insight-bar-fill"
                    style={{ "--w": `${cat.pct}%` }}
                  />
                </div>
              </div>
            ) : (
              <div key={`ph-${i}`} className="hb-insight-cat-row hb-insight-cat-row--placeholder" aria-hidden="true">
                <div className="hb-insight-cat-meta">&nbsp;</div>
                <div className="hb-meter hb-meter--lg" />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
});

export default OverviewCard;
