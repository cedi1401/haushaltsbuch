import React from "react";

/**
 * Fluent-ToggleSwitch für binäre Einstellungen, die sofort wirken
 * (im Gegensatz zur Checkbox, die auf ein „Speichern" wartet).
 * `label` ist Pflicht — der Schalter trägt keine sichtbare Beschriftung.
 *
 * `knobIcon` zeichnet optional ein Glyph in den gleitenden Knopf, das den
 * *aktuellen* Zustand zeigt (nicht die Aktion). Nur zusammen mit einer
 * Größen-Variante sinnvoll — im 12-px-Standardknopf ist kein Icon lesbar.
 */
export default function HbSwitch({ checked, onChange, label, disabled, className, knobIcon }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`hb-switch${className ? ` ${className}` : ""}`}
      onClick={() => onChange?.(!checked)}
    >
      <span className="hb-switch-knob">{knobIcon}</span>
    </button>
  );
}
