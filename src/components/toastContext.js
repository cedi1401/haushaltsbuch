import { createContext, useContext } from "react";
import makeLogger from "../utils/logger.js";

// Context + Consumer-Hook getrennt von der Provider-Komponente (Toast.jsx),
// damit Fast Refresh der Komponente sauber funktioniert (only-export-components).
export const ToastContext = createContext(null);

const log = makeLogger("Toast");

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
