import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  IconBook,
  IconPots,
  IconGoals,
  IconFixed,
  IconTrend,
} from "../components/icons.jsx";

const NAV_ITEMS = [
  { id: "book", label: "Dashboard", Icon: IconBook },
  { id: "pots", label: "Töpfe", Icon: IconPots },
  { id: "goals", label: "Sparziele", Icon: IconGoals },
  { id: "fixed", label: "Fixkosten", Icon: IconFixed },
  { id: "trend", label: "Trend", Icon: IconTrend },
];

export default function NavDrawer({ open, onClose, view, onChangeView, anchor }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="hb-nav-popup-backdrop" onMouseDown={() => onClose?.()} />
      <div
        className="hb-nav-popup"
        role="menu"
        style={{
          top: anchor?.top ?? 56,
          left: Math.min(anchor?.left ?? 8, window.innerWidth - 240),
        }}
      >
        {NAV_ITEMS.map((item) => {
          const { id, label } = item;
          const NavIcon = item.Icon;
          return (
            <button
              key={id}
              className={`hb-nav-item ${view === id ? "hb-nav-item-active" : ""}`}
              onClick={() => {
                onChangeView?.(id);
                onClose?.();
              }}
              role="menuitem"
              type="button"
            >
              <span className="hb-nav-item-icon"><NavIcon /></span>
              {label}
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );
}
