import React, { useEffect } from "react";
import { Button } from "./ui.jsx";

export default function EditDialog({
  open,
  title,
  onClose,
  onSave,
  canSave,
  children,
  saveLabel,
}) {
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
      <div className="hb-modal-panel">
        <div className="hb-modal-head">
          <div>
            <div className="hb-modal-title">{title}</div>
            <div className="hb-muted">ESC schließt, Ctrl/Cmd+Enter speichert.</div>
          </div>
          <button className="hb-icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="hb-modal-body">{children}</div>

        <div className="hb-modal-foot">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {saveLabel || "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  );
}
