import React, { useState } from "react";
import { CHART_COLORS } from "../utils/hbPalette.js";

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
 *
 * Props:
 *   label       {string}
 *   value       {{ categoryId: string|null, subcategoryId: string|null }}
 *   categories  {Array}   [{ id, name, color, subcategories: [{ id, name }] }]
 *   onChange     {({ categoryId, subcategoryId }) => void}
 *   disabled    {boolean}
 */
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

  // Unique name for the radio group so only one can be selected
  const radioName = "hb-hcat-radio";

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

      <div className="hb-hcat-box">
        {(categories || []).map((cat) => {
          const hasSubs = (cat.subcategories || []).length > 0;
          const isExpanded = expanded.has(cat.id);
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
                  <span className="hb-hcat-parent-name">{cat.name}</span>
                </label>

                {hasSubs && (
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
                  {cat.subcategories.map((sub) => {
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
                        <span className="hb-hcat-sub-name">{sub.name}</span>
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
