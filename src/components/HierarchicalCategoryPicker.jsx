import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { CHART_COLORS } from "../utils/hbPalette.js";
import { EMPTY_ARRAY } from "../utils/constants.js";
import { IconChevron, IconSearch } from "./icons.jsx";

/**
 * HierarchicalCategoryPicker
 *
 * Inline scrollable accordion list with radio-button selection.
 * No dropdown/popup -- renders directly in the form flow.
 *
 * - All parent categories are always visible
 * - Clicking a parent row toggles its subcategory accordion (only one open at a time)
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
 *   recent      {Array}   optional [{ categoryId, subcategoryId }] — erscheinen
 *                         als Gruppe „Zuletzt verwendet“ über der Liste
 *                         (ausgeblendet, solange gefiltert wird)
 *   autoFocusFilter {boolean} Filterfeld beim Einblenden fokussieren (Flyout)
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
  recent = EMPTY_ARRAY,
  autoFocusFilter = false,
}) {
  const { categoryId, subcategoryId } = value || {};

  // Track which parent categories are expanded (by id)
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand the parent that contains the current selection
    if (categoryId) return new Set([categoryId]);
    return new Set();
  });

  // Wechselt die Auswahl von außen (z.B. per Vorlage) auf eine
  // Unterkategorie, deren Elternkategorie aufklappen — sonst wäre die
  // Auswahl unsichtbar. Aus dem Prop-Übergang abgeleitet statt per Effect.
  const [prevSelection, setPrevSelection] = useState({ categoryId, subcategoryId });
  if (prevSelection.categoryId !== categoryId || prevSelection.subcategoryId !== subcategoryId) {
    setPrevSelection({ categoryId, subcategoryId });
    if (categoryId && subcategoryId && !expanded.has(categoryId)) {
      setExpanded(new Set([categoryId]));
    }
  }

  // Ausgewählte Zeile in den sichtbaren Bereich der Liste scrollen. Nur die
  // Liste selbst scrollt, nicht der Dialog drumherum.
  const boxRef = useRef(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !categoryId) return;
    const row = box.querySelector(".hb-hcat-sub-row--selected, .hb-hcat-parent-row--selected");
    if (!row) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < boxRect.top) {
      box.scrollTop -= boxRect.top - rowRect.top;
    } else if (rowRect.bottom > boxRect.bottom) {
      box.scrollTop += rowRect.bottom - boxRect.bottom;
    }
  }, [categoryId, subcategoryId]);

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

  // „Zuletzt verwendet“: nur Einträge, deren Kategorie (und ggf.
  // Unterkategorie) es noch gibt.
  const recentItems = useMemo(() => {
    const items = [];
    const byId = new Map(allCategories.map((c) => [c.id, c]));
    for (const r of recent) {
      const cat = byId.get(r.categoryId);
      if (!cat) continue;
      const sub = r.subcategoryId ? (cat.subcategories || []).find((s) => s.id === r.subcategoryId) : null;
      if (r.subcategoryId && !sub) continue;
      items.push({ cat, sub });
    }
    return items;
  }, [recent, allCategories]);
  const showRecent = !query && recentItems.length > 0;

  // ── handlers ─────────────────────────────────────────────────────────

  // Accordion: Aufklappen einer Kategorie klappt alle anderen zu.
  function toggleExpand(catId) {
    const opening = !expanded.has(catId);
    setExpanded(opening ? new Set([catId]) : new Set());
    revealRef.current = opening ? catId : null;
  }

  // Aufgeklappte Gruppe ganz unten in der Liste: so weit scrollen, dass die
  // Unterkategorien sichtbar werden — die Hauptkategorie bleibt dabei oben im Bild.
  const revealRef = useRef(null);
  useEffect(() => {
    const catId = revealRef.current;
    revealRef.current = null;
    const box = boxRef.current;
    if (!catId || !box) return;
    const group = box.querySelector(`[data-hcat-id="${CSS.escape(catId)}"]`);
    if (!group) return;
    const boxRect = box.getBoundingClientRect();
    const groupRect = group.getBoundingClientRect();
    const overflow = groupRect.bottom - boxRect.bottom;
    if (overflow > 0) box.scrollTop += Math.min(overflow, groupRect.top - boxRect.top);
  }, [expanded]);

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
            aria-label="Kategorien filtern"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={disabled}
            autoComplete="off"
            autoFocus={autoFocusFilter}
          />
        </div>
      )}

      <div className="hb-hcat-box" ref={boxRef}>
        {showRecent && (
          <div className="hb-hcat-group hb-hcat-recent" role="group" aria-label="Zuletzt verwendet">
            <div className="hb-hcat-section-label">Zuletzt verwendet</div>
            {recentItems.map(({ cat, sub }) => {
              const selected = sub ? isSubSelected(cat.id, sub.id) : isParentSelected(cat.id);
              const name = sub ? `${cat.name} › ${sub.name}` : cat.name;
              return (
                <label
                  key={`${cat.id}|${sub?.id || ""}`}
                  className={"hb-hcat-sub-row hb-hcat-recent-row" + (selected ? " hb-hcat-sub-row--selected" : "")}
                >
                  <input
                    type="radio"
                    name={`${radioName}-recent`}
                    className="hb-hcat-radio"
                    checked={selected}
                    onChange={() => (sub ? handleSubSelect(cat, sub) : handleParentSelect(cat))}
                    disabled={disabled}
                  />
                  <span
                    className="hb-cat-dot"
                    style={{ background: cat.color || CHART_COLORS.transfer, flexShrink: 0 }}
                  />
                  <span className="hb-hcat-sub-name" title={name}>{name}</span>
                </label>
              );
            })}
          </div>
        )}

        {showRecent && groups.length > 0 && (
          <div className="hb-hcat-section-label hb-hcat-section-label--all">Alle Kategorien</div>
        )}

        {groups.length === 0 && (
          <div className="hb-hcat-empty">Keine Kategorie gefunden.</div>
        )}

        {groups.map(({ cat, subs }) => {
          const hasSubs = subs.length > 0;
          // Während gefiltert wird, öffnet die Suche die Treffer.
          const isExpanded = query ? hasSubs : expanded.has(cat.id);
          const parentSelected = isParentSelected(cat.id);

          return (
            <div key={cat.id} className="hb-hcat-group" data-hcat-id={cat.id}>
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
                    <IconChevron />
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
