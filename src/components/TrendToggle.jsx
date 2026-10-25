import React from "react";

/**
 * Schalter „Im Trend auflisten" in den Dialogen der Fixkosten und Rücklagen.
 * `subject` ist der Satzanfang der Erklärung, z.B. „Die Position".
 *
 * @param {{ checked: boolean, onChange: (checked: boolean) => void, subject: string }} props
 */
export default function TrendToggle({ checked, onChange, subject }) {
  return (
    <label className="hb-fct-annual-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--accent)" }}
      />
      <div>
        <div style={{ fontWeight: "var(--type-body-sm-strong-weight)", fontSize: "var(--type-body-sm-strong-size)" }}>Im Trend auflisten</div>
        <div style={{ fontSize: "var(--type-caption-size)", color: "var(--muted)", marginTop: 2 }}>
          {subject} erscheint in der Liste unter „Fixkosten-Entwicklung“. Auf die Kennzahlen hat
          das keinen Einfluss.
        </div>
      </div>
    </label>
  );
}
