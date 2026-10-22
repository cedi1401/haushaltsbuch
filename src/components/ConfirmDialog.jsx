import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "./ui.jsx";
import { IconClose } from "./icons.jsx";

// -------------------------------------------------------
// ConfirmDialog: Eigenständiges Modal (kein EditDialog-Wrapper)
// -------------------------------------------------------

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false,
    title: "Bestätigen",
    message: "",
    confirmLabel: "Bestätigen",
    cancelLabel: "Abbrechen",
    danger: false,
    confirmText: "",
    resolver: null,
  });

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: opts.title || "Bestätigen",
        message: opts.message || "",
        confirmLabel: opts.confirmLabel || "Bestätigen",
        cancelLabel: opts.cancelLabel || "Abbrechen",
        danger: opts.danger || false,
        confirmText: opts.confirmText || "",
        resolver: resolve,
      });
    });
  }, []);

  function handleClose(result) {
    state.resolver?.(result);
    setState((s) => ({ ...s, open: false, resolver: null }));
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <ConfirmModal
          title={state.title}
          message={state.message}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          danger={state.danger}
          confirmText={state.confirmText}
          onConfirm={() => handleClose(true)}
          onCancel={() => handleClose(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// `confirmText`: Sicherheitsabfrage – der Bestätigen-Button bleibt gesperrt,
// bis dieser Text exakt (Groß-/Kleinschreibung beachtet) eingetippt wurde.
function ConfirmModal({ title, message, confirmLabel, cancelLabel, danger, confirmText, onConfirm, onCancel }) {
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const confirmBtnRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const [typed, setTyped] = useState("");
  const canConfirm = !confirmText || typed.trim() === confirmText;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => (inputRef.current || confirmBtnRef.current)?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Capture-Phase auf document: Die Rückfrage liegt immer zuoberst. So
    // schließt Escape nur sie und nicht auch einen EditDialog darunter
    // (z.B. „Buch verwalten …“ → „Buch löschen“).
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="hb-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="hb-modal-overlay" />
      <div ref={panelRef} className="hb-modal-panel" tabIndex={-1} style={{ outline: "none" }}>
        <div className="hb-modal-head">
          <div id="confirm-dialog-title" className="hb-modal-title">{title}</div>
          <button
            type="button"
            className="hb-icon-btn"
            onClick={onCancel}
            aria-label="Schließen"
            title="Schließen"
          >
            <IconClose />
          </button>
        </div>
        <div className="hb-modal-body">
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
            {message}
          </div>
          {confirmText && (
            <div className="hb-field" style={{ marginTop: 16 }}>
              <label className="hb-label" htmlFor="confirm-dialog-input">
                Zur Bestätigung „{confirmText}“ eingeben
              </label>
              <input
                ref={inputRef}
                id="confirm-dialog-input"
                className="hb-input hb-full"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) onConfirm(); }}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>
        <div className="hb-modal-foot">
          <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`hb-btn${danger ? " hb-btn-danger" : ""}`}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return { confirm: async () => window.confirm("Bestätigen?") };
  }
  return ctx;
}
