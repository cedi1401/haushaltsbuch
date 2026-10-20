import { useCallback, useEffect, useMemo, useRef } from "react";
import { createHistory, recordChange, undo as undoStep, redo as redoStep, diffBooks } from "../utils/undoHistory.js";

// Rückgängig/Wiederholen für alle Änderungen an den Büchern (App-Review F5).
//
// Der Hook beobachtet `books`, statt dass jede Änderung sich selbst meldet:
// Alles, was über setBooks den Inhalt eines Buchs ändert (patchActiveBook,
// updateBook), landet so automatisch im Verlauf dieses Buchs. Rückgängig wirkt
// nur im geöffneten Buch; Buch anlegen, löschen oder importieren lässt sich
// nicht rückgängig machen. Der Verlauf lebt nur im Speicher; ein Neustart
// beginnt leer.
//
// Muss in useBookManager *vor* dem Effect aufgerufen werden, der
// `isInitialLoad` zurücksetzt — sonst landete das Laden als erster Schritt
// im Verlauf.

// Wie lange ein Toast mit „Rückgängig“ stehen bleibt (Hover hält ihn an).
const ACTION_TOAST_MS = 5000;
// `offer` gilt nur für eine Änderung, die gleich danach kommt. Ohne Frist
// hinge ein Text, dem keine Änderung folgt, an irgendeiner späteren.
const OFFER_TTL_MS = 1000;

// Felder, in denen Ctrl+Z das native Rückgängig des Textes bleiben muss.
const TEXT_FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable=""], [contenteditable="true"]';

function isTextField(el) {
  return el instanceof Element && el.matches(TEXT_FIELD_SELECTOR);
}

