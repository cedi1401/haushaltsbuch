import React from "react";

// Mehrzeiliger Chart-Tooltip: Titel oben, darunter eine Zeile pro Wert.
// Gemeinsamer Baustein für alle Recharts-Tooltips mit mehr als einem Wert —
// ohne ihn fällt .hb-chart-tooltip auf sein Zeilen-Flex zurück und die Werte
// laufen als Streifen in die Breite.
export function ChartTooltip({ title, children }) {
  return (
    <div className="hb-chart-tooltip hb-chart-tooltip--col">
      {title != null && <div className="hb-chart-tooltip-title">{title}</div>}
      {children}
    </div>
  );
}

// Die Serienfarbe sitzt im Punkt, der Text bleibt neutral: helle oder dunkle
// Serienfarben als Textfarbe fallen je nach Theme unter den Mindestkontrast.
export function ChartTooltipRow({ label, value, color, valueClassName, valueStyle }) {
  return (
    <div className="hb-chart-tooltip-row">
      <span className="hb-chart-tooltip-key">
        {color && <span className="hb-tooltip-dot" style={{ background: color }} />}
        {label}
      </span>
      <span className={`hb-chart-tooltip-val${valueClassName ? ` ${valueClassName}` : ""}`} style={valueStyle}>
        {value}
      </span>
    </div>
  );
}

export function ChartTooltipDivider() {
  return <div className="hb-chart-tooltip-divider" />;
}
