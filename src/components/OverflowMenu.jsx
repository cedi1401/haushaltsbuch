import React, { useEffect, useRef, useState } from "react";
import { IconMore } from "./icons.jsx";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { focusFirstMenuItem, handleMenuKeyDown } from "./menuKeyboard.js";

/**
 * Compact kebab-menu for secondary actions.
 * `items`: [{ label, onClick, disabled?, danger? }]
 */
export default function OverflowMenu({ items = [], label = "Weitere Aktionen", buttonClassName }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useClickOutside(wrapRef, () => setOpen(false), { enabled: open });

  useEffect(() => {
    if (!open) return;
    // Capture-Phase auf document, damit ein offenes Menü Escape abfängt, bevor
    // ein darunterliegender EditDialog (window/Bubble) sich mitschließt.
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
    if (open) focusFirstMenuItem(menuRef.current);
  }, [open]);

  if (!items.length) return null;

  return (
    <div className="hb-overflow" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName || "hb-icon-btn"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore />
      </button>
      {open && (
        <div
          className="hb-overflow-menu"
          role="menu"
          aria-orientation="vertical"
          ref={menuRef}
          onKeyDown={(e) => handleMenuKeyDown(e, menuRef.current)}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`hb-overflow-item ${item.danger ? "hb-overflow-danger" : ""}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
