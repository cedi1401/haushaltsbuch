import React, { useId } from "react";
import { NO_PURPOSE_LABEL } from "../utils/transferCategoryUtils.js";

/**
 * Auswahl der Sparposition bei Transfer und Entnahme (Buchungsdialoge,
 * Töpfe, Vorlagen). „Ohne Sparposition" (Wert "") steht in jedem Topf zur
 * Wahl — das Geld zählt dann zum Topf, aber zu keiner Position und erscheint
 * in den Rücklagen unter „Ohne Sparposition".
 *
 * @param {{
 *   value: string,
 *   onChange: (id: string) => void,
 *   options: Array<{ id: string, label: string }>,
 *   children?: React.ReactNode,
 * }} props - `options` aus getTransferCategoryOptions; `children` steht unter
 *   dem Feld (z.B. ein Link).
 */
export default function PurposeSelect({ value, onChange, options, children }) {
  const id = useId();
  return (
    <div className="hb-field">
      <label className="hb-label" htmlFor={id}>Sparposition</label>
      <select id={id} className="hb-input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">{NO_PURPOSE_LABEL}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
      {children}
    </div>
  );
}
