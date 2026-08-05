import React, { useEffect, useRef } from "react";
import { Button } from "./ui.jsx";
import { IconClose } from "./icons.jsx";

// Stack aller offenen Dialoge. Escape und Strg+Enter dürfen nur auf den
// obersten wirken — sonst schließt ein Sub-Dialog (z.B. im Kategorien-Manager)
// den Dialog darunter gleich mit.
const dialogStack = [];

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
  // Bei Formular-Dialogen den Body NICHT scrollbar machen, damit
  // Popovers (z.B. HbDatePicker) sauber über den Body hinausragen
  // können statt eine Scrollbar zu erzeugen.
  bodyScroll = true,
}) {
  const panelRef = useRef(null);
  // Stabile Identität dieser Dialoginstanz im Stack
  const stackTokenRef = useRef({});

  useEffect(() => {
    if (!open) return;
    const token = stackTokenRef.current;
    dialogStack.push(token);
    return () => {
      const i = dialogStack.lastIndexOf(token);
      if (i !== -1) dialogStack.splice(i, 1);
    };
  }, [open]);

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
      // Nur der oberste Dialog reagiert
      if (dialogStack[dialogStack.length - 1] !== stackTokenRef.current) return;
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
        className={`hb-modal-panel${size === "medium" ? " hb-modal-panel-medium" : size === "wide" ? " hb-modal-panel-wide" : size === "full" ? " hb-modal-panel-full" : ""}${!bodyScroll ? " hb-modal-panel--form" : ""}`}
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
