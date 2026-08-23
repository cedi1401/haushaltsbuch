import React, { useState, useRef, useEffect } from "react";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { IconCheck, IconColumns } from "./icons.jsx";

/**
 * Spaltenauswahl einer DataTable.
 *
 * Mechanik und Optik folgen dem Gruppen-Flyout im Kostenrechner
 * (`CostGroupsView`): Häkchen statt Checkbox-Kasten, Klick ausserhalb, Escape,
 * Pfeiltasten-Navigation. Rolle ist hier `menuitemcheckbox` — mehrere Spalten
 * sind gleichzeitig aktiv.
 *
 * Nicht abwählbare Spalten erscheinen ausgegraut und angehakt statt zu fehlen.
 */
export default function ColumnsFlyout({ columns, visibleIds, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  useClickOutside(wrapRef, () => setOpen(false), { enabled: open });

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.querySelector("[role='menuitemcheckbox']:not(:disabled)")?.focus();
    }
  }, [open]);

  function handleMenuKeyDown(e) {
    const focusable = Array.from(
      listRef.current?.querySelectorAll(
        "[role='menuitemcheckbox']:not(:disabled),[role='menuitem']"
      ) ?? []
    );
    const idx = focusable.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusable[(idx + 1) % focusable.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusable[(idx - 1 + focusable.length) % focusable.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      focusable[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      focusable[focusable.length - 1]?.focus();
    }
  }

  const visible = new Set(visibleIds);

  return (
    <div className="hb-dt-columns" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="hb-dt-columns-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Sichtbare Spalten wählen"
      >
        <IconColumns width={16} height={16} />
        Spalten
      </button>
      {open && (
        <div
          className="hb-dt-columns-list"
          role="menu"
          aria-orientation="vertical"
          ref={listRef}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="hb-dt-columns-title">Spalten</div>
          {columns.map((col) => {
            const checked = col.alwaysVisible || visible.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                disabled={col.alwaysVisible}
                title={col.alwaysVisible ? `${col.label} bleibt immer sichtbar.` : undefined}
                className={"hb-dt-columns-item" + (checked ? " hb-dt-columns-item--active" : "")}
                onClick={() => onToggle(col.id)}
              >
                <span className="hb-dt-columns-item-name">{col.label}</span>
                {checked && <IconCheck width={16} height={16} className="hb-dt-columns-item-check" />}
              </button>
            );
          })}
          <div className="hb-dt-columns-divider" />
          <button
            type="button"
            role="menuitem"
            className="hb-dt-columns-item hb-dt-columns-item--reset"
            onClick={() => { onReset(); setOpen(false); triggerRef.current?.focus(); }}
          >
            <span className="hb-dt-columns-item-name">Standard wiederherstellen</span>
          </button>
        </div>
      )}
    </div>
  );
}
