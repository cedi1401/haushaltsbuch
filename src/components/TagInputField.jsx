import React, { useMemo, useState } from "react";
import { IconClose, IconPlus, IconTag } from "./icons.jsx";

const MAX_TAG_LENGTH = 30;
const MAX_SUGGESTIONS = 8;

/**
 * Tag-Feld eines Dialogs: Chips mit Entfernen-Knopf, Eingabe (Enter oder Komma
 * fügt hinzu, Backspace im leeren Feld entfernt den letzten) und darunter
 * Vorschläge aus den Tags, die im Buch schon vorkommen.
 *
 * @param {{ tags: string[], onChange: (tags: string[]) => void, knownTags?: string[] }} props
 */
export default function TagInputField({ tags, onChange, knownTags = [] }) {
  const [input, setInput] = useState("");

  const suggestions = useMemo(() => {
    const existing = new Set(tags);
    const query = input.trim().toLowerCase();
    return knownTags
      .filter((t) => !existing.has(t) && (!query || t.toLowerCase().includes(query)))
      .slice(0, MAX_SUGGESTIONS);
  }, [knownTags, tags, input]);

  function add(text) {
    const tag = text.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  }

  function remove(tag) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="hb-field" style={{ width: "100%" }}>
      <div className="hb-label">Tags</div>
      <div className="hb-tag-input-field">
        {tags.map((tag) => (
          <span key={tag} className="hb-tag-chip">
            <IconTag width={13} height={13} />
            {tag}
            <button
              type="button"
              className="hb-tag-chip-remove"
              onClick={() => remove(tag)}
              aria-label={`Tag ${tag} entfernen`}
            >
              <IconClose width={12} height={12} strokeWidth={2.2} />
            </button>
          </span>
        ))}
        <input
          type="text"
          aria-label="Tags"
          placeholder={tags.length === 0 ? "Tag eingeben und Enter drücken…" : ""}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && !input && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="hb-tag-suggestions">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              className="hb-tag-suggestion-pill"
              onClick={() => add(tag)}
            >
              <IconPlus width={12} height={12} />
              <IconTag width={13} height={13} />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
