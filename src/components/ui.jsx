import React from "react";
import { IconChevronLeft, IconChevronRight } from "./icons.jsx";

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

// `ref` wird durchgereicht (React 19: ref ist eine normale Prop), damit
// Aufrufer den Fokus zurückgeben können — z.B. nach dem Schließen eines
// Sub-Dialogs.
export function Button({ children, onClick, variant = "solid", size, disabled, type = "button", style, className, ref }) {
  const cls = [
    variant === "outline" ? "hb-btn hb-btn-outline" : "hb-btn",
    size === "sm" ? "hb-btn-sm" : null,
    className,
  ].filter(Boolean).join(" ");
  return (
    <button ref={ref} className={cls} onClick={onClick} disabled={disabled} type={type} style={style}>
      {children}
    </button>
  );
}

// Segmentierte Auswahl (Zeitraum-/Modus-Umschalter) auf Basis von
// `.hb-segmented`. `options`: [{ value, label }]. `size="md"` und `full`
// sind die Formular-Variante: größer und über die ganze Feldbreite verteilt.
export function RangeTabs({ options, value, onChange, ariaLabel, style, size, full = false }) {
  const cls = [
    "hb-segmented",
    size === "md" ? "hb-segmented--md" : null,
    full ? "hb-segmented--full" : null,
  ].filter(Boolean).join(" ");
  return (
    <div className={cls} role="group" aria-label={ariaLabel} style={style}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            className={`hb-segmented__item${active ? " hb-segmented__item--active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ‹ Fenster-Label › zum Blättern durch ältere/neuere Chart-Bereiche. `offset`
// zählt von neu (0) nach alt (maxOffset). Ersetzt das mehrfach duplizierte
// Scroll-Nav-Markup. Der äußere Wrapper (visibility/bedingtes Rendern) bleibt
// beim Aufrufer, da er je nach Layout variiert.
export function ChartScrollNav({ offset, maxOffset, onOffsetChange, label, style }) {
  return (
    <div className="hb-chart-nav" style={{ display: "flex", alignItems: "center", gap: 4, ...style }}>
      <button
        type="button"
        className="hb-icon-btn"
        onClick={() => onOffsetChange(Math.min(offset + 1, maxOffset))}
        disabled={offset >= maxOffset}
        title="Älteren Bereich anzeigen"
        aria-label="Älteren Bereich anzeigen"
      ><IconChevronLeft /></button>
      <span className="hb-muted" style={{ fontSize: 11, whiteSpace: "nowrap", minWidth: 116, textAlign: "center" }}>{label}</span>
      <button
        type="button"
        className="hb-icon-btn"
        onClick={() => onOffsetChange(Math.max(offset - 1, 0))}
        disabled={offset === 0}
        title="Neueren Bereich anzeigen"
        aria-label="Neueren Bereich anzeigen"
      ><IconChevronRight /></button>
    </div>
  );
}
