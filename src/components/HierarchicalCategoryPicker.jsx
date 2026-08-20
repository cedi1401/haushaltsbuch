import React, { useId, useMemo, useState } from "react";
import { CHART_COLORS } from "../utils/hbPalette.js";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { IconSearch } from "./icons.jsx";

/**
 * HierarchicalCategoryPicker
 *
 * Inline scrollable accordion list with radio-button selection.
 * No dropdown/popup -- renders directly in the form flow.
 *
 * - All parent categories are always visible
 * - Clicking a parent row toggles its subcategory accordion
 * - Radio buttons allow selecting exactly ONE item (parent OR sub)
 * - Selecting a subcategory sets both categoryId and subcategoryId
 * - Selecting a parent sets categoryId only (subcategoryId = null)
 * - Ab FILTER_MIN_CATEGORIES Kategorien blendet sich ein Filterfeld über der
 *   Liste ein; solange gefiltert wird, steuert die Suche das Auf-/Zuklappen
 *   (der Chevron wäre dann ein Bedienelement ohne sichtbare Wirkung und
 *   wird deshalb ausgeblendet).
 *
 * Props:
 *   label       {string}
 *   value       {{ categoryId: string|null, subcategoryId: string|null }}
 *   categories  {Array}   [{ id, name, color, subcategories: [{ id, name }] }]
 *   onChange     {({ categoryId, subcategoryId }) => void}
 *   disabled    {boolean}
 */

// Unter dieser Anzahl lohnt sich das Filterfeld nicht — es wäre nur Chrome.
const FILTER_MIN_CATEGORIES = 6;

function normalize(text) {
  return (text || "").toLocaleLowerCase("de");
}

export function HierarchicalCategoryPicker({
  label,
  value,
  categories,
  onChange,
  disabled,
}) {
  const { categoryId, subcategoryId } = value || {};

  // Track which parent categories are expanded (by id)
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand the parent that contains the current selection
    if (categoryId) return new Set([categoryId]);
    return new Set();
  });

  const [filter, setFilter] = useState("");

  // Eindeutiger Radio-Group-Name pro Picker-Instanz, damit zwei gleichzeitig
  // offene Picker (z.B. Buchungsdialog + Vorlagen-Editor) sich nicht die
  // Auswahl gegenseitig überschreiben.
  const radioName = `hb-hcat-radio-${useId()}`;

  const allCategories = categories || EMPTY_ARRAY;
  const showFilter = allCategories.length >= FILTER_MIN_CATEGORIES;
  const query = showFilter ? normalize(filter.trim()) : "";

  // Trefferliste: Ein Parent-Treffer zeigt alle seine Unterkategorien, ein
  // reiner Sub-Treffer nur die passenden Unterkategorien.
  const groups = useMemo(() => {
    if (!query) {
      return allCategories.map((cat) => ({ cat, subs: cat.subcategories || [] }));
    }
    const hits = [];
    for (const cat of allCategories) {
      const subs = cat.subcategories || [];
      if (normalize(cat.name).includes(query)) {
        hits.push({ cat, subs });
        continue;
      }
      const subHits = subs.filter((sub) => normalize(sub.name).includes(query));
      if (subHits.length > 0) hits.push({ cat, subs: subHits });
    }
    return hits;
  }, [allCategories, query]);

  // ── handlers ─────────────────────────────────────────────────────────

  function toggleExpand(catId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  }

  function handleParentSelect(cat) {
    if (disabled) return;
    onChange({ categoryId: cat.id, subcategoryId: null });
  }

  function handleSubSelect(parentCat, sub) {
    if (disabled) return;
    onChange({ categoryId: parentCat.id, subcategoryId: sub.id });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  function isParentSelected(catId) {
    return categoryId === catId && !subcategoryId;
  }

  function isSubSelected(catId, subId) {
    return categoryId === catId && subcategoryId === subId;
  }

  // ── render ───────────────────────────────────────────────────────────
  return (
    <div className="hb-field hb-hcat-picker">
      {label && <div className="hb-label">{label}</div>}

      {showFilter && (
        <div className="hb-search-field hb-search-field--block">
          <span className="hb-search-icon"><IconSearch width={16} height={16} /></span>
          <input
            className="hb-input"
            type="text"
            placeholder="Kategorie filtern..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      )}

      <div className="hb-hcat-box">
        {groups.length === 0 && (
          <div className="hb-hcat-empty">Keine Kategorie gefunden.</div>
        )}

        {groups.map(({ cat, subs }) => {
          const hasSubs = subs.length > 0;
          // Während gefiltert wird, öffnet die Suche die Treffer.
          const isExpanded = query ? hasSubs : expanded.has(cat.id);
          const parentSelected = isParentSelected(cat.id);

          return (
            <div key={cat.id} className="hb-hcat-group">
              {/* Parent category row */}
              <div
                className={
                  "hb-hcat-parent-row" +
                  (parentSelected ? " hb-hcat-parent-row--selected" : "")
                }
              >
                <label className="hb-hcat-radio-label">
                  <input
                    type="radio"
                    name={radioName}
                    className="hb-hcat-radio"
                    checked={parentSelected}
                    onChange={() => handleParentSelect(cat)}
                    disabled={disabled}
                  />
                  <span
                    className="hb-cat-dot"
                    style={{
                      background: cat.color || CHART_COLORS.transfer,
                      flexShrink: 0,
                    }}
                  />
                  <span className="hb-hcat-parent-name" title={cat.name}>{cat.name}</span>
                </label>

                {hasSubs && !query && (
                  <button
                    type="button"
                    className={
                      "hb-hcat-expand-btn" +
                      (isExpanded ? " hb-hcat-expand-btn--open" : "")
                    }
                    onClick={() => toggleExpand(cat.id)}
                    disabled={disabled}
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded
                        ? `${cat.name} zuklappen`
                        : `${cat.name} aufklappen`
                    }
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M4.5 6L8 9.5L11.5 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Subcategory accordion */}
              {hasSubs && isExpanded && (
                <div className="hb-hcat-sub-list">
                  {subs.map((sub) => {
                    const subSelected = isSubSelected(cat.id, sub.id);
                    return (
                      <label
                        key={sub.id}
                        className={
                          "hb-hcat-sub-row" +
                          (subSelected ? " hb-hcat-sub-row--selected" : "")
                        }
                      >
                        <input
                          type="radio"
                          name={radioName}
                          className="hb-hcat-radio"
                          checked={subSelected}
                          onChange={() => handleSubSelect(cat, sub)}
                          disabled={disabled}
                        />
                        <span
                          className="hb-cat-dot"
                          style={{
                            background: cat.color || CHART_COLORS.transfer,
                            opacity: 0.55,
                            flexShrink: 0,
                          }}
                        />
                        <span className="hb-hcat-sub-name" title={sub.name}>{sub.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
