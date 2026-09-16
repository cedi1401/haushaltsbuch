import React from "react";

/**
 * Fluent-ToggleSwitch für binäre Einstellungen, die sofort wirken
 * (im Gegensatz zur Checkbox, die auf ein „Speichern" wartet).
 * `label` ist Pflicht — der Schalter trägt keine sichtbare Beschriftung.
 *
 * `trackIcons` ({ off, on }) legt zwei Glyphen fest in die Spur — `off` links,
 * `on` rechts. Der Knopf gleitet darüber und verdeckt genau eines; sichtbar
 * bleibt das Symbol des aktiven Zustands. Nur mit einer Größen-Variante
 * sinnvoll, im 40×20-Standard ist dafür kein Platz.
 */
export default function HbSwitch({ checked, onChange, label, disabled, className, trackIcons }) {
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
      {trackIcons ? (
        <>
          <span className="hb-switch-icon hb-switch-icon--off" aria-hidden="true">{trackIcons.off}</span>
          <span className="hb-switch-icon hb-switch-icon--on" aria-hidden="true">{trackIcons.on}</span>
        </>
      ) : null}
      <span className="hb-switch-knob" />
    </button>
  );
}