// In offenen Dialogen greift Ctrl+Z nicht: der Dialog hält einen Entwurf, der
// zum zurückgenommenen Stand nicht mehr passen könnte.
function isModalOpen() {
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

/**
 * @param {object} params
 * @param {Array} params.books
 * @param {(books: Array) => void} params.setBooks
 * @param {string|null} params.activeBookId
 * @param {{current: boolean}} params.isInitialLoad
 * @param {object} params.toast ToastContext-API
 * @returns {{ offer: (message: string) => void, undo: () => void, redo: () => void }}
 */
export function useUndoHistory({ books, setBooks, activeBookId, isInitialLoad, toast }) {
  const historiesRef = useRef(new Map()); // Buch-ID → { past, future }
  const prevBooksRef = useRef(books);
  const activeIdRef = useRef(activeBookId);
  const offerRef = useRef(null); // { message, at }
  const skipNextRef = useRef(false);
  const toastIdRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
  }, [toast]);

  // Das geöffnete Buch, wie useBookManager es bestimmt (ohne gültige ID das
  // erste).
  const currentBookId = useCallback(() => {
    const list = prevBooksRef.current;
    return (list.find((b) => b.id === activeIdRef.current) || list[0])?.id ?? null;
  }, []);

  // Setzt ein Buch auf einen Stand, ohne das selbst wieder aufzuzeichnen.
  const restore = useCallback((book) => {
    const current = prevBooksRef.current.find((b) => b.id === book.id);
    if (!current || current === book) return;
    skipNextRef.current = true;
    setBooks((prev) => prev.map((b) => (b.id === book.id ? book : b)));
  }, [setBooks]);

  // `undo` und `redo` rufen sich über den Toast gegenseitig auf, daher die
  // Refs statt direkter Abhängigkeiten.
  const undoRef = useRef(null);
  const redoRef = useRef(null);

  const undo = useCallback(() => {
    const bookId = currentBookId();
    const { history, step } = undoStep(historiesRef.current.get(bookId) || createHistory());
    dismissToast();
    if (!step) {
      toastIdRef.current = toast.info("Nichts zum Rückgängigmachen.", { duration: 2500 });
      return;
    }
    historiesRef.current.set(bookId, history);
    restore(step.before);
    toastIdRef.current = toast.show({
      severity: "info",
      message: "Änderung rückgängig gemacht.",
      action: { label: "Wiederholen", onClick: () => redoRef.current?.() },
      duration: ACTION_TOAST_MS,
    });
  }, [toast, restore, dismissToast, currentBookId]);

  const redo = useCallback(() => {
    const bookId = currentBookId();
    const { history, step } = redoStep(historiesRef.current.get(bookId) || createHistory());
    dismissToast();
    if (!step) {
      toastIdRef.current = toast.info("Nichts zum Wiederholen.", { duration: 2500 });
      return;
    }
    historiesRef.current.set(bookId, history);
    restore(step.after);
    toastIdRef.current = toast.show({
      severity: "info",
      message: "Änderung wiederhergestellt.",
      action: { label: "Rückgängig", onClick: () => undoRef.current?.() },
      duration: ACTION_TOAST_MS,
    });
  }, [toast, restore, dismissToast, currentBookId]);

  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [undo, redo]);

  // Zeichnet jede Änderung an `books` im Verlauf des betroffenen Buchs auf.
  useEffect(() => {
    const before = prevBooksRef.current;
    prevBooksRef.current = books;
    const offer = offerRef.current;
    offerRef.current = null;
    if (isInitialLoad.current) return;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const at = Date.now();
    const label = offer && at - offer.at <= OFFER_TTL_MS ? offer.message : null;
    const { structural, changed } = diffBooks(before, books);
    if (structural) {
      // Verläufe gelöschter Bücher verwerfen; die Listen-Änderung selbst
      // ist kein Schritt.
      const ids = new Set(books.map((b) => b.id));
      for (const id of historiesRef.current.keys()) {
        if (!ids.has(id)) historiesRef.current.delete(id);
      }
      if (label) toast.success(label);
      return;
    }
    let recorded = false;
    for (const { before: bookBefore, after: bookAfter } of changed) {
      const { history, step } = recordChange(
        historiesRef.current.get(bookAfter.id) || createHistory(),
        { before: bookBefore, after: bookAfter, label, at }
      );
      historiesRef.current.set(bookAfter.id, history);
      if (step) recorded = true;
    }
    if (!recorded) {
      if (label) toast.success(label);
      return;
    }
    // Der Toast eines älteren Schritts passt nicht mehr: sein „Rückgängig“
    // träfe jetzt diese Änderung.
    dismissToast();
    if (label) {
      toastIdRef.current = toast.show({
        severity: "success",
        message: label,
        action: { label: "Rückgängig", onClick: () => undoRef.current?.() },
        duration: ACTION_TOAST_MS,
      });
    }
  }, [books]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ein Toast mit „Rückgängig“ gehört zum Buch, in dem er entstand; nach
  // einem Buchwechsel träfe sein Knopf das falsche Buch.
  useEffect(() => {
    if (activeIdRef.current === activeBookId) return;
    activeIdRef.current = activeBookId;
    dismissToast();
  }, [activeBookId, dismissToast]);

  useEffect(() => {
    function onKey(e) {
      if (e.defaultPrevented || e.altKey) return; // Alt: AltGr unter Windows
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = key === "y" || (key === "z" && e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (isTextField(e.target) || isModalOpen()) return;
      e.preventDefault();
      if (isUndo) undo();
      else redo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const offer = useCallback((message) => {
    const entry = { message, at: Date.now() };
    offerRef.current = entry;
    // Folgt keine Änderung (z.B. der Handler hat doch nichts geschrieben),
    // bleibt es bei der bisherigen Bestätigung ohne Knopf.
    setTimeout(() => {
      if (offerRef.current !== entry) return;
      offerRef.current = null;
      toast.success(message);
    }, OFFER_TTL_MS);
  }, [toast]);

  return useMemo(
    () => ({ offer, undo, redo }),
    [offer, undo, redo]
  );
}
