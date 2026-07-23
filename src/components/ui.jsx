import React from "react";

export function Card({ children, style, className }) {
  return (
    <div className={`hb-card${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

export function CardContent({ children, style }) {
  return <div className="hb-card-content" style={style}>{children}</div>;
}

export function Button({ children, onClick, variant = "solid", size, disabled, type = "button", style, className }) {
  const cls = [
    variant === "outline" ? "hb-btn hb-btn-outline" : "hb-btn",
    size === "sm" ? "hb-btn-sm" : null,
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type} style={style}>
      {children}
    </button>
  );
}

// Segmentierte Pill-Auswahl (Zeitraum-/Modus-Umschalter). Ersetzt das zuvor
// mehrfach duplizierte `hb-pill-tabs`-Markup. `options`: [{ value, label }].
export function RangeTabs({ options, value, onChange, ariaLabel, style }) {
  return (
    <div className="hb-pill-tabs" role="group" aria-label={ariaLabel} style={style}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`hb-pill-tab${value === opt.value ? " hb-pill-tab-active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ‹ Fenster-Label › zum Blättern durch ältere/neuere Chart-Bereiche. `offset`
// zählt von neu (0) nach alt (maxOffset). Ersetzt das mehrfach duplizierte
// Scroll-Nav-Markup. Der äußere Wrapper (visibility/bedingtes Rendern) bleibt
// beim Aufrufer, da er je nach Layout variiert.
export function ChartScrollNav({ offset, maxOffset, onOffsetChange, label, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, ...style }}>
      <button
        type="button"
        className="hb-icon-btn"
        onClick={() => onOffsetChange(Math.min(offset + 1, maxOffset))}
        disabled={offset >= maxOffset}
        title="Älteren Bereich anzeigen"
        aria-label="Älteren Bereich anzeigen"
      >‹</button>
      <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{label}</span>
      <button
        type="button"
        className="hb-icon-btn"
        onClick={() => onOffsetChange(Math.max(offset - 1, 0))}
        disabled={offset === 0}
        title="Neueren Bereich anzeigen"
        aria-label="Neueren Bereich anzeigen"
      >›</button>
    </div>
  );
}
