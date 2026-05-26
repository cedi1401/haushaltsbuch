import React, { useEffect, useRef } from "react";
import { Button } from "./ui.jsx";
import { IconClose } from "./icons.jsx";

export default function EditDialog({
  open,
  title,
  onClose,
  onSave,
  canSave,
  children,
  saveLabel,
  size = "default",
  hideFooter = false,
}) {
  const panelRef = useRef(null);

  // Fokus ins Modal setzen wenn es öffnet (Electron braucht explizites focus management)
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      // Zuerst Electron-Window-Fokus sichern
      window.focus();
      // Dann erstes Input/Textarea/Select im Modal fokussieren
      const firstFocusable = panelRef.current?.querySelector(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (canSave) onSave?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onSave, canSave]);

  if (!open) return null;

  return (
    <div
      className="hb-modal"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hb-modal-overlay" />
      <div
        className={`hb-modal-panel${size === "medium" ? " hb-modal-panel-medium" : size === "wide" ? " hb-modal-panel-wide" : size === "full" ? " hb-modal-panel-full" : ""}`}
        ref={panelRef}
        tabIndex={-1}
        style={{ outline: "none" }}
      >
        <div className="hb-modal-head">
          <div>
            <div className="hb-modal-title">{title}</div>
          </div>
          <button
            className="hb-icon-btn"
            onClick={onClose}
            aria-label="Schließen"
            title="Schließen"
            type="button"
          >
            <IconClose />
          </button>
        </div>

        <div className="hb-modal-body">{children}</div>

        {!hideFooter && (
          <div className="hb-modal-foot">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={onSave} disabled={!canSave}>
              {saveLabel || "Speichern"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
