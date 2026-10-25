import React from "react";
import { IconSearch, IconClose } from "./icons.jsx";

/** Suchfeld in der Kopfzeile einer Buchungstabelle, mit ×-Button und Escape zum Leeren. */
export default function EntrySearchField({ ref, query, onQueryChange, onClear, placeholder = "Notiz, Betrag oder Kategorie suchen…" }) {
  return (
    <div className="hb-search-field hb-entries-search">
      <span className="hb-search-icon"><IconSearch width={16} height={16} /></span>
      <input
        ref={ref}
        className={`hb-input${query ? " hb-input--clearable" : ""}`}
        type="search"
        placeholder={placeholder}
        aria-label="Buchungen durchsuchen"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            onQueryChange("");
          }
        }}
        autoComplete="off"
      />
      {query ? (
        <button
          type="button"
          className="hb-icon-btn hb-icon-btn--subtle hb-search-clear"
          onClick={onClear}
          aria-label="Suche leeren"
          title="Suche leeren"
        >
          <IconClose width={14} height={14} />
        </button>
      ) : null}
    </div>
  );
}
