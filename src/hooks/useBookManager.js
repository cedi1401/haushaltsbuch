import { useState, useEffect, useRef, useMemo } from "react";
import {
  makeDefaultBook,
  normalizeBooks,
  bookNeedsMigration,
  formatCurrency,
  todayISO,
} from "../utils/hbUtils.js";
import { generateId } from "../utils/idUtils.js";
import { getFinancialMonth } from "../utils/financialMonthUtils.js";
import { loadBooks, saveBooks, getSetting, setSetting, createAutoBackup } from "../dal/storage.js";
import makeLogger from "../utils/logger.js";

const log = makeLogger("useBookManager");

export function useBookManager({ toast, confirm }) {
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    async function load() {
      const [savedBooks, savedActive] = await Promise.all([
        loadBooks(),
        getSetting("activeBookId"),
      ]);
      if (Array.isArray(savedBooks) && savedBooks.length) {
        const needsMigration = savedBooks.some(bookNeedsMigration);
        if (needsMigration) {
          try {
            await createAutoBackup(savedBooks);
            log.info('Auto-Backup vor Migration angelegt');
          } catch (err) {
            log.warn('Auto-Backup fehlgeschlagen — Migration wird trotzdem fortgesetzt', err);
          }
        }

        let normalized;
        try {
          normalized = normalizeBooks(savedBooks);
          if (needsMigration) log.info(`${savedBooks.length} Buch/Bücher erfolgreich migriert`);
        } catch (err) {
          log.error('Datenmigration fehlgeschlagen', err);
          toast.error(
            `Datenmigration fehlgeschlagen: ${err.message}\n` +
            `Ein Backup wurde unter userData/backups/ gespeichert.`
          );
          normalized = [];
        }

        setBooks(normalized.length ? normalized : [makeDefaultBook()]);
        setActiveBookId(savedActive || normalized[0]?.id || null);
      } else {
        const b = makeDefaultBook();
        setBooks([b]);
        setActiveBookId(b.id);
      }
      // Clear flag after React has processed the state updates and run effects
      setTimeout(() => { isInitialLoad.current = false; }, 0);
    }
    load();
  }, []);

  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!books.length) return;
    saveBooks(books);
  }, [books]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!activeBookId) return;
    setSetting("activeBookId", activeBookId);
  }, [activeBookId]);

  const activeBook = useMemo(() => {
    if (!books.length) return null;
    return books.find((b) => b.id === activeBookId) || books[0] || null;
  }, [books, activeBookId]);

  const baseCurrency = activeBook?.baseCurrency || "CHF";
  const monthStartDay = activeBook?.monthStartDay ?? 1;
  const fmt = useMemo(
    () => (n, fractionDigits = 2) => formatCurrency(n, baseCurrency, fractionDigits),
    [baseCurrency]
  );

  function patchActiveBook(patchFn) {
    if (!activeBook) return;
    setBooks((prev) => prev.map((b) => (b.id === activeBook.id ? patchFn(b) : b)));
  }

  function updateBook(updatedBook) {
    if (!updatedBook) return;
    setBooks((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
  }

  function createBook(name) {
    const bookName = (name || "").trim() || "Neues Haushaltsbuch";
    const b = makeDefaultBook(bookName);
    setBooks((prev) => [...prev, b]);
    setActiveBookId(b.id);
  }

  function applyRenameActiveBook(name) {
    if (!activeBook) return;
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setBooks((prev) =>
      prev.map((b) => (b.id === activeBook.id ? { ...b, name: trimmed } : b))
    );
    toast.success(`Buch in „${trimmed}" umbenannt.`);
  }

  async function deleteActiveBook() {
    if (!activeBook || books.length <= 1) return;
    const ok = await confirm({
      title: "Buch löschen",
      message: `Haushaltsbuch „${activeBook.name}" wirklich löschen?\n\nAlle darin enthaltenen Einträge gehen verloren.`,
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const remaining = books.filter((b) => b.id !== activeBook.id);
    setBooks(remaining);
    setActiveBookId(remaining[0]?.id || null);
    toast.success("Buch gelöscht.");
  }

  function importBook(bookToImport) {
    const existingIds = new Set(books.map((b) => b.id));
    const book = existingIds.has(bookToImport.id)
      ? { ...bookToImport, id: generateId("book") }
      : bookToImport;
    setBooks((prev) => [...prev, book]);
    setActiveBookId(book.id);
  }

  function handleMonthStartDayChange(newStartDay, setMonthFilter) {
    const fin = getFinancialMonth(todayISO(), newStartDay);
    if (fin?.yyyymm) setMonthFilter(fin.yyyymm);
  }

  return {
    books, setBooks,
    activeBookId, setActiveBookId,
    activeBook,
    baseCurrency, monthStartDay, fmt,
    patchActiveBook, updateBook,
    createBook, applyRenameActiveBook, deleteActiveBook,
    importBook, handleMonthStartDayChange,
    isInitialLoad,
  };
}
