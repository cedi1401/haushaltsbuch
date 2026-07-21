import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IconSuccess, IconError, IconWarning, IconInfo, IconClose } from "./icons.jsx";
import makeLogger from "../utils/logger.js";

// -------------------------------------------------------
// Toast / InfoBar System (WinUI 3 style)
// -------------------------------------------------------

const ToastContext = createContext(null);
const log = makeLogger("Toast");

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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback ohne Provider: strukturiertes Logging statt Toast-UI
    return {
      show: (o) => log.info("show", o),
      dismiss: () => {},
      success: (m) => log.info("success", m),
      error: (m) => log.error("error", m),
      warning: (m) => log.warn("warning", m),
      info: (m) => log.info("info", m),
    };
  }
  return ctx;
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
    >
      <div className="hb-toast-icon">{severityIcon(toast.severity)}</div>
      <div className="hb-toast-body">
        {toast.title ? <div className="hb-toast-title">{toast.title}</div> : null}
        <div className="hb-toast-message">{toast.message}</div>
      </div>
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
