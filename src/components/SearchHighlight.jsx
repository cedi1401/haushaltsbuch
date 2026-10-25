import React from "react";

/** Markiert die Treffer der Suche in einem Zellentext. */
export default function SearchHighlight({ text, pattern }) {
  if (!pattern || !text) return text || null;
  // split() mit Fanggruppe: Treffer stehen an den ungeraden Indizes.
  return text.split(pattern).map((part, i) =>
    // react-doctor-disable-next-line react-doctor/no-array-index-as-key -- Teile eines festen Texts, Reihenfolge ändert sich nie
    i % 2 === 1 ? <mark key={i} className="hb-search-hit">{part}</mark> : part
  );
}
