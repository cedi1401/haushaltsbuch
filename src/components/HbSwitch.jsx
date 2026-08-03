import React from "react";

/**
 * Fluent-ToggleSwitch für binäre Einstellungen, die sofort wirken
 * (im Gegensatz zur Checkbox, die auf ein „Speichern" wartet).
 * `label` ist Pflicht — der Schalter trägt keine sichtbare Beschriftung.
 */
export default function HbSwitch({ checked, onChange, label, disabled, className }) {
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
      <span className="hb-switch-knob" />
    </button>
  );
}
