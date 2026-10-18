import { createContext, useContext } from "react";
import makeLogger from "../utils/logger.js";

const log = makeLogger("Undo");

// Rückgängig für die letzte Änderung an den Büchern (App-Review F5). Der
// Verlauf selbst liegt in useUndoHistory; hierüber melden die Views nur, dass
// ihre gerade ausgelöste Änderung einen Toast mit „Rückgängig“ bekommen soll.
//
// Value: `{ offer(message), undo(), redo() }`. `offer` ersetzt bei Löschungen
// den bisherigen `toast.success(...)`-Aufruf und wird direkt nach der
// Änderung aufgerufen (im selben Handler).
export const UndoContext = createContext(null);

const fallback = {
  offer: (message) => log.info("offer", message),
  undo: () => {},
  redo: () => {},
};

export function useUndo() {
  return useContext(UndoContext) || fallback;
}
