import React from "react";
import { ENTRY_KINDS, ENTRY_KIND_LABELS } from "../utils/constants.js";

/**
 * Buchungsart-Auswahl als Segmented Control.
 *
 * Ersetzt das frühere <select> in den beiden Buchungs-Dialogen: vier feste
 * Optionen, die als Ein-Klick-Auswahl schneller und sichtbarer sind als eine
 * aufklappende Liste. Geteilte Komponente, damit „Buchung hinzufügen" und
 * „Eintrag bearbeiten" garantiert dieselbe Reihenfolge und Beschriftung zeigen.
 */
export function EntryKindSelector({ value, onChange, disabled }) {
  return (
    <div
      className="hb-segmented hb-segmented--md hb-segmented--full"
      role="group"
      aria-label="Art der Buchung"
    >
      {ENTRY_KINDS.map((kind) => {
        const active = value === kind;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            className={`hb-segmented__item${active ? " hb-segmented__item--active" : ""}`}
            onClick={() => onChange(kind)}
          >
            {ENTRY_KIND_LABELS[kind]}
          </button>
        );
      })}
    </div>
  );
}
