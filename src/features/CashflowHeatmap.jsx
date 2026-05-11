import React, { memo, useCallback, useRef, useState } from "react";
import { useThemeColors } from "../hooks/useThemeColors.jsx";
import { formatDateDELong } from "../utils/hbUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";

const MONTHS_DE_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Normalize balance to 0..1 relative to min/max in the visible period
function normBalance(balance, minBalance, maxBalance) {
  if (maxBalance === minBalance) return 0.5;
  return Math.max(0, Math.min(1, (balance - minBalance) / (maxBalance - minBalance)));
}

const NEUTRAL_RGB = [152, 152, 152]; // #989898 — readable in both themes

// Low balance → red, mid → neutral gray, high → accent blue
function computeBalanceColor(balance, minBalance, maxBalance, redRgb, blueRgb) {
  const t = normBalance(balance, minBalance, maxBalance);
  if (t < 0.5) {
    const [r, g, b] = lerpRgb(redRgb, NEUTRAL_RGB, t * 2);
    return `rgb(${r},${g},${b})`;
  }
  const [r, g, b] = lerpRgb(NEUTRAL_RGB, blueRgb, (t - 0.5) * 2);
  return `rgb(${r},${g},${b})`;
}

const CashflowHeatmap = memo(function CashflowHeatmap({ monthMeta, dayMap, minBalance, maxBalance }) {
  const toCHF = useFmt();
  const themeColors = useThemeColors();
  const redRgb = hexToRgb(themeColors.red);
  const blueRgb = hexToRgb(themeColors.accent);
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const handleCellEnter = useCallback((e, dateStr, data) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Viewport-relative coordinates so the tooltip can use position: fixed
    // and escape the scroll container's overflow clipping.
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      dateStr,
      ...data,
    });
  }, []);

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  if (!monthMeta?.length) return null;

  return (
    <div className="hb-heatmap-wrap" ref={wrapRef}>
      {/* Grid */}
      <div className="hb-heatmap-grid">
        <div /> {/* corner */}
        {DAYS.map((d) => (
          <div key={d} className="hb-heatmap-day-head">{d}</div>
        ))}

        {monthMeta.map(({ ym, days }) => {
          const [, m] = ym.split("-").map(Number);
          return [
            <div key={`label-${ym}`} className="hb-heatmap-month-label">
              {MONTHS_DE_SHORT[m - 1]}
            </div>,
            ...DAYS.map((d) => {
              if (d > days) {
                return <div key={`void-${ym}-${d}`} className="hb-heatmap-cell hb-heatmap-cell--void" />;
              }
              const dateStr = `${ym}-${String(d).padStart(2, "0")}`;
              const data = dayMap.get(dateStr);
              if (!data) {
                return <div key={dateStr} className="hb-heatmap-cell hb-heatmap-cell--empty" />;
              }
              const bg = computeBalanceColor(data.balance, minBalance, maxBalance, redRgb, blueRgb);
              return (
                <button
                  key={dateStr}
                  type="button"
                  className="hb-heatmap-cell"
                  style={{ background: bg }}
                  aria-label={`${formatDateDELong(dateStr)}: ${toCHF(data.balance)}`}
                  onMouseEnter={(e) => handleCellEnter(e, dateStr, data)}
                  onMouseLeave={handleCellLeave}
                  onFocus={(e) => handleCellEnter(e, dateStr, data)}
                  onBlur={handleCellLeave}
                />
              );
            }),
          ];
        })}
      </div>

      {/* Legend */}
      <div className="hb-heatmap-legend-wrap">
        <span className="hb-heatmap-legend-label">Tief</span>
        <div
          className="hb-heatmap-legend-bar"
          style={{
            background: `linear-gradient(to right, ${themeColors.red}, ${themeColors.muted}, ${themeColors.accent})`,
          }}
        />
        <span className="hb-heatmap-legend-label">Hoch</span>
        <span className="hb-heatmap-legend-hint">Kontostand relativ zum Zeitraum</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="hb-heatmap-tooltip"
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, calc(-100% - 8px))",
            zIndex: 9999,
          }}
        >
          <div className="hb-heatmap-tooltip-date">{formatDateDELong(tooltip.dateStr)}</div>
          <div className="hb-heatmap-tooltip-row">
            <span>Kontostand</span>
            <span style={{ fontWeight: 600 }}>{toCHF(tooltip.balance)}</span>
          </div>
          <div className="hb-heatmap-tooltip-row">
            <span>Tagesveränderung</span>
            <span style={{
              color: tooltip.net >= 0 ? themeColors.green : themeColors.red,
            }}>
              {tooltip.net >= 0 ? "+" : ""}{toCHF(tooltip.net)}
            </span>
          </div>
          {tooltip.income > 0 && (
            <div className="hb-heatmap-tooltip-row">
              <span>Einnahmen</span>
              <span style={{ color: themeColors.green }}>{toCHF(tooltip.income)}</span>
            </div>
          )}
          {tooltip.expense > 0 && (
            <div className="hb-heatmap-tooltip-row">
              <span>Ausgaben</span>
              <span style={{ color: themeColors.red }}>{toCHF(tooltip.expense)}</span>
            </div>
          )}
          {tooltip.transfer > 0 && (
            <div className="hb-heatmap-tooltip-row">
              <span>Transfers</span>
              <span>{toCHF(tooltip.transfer)}</span>
            </div>
          )}
          {tooltip.topEntry && (
            <div className="hb-heatmap-tooltip-top">
              {tooltip.topEntry.note || "—"} · {toCHF(Number(tooltip.topEntry.amount || 0))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default CashflowHeatmap;
