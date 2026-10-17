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
        <div style={{ fontWeight: 600, fontSize: 13 }}>Im Trend auflisten</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          {subject} erscheint in der Liste unter „Fixkosten-Entwicklung“. Auf die Kennzahlen hat
          das keinen Einfluss.
        </div>
      </div>
    </label>
  );
}
