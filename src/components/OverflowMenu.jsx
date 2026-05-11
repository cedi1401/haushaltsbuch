import React, { useEffect, useRef, useState } from "react";
import { IconMore } from "./icons.jsx";
import { useClickOutside } from "../hooks/useClickOutside.js";

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
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open && menuRef.current) {
      const first = menuRef.current.querySelector("[role='menuitem']:not(:disabled)");
      first?.focus();
    }
  }, [open]);

  if (!items.length) return null;

  function handleMenuKeyDown(e) {
    const focusable = Array.from(
      menuRef.current?.querySelectorAll("[role='menuitem']:not(:disabled)") ?? []
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
          onKeyDown={handleMenuKeyDown}
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
