import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconSuccess, IconError, IconWarning, IconInfo, IconClose } from "./icons.jsx";
import { ToastContext } from "./toastContext.js";

// -------------------------------------------------------
// Toast / InfoBar System (WinUI 3 style)
// -------------------------------------------------------

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((opts) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const toast = {
      id,
      severity: opts.severity || "info", // "info" | "success" | "warning" | "error"
      title: opts.title || null,
      message: opts.message || "",
      duration: opts.duration ?? 4000,
      // Optionaler Knopf `{ label, onClick }`, z.B. „Rückgängig“. Ein Klick
      // führt ihn aus und schließt den Toast.
      action: opts.action || null,
    };
    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  // Stabile Referenz: `show`/`dismiss` sind via useCallback stabil, also ändert
  // sich `api` nie. Wichtig, damit Consumer den Toast-Getter gefahrlos in
  // Effect-Deps aufnehmen können, ohne bei jedem Render neu auszulösen.
  const api = useMemo(() => ({
    show,
    dismiss,
    success: (message, opts = {}) => show({ ...opts, message, severity: "success" }),
    error: (message, opts = {}) => show({ ...opts, message, severity: "error" }),
    warning: (message, opts = {}) => show({ ...opts, message, severity: "warning" }),
    info: (message, opts = {}) => show({ ...opts, message, severity: "info" }),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function severityIcon(severity) {
  if (severity === "success") return <IconSuccess />;
  if (severity === "error") return <IconError />;
  if (severity === "warning") return <IconWarning />;
  return <IconInfo />;
}

function ToastItem({ toast, onDismiss }) {
  const timerRef = useRef(null);

  function startTimer() {
    if (toast.duration <= 0) return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
  }

  function clearTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`hb-toast hb-toast-${toast.severity}`}
      role={toast.severity === "error" ? "alert" : "status"}
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      onFocus={clearTimer}
      onBlur={startTimer}
    >
      <div className="hb-toast-icon">{severityIcon(toast.severity)}</div>
      <div className="hb-toast-body">
        {toast.title ? <div className="hb-toast-title">{toast.title}</div> : null}
        <div className="hb-toast-message">{toast.message}</div>
      </div>
      {toast.action ? (
        <button
          type="button"
          className="hb-btn hb-btn-outline hb-btn-sm hb-toast-action"
          onClick={() => {
            onDismiss(toast.id);
            toast.action.onClick();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        className="hb-icon-btn hb-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Schließen"
      >
        <IconClose />
      </button>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="hb-toast-container" role="region" aria-label="Benachrichtigungen">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
