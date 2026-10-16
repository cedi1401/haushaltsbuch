import React, { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevron, IconEdit, IconPlus } from "../components/icons.jsx";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { focusFirstMenuItem, handleMenuKeyDown } from "../components/menuKeyboard.js";

/**
 * Buch-Auswahl der Toolbar: Flyout mit den Büchern und darunter den seltenen
 * Buchaktionen („Neues Buch“, „Buch verwalten …“). Ersetzt das native
 * <select>, das keine Aktionen und keine Trennlinie aufnehmen kann.
 */
export default function BookPicker({ books, activeBookId, onBookChange, onCreateBook, onManageBook }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const activeBook = books.find((b) => b.id === activeBookId);

  useClickOutside(wrapRef, () => setOpen(false), { enabled: open });

  useEffect(() => {
    if (!open) return;
    // Wie OverflowMenu: Escape in der Capture-Phase abfangen.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const checked = menuRef.current?.querySelector("[aria-checked='true']");
    if (checked) checked.focus();
    else focusFirstMenuItem(menuRef.current);
  }, [open]);

  function choose(action) {
    setOpen(false);
    triggerRef.current?.focus();
    action();
  }

  return (
    <div className="hb-overflow hb-book-picker" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="hb-input hb-book-picker-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Buch: ${activeBook?.name || ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hb-book-picker-name">{activeBook?.name || "—"}</span>
        <IconChevron width={14} height={14} />
      </button>
      {open && (
        <div
          className="hb-overflow-menu hb-book-picker-menu"
          role="menu"
          aria-label="Buch"
          aria-orientation="vertical"
          ref={menuRef}
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current)}
        >
          <div className="hb-book-picker-list">
            {books.map((b) => {
              const isActive = b.id === activeBookId;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className="hb-overflow-item"
                  onClick={() => choose(() => onBookChange(b.id))}
                >
                  <span className="hb-book-picker-check">{isActive && <IconCheck />}</span>
                  <span className="hb-book-picker-name">{b.name}</span>
                </button>
              );
            })}
          </div>
          <div className="hb-overflow-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="hb-overflow-item"
            onClick={() => choose(onCreateBook)}
          >
            <span className="hb-book-picker-check"><IconPlus /></span>
            Neues Buch
          </button>
          <button
            type="button"
            role="menuitem"
            className="hb-overflow-item"
            onClick={() => choose(onManageBook)}
          >
            <span className="hb-book-picker-check"><IconEdit /></span>
            Buch verwalten …
          </button>
        </div>
      )}
    </div>
  );
}
