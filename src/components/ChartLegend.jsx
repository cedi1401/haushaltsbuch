import React from "react";
import { CHART_STROKE } from "../utils/chartStyle.js";

// Legende über einem Chart, immer als eigene Zeile unter der Titelzeile.
// items: [{ label, color, type?: "box" | "line", strokeWidth?, dash? }]
// Linienmarken zeichnen die echte Stärke und das echte Strichmuster der Serie.
export function ChartLegend({ items, className, style }) {
  return (
    <ul className={`hb-series-legend${className ? ` ${className}` : ""}`} style={style} aria-label="Legende">
      {items.map((item) => (
        <li key={item.label} className="hb-series-legend-item">
          {item.type === "line" ? (
            <svg className="hb-series-legend-line" width="20" height="10" aria-hidden="true">
              <line
                x1="0"
                y1="5"
                x2="20"
                y2="5"
                stroke={item.color}
                strokeWidth={item.strokeWidth ?? CHART_STROKE.main}
                strokeDasharray={item.dash}
              />
            </svg>
          ) : (
            <span className="hb-series-legend-box" style={{ background: item.color }} aria-hidden="true" />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
