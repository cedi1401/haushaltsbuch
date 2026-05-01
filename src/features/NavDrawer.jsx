import React, { useEffect } from "react";

export default function NavDrawer({ open, onClose, view, onChangeView }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="hb-drawer"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="hb-drawer-overlay" />

      <div className="hb-drawer-panel">
        <div className="hb-drawer-head">
          <div>
            <div className="hb-drawer-title">MENÜ</div>
            <div className="hb-muted">ANSICHT WÄHLEN</div>
          </div>
          <button className="hb-icon-btn" onClick={onClose} aria-label="Schließen" type="button">
            ✕
          </button>
        </div>

        <div className="hb-drawer-body">
          <button
            className={`hb-nav-item ${view === "book" ? "hb-nav-item-active" : ""}`}
            onClick={() => {
              onChangeView?.("book");
              onClose?.();
            }}
            type="button"
          >
            HAUSHALTSBUCH
          </button>

          <button
            className={`hb-nav-item ${view === "pots" ? "hb-nav-item-active" : ""}`}
            onClick={() => {
              onChangeView?.("pots");
              onClose?.();
            }}
            type="button"
          >
            TÖPFE
          </button>

          <button
            className={`hb-nav-item ${view === "goals" ? "hb-nav-item-active" : ""}`}
            onClick={() => {
              onChangeView?.("goals");
              onClose?.();
            }}
            type="button"
          >
            SPARZIELE
          </button>

          <button
            className={`hb-nav-item ${view === "fixed" ? "hb-nav-item-active" : ""}`}
            onClick={() => {
              onChangeView?.("fixed");
              onClose?.();
            }}
            type="button"
          >
            FIXKOSTEN
          </button>

          <button
            className={`hb-nav-item ${view === "trend" ? "hb-nav-item-active" : ""}`}
            onClick={() => {
              onChangeView?.("trend");
              onClose?.();
            }}
            type="button"
          >
            TREND
          </button>
        </div>

        <div className="hb-drawer-foot hb-muted">TIPP: ESC SCHLIEẞT. KLICK AUSSERHALB SCHLIEẞT.</div>
      </div>
    </div>
  );
}