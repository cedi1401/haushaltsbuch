// Verlauf für Rückgängig/Wiederholen (App-Review F5).
// Pure JS ohne React, damit es mit Vitest testbar ist.
//
// Jedes Buch hat seinen eigenen Verlauf: Rückgängig wirkt nur im geöffneten
// Buch. Ein Schritt merkt sich das Buch davor und danach. Weil Bücher
// immutabel aktualisiert werden, teilen sich die Stände alle unveränderten
// Buchungen — ein Schritt kostet kaum Speicher. Buch anlegen, löschen,
// importieren oder umsortieren betrifft die Bücher-Liste selbst und landet in
// keinem Verlauf.

/** Höchstzahl der Schritte; ältere fallen hinten heraus. */
export const UNDO_LIMIT = 50;

/**
 * Unbeschriftete Änderungen, die schneller als dieser Abstand
 * aufeinander folgen, verschmelzen zu einem Schritt (z.B. Tippen in einem
 * Feld, das bei jeder Taste speichert).
 */
export const MERGE_WINDOW_MS = 1000;

export function createHistory() {
  return { past: [], future: [] };
}

/**
 * Vergleicht zwei Bücher-Listen.
 * @returns {{structural: boolean, changed: Array<{before: object, after: object}>}}
 *   `structural` ist true, wenn Bücher dazukamen, wegfielen oder die Reihenfolge
 *   wechselte; `changed` nennt sonst die Bücher, deren Inhalt sich änderte.
 */
export function diffBooks(before, after) {
  const a = Array.isArray(before) ? before : [];
  const b = Array.isArray(after) ? after : [];
  if (a.length !== b.length || a.some((book, i) => book.id !== b[i].id)) {
    return { structural: true, changed: [] };
  }
  const changed = [];
  a.forEach((book, i) => {
    if (book !== b[i]) changed.push({ before: book, after: b[i] });
  });
  return { structural: false, changed };
}

/**
 * Nimmt eine Änderung an einem Buch in dessen Verlauf auf. Eine neue
 * Änderung verwirft immer die Schritte zum Wiederholen.
 *
 * @param {{past: Array, future: Array}} history Verlauf dieses Buchs
 * @param {object} change
 * @param {object} change.before Buch vor der Änderung
 * @param {object} change.after Buch nach der Änderung
 * @param {string|null} [change.label] Text für den Toast, z.B. „Buchung gelöscht.“
 * @param {number} change.at Zeitpunkt (ms)
 * @returns {{history: object, step: object|null}} `step` ist der neue oder
 *   erweiterte Schritt, `null` bei einer Änderung ohne Wirkung.
 */
export function recordChange(history, change) {
  const { before, after, label = null, at } = change;
  if (before === after) return { history, step: null };

  const last = history.past[history.past.length - 1];
  // Nach einem Rückgängig (future nicht leer) wird nie verschmolzen, sonst
  // hinge die neue Änderung an einem älteren Schritt.
  const canMerge =
    last &&
    history.future.length === 0 &&
    !label &&
    !last.label &&
    at - last.at <= MERGE_WINDOW_MS;

  if (canMerge) {
    const merged = { ...last, after, at };
    return {
      history: { past: [...history.past.slice(0, -1), merged], future: [] },
      step: merged,
    };
  }

  const step = {
    id: `undo_${at}_${Math.random().toString(36).slice(2, 6)}`,
    before,
    after,
    label,
    at,
  };
  const past = [...history.past, step].slice(-UNDO_LIMIT);
  return { history: { past, future: [] }, step };
}

/**
 * Nimmt den jüngsten Schritt zurück.
 * @returns {{history: object, step: object|null}} `step` ist der
 *   zurückgenommene Schritt (`before` ist wiederherzustellen),
 *   `null`, wenn es nichts rückgängig zu machen gibt.
 */
export function undo(history) {
  const step = history.past[history.past.length - 1];
  if (!step) return { history, step: null };
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, step] },
    step,
  };
}

/**
 * Stellt den zuletzt zurückgenommenen Schritt wieder her.
 * @returns {{history: object, step: object|null}} `after` des Schritts ist
 *   wiederherzustellen; `null`, wenn nichts zu wiederholen ist.
 */
export function redo(history) {
  const step = history.future[history.future.length - 1];
  if (!step) return { history, step: null };
  return {
    history: { past: [...history.past, step], future: history.future.slice(0, -1) },
    step,
  };
}
