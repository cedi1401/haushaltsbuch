import React, { useEffect, useMemo, useState, useRef } from "react";

import "./styles/haushaltsbuch.css";

import { Button, Card, CardContent } from "./components/ui.jsx";
import EditDialog from "./components/EditDialog.jsx";
import CategoryPicker from "./components/CategoryPicker.jsx";

import SettingsDialog from "./features/SettingsDialog.jsx";
import Charts from "./features/Charts.jsx";
import EntriesTable from "./features/EntriesTable.jsx";
import TrendView from "./features/TrendView.jsx";
import PotsView from "./features/PotsView.jsx";
import GoalsView from "./features/GoalsView.jsx";
import FixedCostsView from "./features/FixedCostsView.jsx";
import NavDrawer from "./features/NavDrawer.jsx";
import InvestmentsView from "./features/InvestmentsView.jsx";

import { toCHF, todayISO, parseAmount, makeDefaultBook, normalizeBooks, getCategoryNames } from "./utils/hbUtils.js";
import { PIE_PALETTE, makeCategoryColorMap, CHART_COLORS } from "./utils/hbPalette.js";
import { calcPotBalance } from "./utils/potUtils.js";
import { calcExpenseByCategory, calcBudgetStatus } from "./utils/budgetUtils.js";
import { loadBooks, saveBooks, getSetting, setSetting } from "./dal/storage.js";

export default function HaushaltsbuchApp() {
  // Dark Mode
  const [darkMode, setDarkMode] = useState(false);

  // Navigation
  const [view, setView] = useState("book"); // "book" | "trend" | "pots" | "goals" | "fixed" | "investments"
  const [navOpen, setNavOpen] = useState(false);

  // Bücher
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);

  // Eingabe
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Allgemein");
  const [kind, setKind] = useState("expense"); // NEU: war "type"
  const [source, setSource] = useState("month"); // NEU
  const [potId, setPotId] = useState("reserve"); // NEU: Standard-Topf
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [newCategory, setNewCategory] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  // Dialog: Eintrag bearbeiten
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    date: todayISO(),
    kind: "expense",
    source: "month",
    potId: "reserve",
    category: "Allgemein",
    note: "",
    amount: "",
  });

  // Dialog: Neues Buch
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookName, setNewBookName] = useState("Neues Haushaltsbuch");

  // Einstellungen (Zahnrad)
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Dark Mode: DOM-Update und Persistierung
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setSetting('darkMode', String(darkMode));
  }, [darkMode]);

  // Laden (async für Electron-Kompatibilität)
  useEffect(() => {
    async function load() {
      const [savedBooks, savedActive, savedMonth, savedDark] = await Promise.all([
        loadBooks(),
        getSetting('activeBookId'),
        getSetting('month'),
        getSetting('darkMode'),
      ]);

      if (Array.isArray(savedBooks) && savedBooks.length) {
        const normalized = normalizeBooks(savedBooks);
        setBooks(normalized);
        setActiveBookId(savedActive || normalized[0]?.id || null);
      } else {
        const b = makeDefaultBook();
        setBooks([b]);
        setActiveBookId(b.id);
      }

      if (typeof savedMonth === "string") setMonthFilter(savedMonth);
      if (savedDark === 'true') setDarkMode(true);
    }
    load();
  }, []);

  // Speichern (async-safe: fire-and-forget)
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current) return; // Skip first render (loading phase)
    if (!books.length) return;
    saveBooks(books);
  }, [books]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    if (!activeBookId) return;
    setSetting('activeBookId', activeBookId);
  }, [activeBookId]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    setSetting('month', monthFilter);
  }, [monthFilter]);

  // Mark initial load as done after first render cycle
  useEffect(() => {
    // Small delay to ensure all load-effects have run
    const timer = setTimeout(() => { isInitialLoad.current = false; }, 100);
    return () => clearTimeout(timer);
  }, []);

  const activeBook = useMemo(() => {
    if (!books.length) return null;
    return books.find((b) => b.id === activeBookId) || books[0] || null;
  }, [books, activeBookId]);

  const entries = activeBook?.entries || [];
  const indicateCategories = activeBook?.categories || [{ name: "Allgemein", budget: null }];
  const indicateCategoryNames = useMemo(() => getCategoryNames(indicateCategories), [indicateCategories]);
  const indicateTransferCategories = activeBook?.transferCategories || [];

  // Für Trend-Ansicht: optional über alle Bücher aggregieren
  const allEntries = useMemo(() => {
    return (books || []).flatMap((b) =>
      (b.entries || []).map((e) => ({ ...e, __bookId: b.id, __bookName: b.name }))
    );
  }, [books]);

  function patchActiveBook(patchFn) {
    if (!activeBook) return;
    setBooks((prev) => prev.map((b) => (b.id === activeBook.id ? patchFn(b) : b)));
  }

  // NEU: Direktes Update eines Buchs (für Settings-Dialog)
  function updateBook(updatedBook) {
    if (!updatedBook) return;
    setBooks((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
  }

  // Wenn Buch wechselt und aktuell gewählte Kategorie nicht existiert → fallback
  useEffect(() => {
    if (!activeBook) return;

    // Je nach kind die richtige Kategorie-Liste verwenden
    if (kind === "transfer") {
      if (!indicateTransferCategories.includes(category)) {
        const fallback = indicateTransferCategories[0] || "Steuern";
        setCategory(fallback);
      }
    } else if (kind === "expense") {
      if (!indicateCategoryNames.includes(category)) {
        const fallback = indicateCategoryNames.includes("Allgemein")
          ? "Allgemein"
          : indicateCategoryNames[0];
        setCategory(fallback || "Allgemein");
      }
    } else if (kind === "income") {
      // Income hat immer "Allgemein"
      if (category !== "Allgemein") {
        setCategory("Allgemein");
      }
    }
  }, [activeBookId, activeBook, indicateCategoryNames, indicateTransferCategories, category, kind]);

  // Buch actions
  function createBook() {
    const name = newBookName.trim() || "Neues Haushaltsbuch";
    const b = makeDefaultBook(name);
    setBooks((prev) => [...prev, b]);
    setActiveBookId(b.id);
    setCategory(b.categories[0]?.name || "Allgemein");
    setNewBookOpen(false);
    setView("book");
  }

  function renameActiveBook() {
    if (!activeBook) return;
    const name = window.prompt("Neuer Name für dieses Haushaltsbuch:", activeBook.name);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setBooks((prev) =>
      prev.map((b) => (b.id === activeBook.id ? { ...b, name: trimmed } : b))
    );
  }

  function deleteActiveBook() {
    if (!activeBook) return;
    if (books.length <= 1) return;

    const ok = window.confirm(`Haushaltsbuch "${activeBook.name}" wirklich löschen?`);
    if (!ok) return;

    const remaining = books.filter((b) => b.id !== activeBook.id);
    setBooks(remaining);
    setActiveBookId(remaining[0]?.id || null);
  }

  // Kategorie actions
  function deleteCategory(catName) {
    if (!activeBook) return;

    if (indicateCategoryNames.length <= 1) {
      window.alert("Du brauchst mindestens eine Kategorie.");
      return;
    }

    const ok = window.confirm(`Kategorie "${catName}" wirklich löschen?`);
    if (!ok) return;

    const remainingCats = indicateCategories.filter((c) => {
      const name = typeof c === "string" ? c : c.name;
      return name !== catName;
    });

    patchActiveBook((b) => ({
      ...b,
      categories: remainingCats,
    }));

    if (category === catName) {
      const remainingNames = getCategoryNames(remainingCats);
      const fallback = remainingNames.includes("Allgemein") ? "Allgemein" : remainingNames[0];
      setCategory(fallback || "Allgemein");
    }
  }

  function deleteTransferCategory(cat) {
    if (!activeBook) return;

    if (indicateTransferCategories.length <= 1) {
      window.alert("Du brauchst mindestens eine Transfer-Kategorie.");
      return;
    }

    const ok = window.confirm(`Transfer-Kategorie "${cat}" wirklich löschen?`);
    if (!ok) return;

    const remainingCats = indicateTransferCategories.filter((c) => c !== cat);

    patchActiveBook((b) => ({
      ...b,
      transferCategories: remainingCats,
    }));

    if (category === cat) {
      const fallback = remainingCats[0] || "Allgemein";
      setCategory(fallback);
    }
  }

  // Entry actions
  function addEntry() {
    if (!activeBook) return;
    const numericAmount = parseAmount(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (!date) return;

    const entry = {
      id: Date.now(),
      amount: numericAmount,
      category,
      kind,
      note: note.trim(),
      date,
    };

    if (kind === "expense") {
      entry.source = source;
    }

    if (kind === "transfer" || (kind === "expense" && source === "pot")) {
      entry.potId = potId;
    }

    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), entry] }));

    setAmount("");
    setNote("");
  }

  function addTransferEntry(entry) {
    if (!activeBook) return;
    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), entry] }));
  }

  function removeEntry(id) {
    if (!activeBook) return;

    const target = (activeBook.entries || []).find((e) => e.id === id) || null;
    
    let prettyType = "Ausgabe";
    if (target?.kind === "income") prettyType = "Einnahme";
    else if (target?.kind === "transfer") prettyType = "Transfer";
    else if (target?.kind === "expense" && target?.source === "pot") prettyType = "Ausgabe (Topf)";
    
    const prettyAmount = target ? toCHF(Number(target.amount || 0)) : "";

    const msg = target
      ? `Eintrag wirklich löschen?

${target.date || ""} · ${prettyType} · ${target.category || ""}
Betrag: ${prettyAmount}${target.note ? `
Notiz: ${target.note}` : ""}`
      : "Eintrag wirklich löschen?";

    const ok = window.confirm(msg);
    if (!ok) return;

    if (editingId === id) {
      setEditOpen(false);
      setEditingId(null);
    }

    patchActiveBook((b) => ({
      ...b,
      entries: (b.entries || []).filter((e) => e.id !== id),
    }));
  }

  function addCategory() {
    if (!activeBook) return;
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    // Je nach Art in die richtige Liste einfügen
    if (kind === "transfer") {
      if ((activeBook.transferCategories || []).includes(trimmed)) return;
      patchActiveBook((b) => ({
        ...b,
        transferCategories: [...(b.transferCategories || []), trimmed],
      }));
    } else {
      // Prüfen ob Kategorie-Name bereits existiert
      const existingNames = getCategoryNames(activeBook.categories || []);
      if (existingNames.includes(trimmed)) return;
      // Neue Kategorie als Objekt hinzufügen
      patchActiveBook((b) => ({
        ...b,
        categories: [...(b.categories || []), { name: trimmed, budget: null }],
      }));
    }

    setCategory(trimmed);
    setNewCategory("");
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditDraft({
      date: entry.date || todayISO(),
      kind: entry.kind || "expense",
      source: entry.source || "month",
      potId: entry.potId || "reserve",
      category: entry.category || "Allgemein",
      note: entry.note || "",
      amount: String(entry.amount ?? ""),
    });
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditingId(null);
  }

  function saveEdit() {
    if (!activeBook) return;
    if (editingId == null) return;
    if (!editDraft.date) return;

    const numericAmount = parseAmount(editDraft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    patchActiveBook((b) => ({
      ...b,
      entries: (b.entries || []).map((e) => {
        if (e.id !== editingId) return e;

        const updated = {
          ...e,
          date: editDraft.date,
          kind: editDraft.kind,
          category: editDraft.category,
          note: String(editDraft.note || "").trim(),
          amount: numericAmount,
        };

        if (editDraft.kind === "expense") {
          updated.source = editDraft.source;
        } else {
          delete updated.source;
        }

        if (editDraft.kind === "transfer" || (editDraft.kind === "expense" && editDraft.source === "pot")) {
          updated.potId = editDraft.potId;
        } else {
          delete updated.potId;
        }

        return updated;
      }),
    }));

    setEditOpen(false);
    setEditingId(null);
  }

  const canSaveEdit = useMemo(() => {
    if (!editDraft.date) return false;
    const n = parseAmount(editDraft.amount);
    if (!Number.isFinite(n) || n <= 0) return false;
    if (!editDraft.category) return false;
    if (!editDraft.kind) return false;
    return true;
  }, [editDraft]);

  const filteredEntries = useMemo(() => {
    const month = monthFilter?.trim();
    if (!month) return entries;
    return entries.filter((e) => typeof e.date === "string" && e.date.slice(0, 7) === month);
  }, [entries, monthFilter]);

  // ============================================
  // BERECHNUNGEN (NEU: mit kind statt type)
  // ============================================

  const totalIncome = useMemo(() => {
    return filteredEntries
      .filter((e) => e.kind === "income")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredEntries]);

  const totalExpense = useMemo(() => {
    return filteredEntries
      .filter((e) => e.kind === "expense" && e.source === "month")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredEntries]);

  const totalTransfers = useMemo(() => {
    return filteredEntries
      .filter((e) => e.kind === "transfer")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredEntries]);

  const balance = totalIncome - totalExpense - totalTransfers;

  const expenseCategories = useMemo(() => {
    const set = new Set(
      filteredEntries
        .filter((e) => e.kind === "expense" && e.source === "month")
        .map((e) => String(e.category || "").trim())
        .filter(Boolean)
    );
    return Array.from(set);
  }, [filteredEntries]);

  const expenseByCategory = useMemo(() => {
    return expenseCategories
      .map((cat) => ({
        name: cat,
        value: filteredEntries
          .filter((e) => e.kind === "expense" && e.source === "month" && e.category === cat)
          .reduce((sum, e) => sum + Number(e.amount || 0), 0),
      }))
      .filter((d) => d.value > 0);
  }, [expenseCategories, filteredEntries]);

  const totalPotTransfers = useMemo(() => {
    return filteredEntries
      .filter((e) => e.kind === "transfer")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredEntries]);

  const pieData = useMemo(() => {
    const data = totalPotTransfers > 0
      ? [...expenseByCategory, { name: "Rücklagen", value: totalPotTransfers }]
      : expenseByCategory;
    return [...data].sort((a, b) => b.value - a.value);
  }, [expenseByCategory, totalPotTransfers]);

  const catColor = useMemo(() => {
    const names = pieData.map((d) => d.name);
    return makeCategoryColorMap(names, PIE_PALETTE);
  }, [pieData]);

  const barData = useMemo(() => {
    return [
      { name: "Einnahmen", value: totalIncome, fill: CHART_COLORS.income },
      { name: "Ausgaben", value: totalExpense, fill: CHART_COLORS.expense },
    ];
  }, [totalIncome, totalExpense]);

  // NEU: Topf-Stände berechnen
  const potBalances = useMemo(() => {
    if (!activeBook?.pots) return [];
    return activeBook.pots.map((pot) => ({
      ...pot,
      balance: calcPotBalance(entries, pot.id),
    }));
  }, [activeBook?.pots, entries]);

  // Budget-Status für Kategorien mit Limit
  const budgetStatus = useMemo(() => {
    if (!indicateCategories?.length) return [];
    const expenseMap = calcExpenseByCategory(filteredEntries, monthFilter);
    return calcBudgetStatus(indicateCategories, expenseMap);
  }, [indicateCategories, filteredEntries, monthFilter]);

  const entriesSorted = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da !== db) return db.localeCompare(da);
      return Number(b.id) - Number(a.id);
    });
  }, [filteredEntries]);

  const monthLabel = monthFilter ? `(${monthFilter})` : "(Alle Monate)";

  const editingEntry = useMemo(() => {
    if (editingId == null) return null;
    return entries.find((e) => e.id === editingId) || null;
  }, [entries, editingId]);

  const isDeletableCategory = (cat) => {
    if (kind === "transfer") {
      return indicateTransferCategories.includes(cat) && indicateTransferCategories.length > 1;
    }
    return indicateCategoryNames.includes(cat) && indicateCategoryNames.length > 1;
  };

  function restoreAll(restored) {
    setBooks(restored.books);
    setActiveBookId(restored.activeBookId);
    setMonthFilter(restored.monthFilter);

    const nextBook = restored.books.find((b) => b.id === restored.activeBookId) || restored.books[0];
    const nextCatNames = getCategoryNames(nextBook?.categories || []);
    if (!nextCatNames.includes(category)) {
      const fallback = nextCatNames.includes("Allgemein") ? "Allgemein" : nextCatNames[0];
      setCategory(fallback || "Allgemein");
    }
  }

  return (
    <div className="hb-page">
      <NavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        view={view}
        onChangeView={setView}
      />

      <div className="hb-top">
        <div className="hb-row">
          <div className="hb-title-row">
            <button
              className="hb-icon-btn hb-hamburger-btn"
              type="button"
              title="Menü"
              aria-label="Menü"
              onClick={() => setNavOpen(true)}
            >
              ☰
            </button>

            <div>
              <h1 className="hb-title">Haushaltsbuch</h1>
              <p className="hb-sub">
                {view === "trend" ? "(Trend)" : view === "pots" ? "(Töpfe)" : view === "goals" ? "(Sparziele)" : view === "fixed" ? "(Fixkosten)" : view === "investments" ? "(Investments)" : monthLabel}
              </p>
            </div>
          </div>

          <div className="hb-group">
            <label className="hb-muted">Buch</label>
            <select
              className="hb-input"
              value={activeBook?.id || ""}
              onChange={(e) => setActiveBookId(e.target.value)}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {view === "book" && (
              <Button variant="outline" onClick={() => setNewBookOpen(true)}>
                Neues Buch
              </Button>
            )}
            <Button variant="outline" onClick={renameActiveBook}>
              Umbenennen
            </Button>
            <Button variant="outline" onClick={deleteActiveBook} disabled={books.length <= 1}>
              Löschen
            </Button>

            <div className="hb-divider" />

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label className="hb-muted">Monat</label>
              {view === "trend" || view === "pots" || view === "goals" || view === "fixed" || view === "investments" ? <span className="hb-badge">nur Buch</span> : null}
            </div>
            <input
              className="hb-input"
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              disabled={view === "trend" || view === "pots" || view === "goals" || view === "fixed" || view === "investments"}
              title={
                view === "trend" || view === "pots" || view === "goals" || view === "fixed" || view === "investments"
                  ? "Der Monatsfilter gilt nur in der Buch-Ansicht."
                  : undefined
              }
            />
            <Button
              variant="outline"
              onClick={() => setMonthFilter("")}
              disabled={view === "trend" || view === "pots" || view === "goals" || view === "fixed" || view === "investments"}
              title={
                view === "trend" || view === "pots" || view === "goals" || view === "fixed" || view === "investments"
                  ? "Der Monatsfilter gilt nur in der Buch-Ansicht."
                  : undefined
              }
            >
              Alle
            </Button>

            <button
              className="hb-icon-btn hb-gear-btn"
              type="button"
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {darkMode ? '\u2600' : '\u263E'}
            </button>

            <button
              className="hb-icon-btn hb-gear-btn"
              type="button"
              title="Einstellungen"
              onClick={() => setSettingsOpen(true)}
              aria-label="Einstellungen"
            >
              ⚙
            </button>
          </div>
        </div>

        {activeBook ? (
          <div className="hb-muted">
            Aktives Buch: <strong>{activeBook.name}</strong>
          </div>
        ) : null}
      </div>

      {view === "trend" ? (
        <TrendView entries={entries} entriesAll={allEntries} toCHF={toCHF} />
      ) : view === "pots" ? (
        <PotsView
          activeBook={activeBook}
          entries={entries}
          toCHF={toCHF}
          onAddTransferEntry={addTransferEntry}
          transferCategories={indicateTransferCategories}
          todayISO={todayISO}
        />
      ) : view === "goals" ? (
        <GoalsView
          activeBook={activeBook}
          entries={entries}
          toCHF={toCHF}
          onUpdateBook={updateBook}
          todayISO={todayISO}
        />
      ) : view === "fixed" ? (
        <FixedCostsView
          activeBook={activeBook}
          entries={entries}
          toCHF={toCHF}
          onUpdateBook={updateBook}
          onAddEntry={addTransferEntry}
          todayISO={todayISO}
        />
      ) : view === "investments" ? (
        <InvestmentsView
          activeBook={activeBook}
          toCHF={toCHF}
          onUpdateBook={updateBook}
          todayISO={todayISO}
        />
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <CardContent>
              <div className="hb-form">
                <div className="hb-field">
                  <div className="hb-label">Datum</div>
                  <input
                    className="hb-input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="hb-field">
                  <div className="hb-label">Betrag</div>
                  <input
                    className="hb-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="z.B. 12.50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                {/* Kategorie: je nach Art unterschiedliche Listen */}
                {kind === "income" ? (
                  <div className="hb-field hb-field-category">
                    <div className="hb-label">Kategorie</div>
                    <input
                      className="hb-input"
                      type="text"
                      value="Allgemein"
                      disabled
                      style={{ background: "var(--hover-bg)", color: "var(--muted)" }}
                    />
                  </div>
                ) : kind === "transfer" ? (
                  <CategoryPicker
                    className="hb-field-category"
                    label="Transfer-Zweck"
                    value={category}
                    categories={indicateTransferCategories}
                    onChange={setCategory}
                    onDelete={deleteTransferCategory}
                    isDeletable={(cat) => indicateTransferCategories.includes(cat) && indicateTransferCategories.length > 1}
                  />
                ) : (
                  <CategoryPicker
                    className="hb-field-category"
                    label="Kategorie"
                    value={category}
                    categories={indicateCategories}
                    onChange={setCategory}
                    onDelete={deleteCategory}
                    isDeletable={isDeletableCategory}
                  />
                )}

                <div className="hb-field">
                  <div className="hb-label">Art</div>
                  <select className="hb-input" value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="income">Einnahme</option>
                    <option value="expense">Ausgabe</option>
                    <option value="transfer">Transfer/Rücklage</option>
                  </select>
                </div>

                {kind === "expense" && (
                  <div className="hb-field">
                    <div className="hb-label">Bezahlt aus</div>
                    <select className="hb-input" value={source} onChange={(e) => setSource(e.target.value)}>
                      <option value="month">Monatsbudget</option>
                      <option value="pot">Topf</option>
                    </select>
                  </div>
                )}

                {(kind === "transfer" || (kind === "expense" && source === "pot")) && (
                  <div className="hb-field">
                    <div className="hb-label">{kind === "transfer" ? "In Topf" : "Aus Topf"}</div>
                    <select className="hb-input" value={potId} onChange={(e) => setPotId(e.target.value)}>
                      {(activeBook?.pots || []).map((pot) => (
                        <option key={pot.id} value={pot.id}>
                          {pot.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="hb-field hb-field-note" style={{ flex: 1, minWidth: 220 }}>
                  <div className="hb-label">Notiz (optional)</div>
                  <input
                    className="hb-input"
                    type="text"
                    placeholder="z.B. Migros, Abo, ..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <Button onClick={addEntry}>Hinzufügen</Button>

                <div className="hb-topline hb-full">
                  <input
                    className="hb-input"
                    type="text"
                    placeholder={kind === "transfer" ? "Neuer Transfer-Zweck" : "Neue Kategorie"}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    style={{ minWidth: 260 }}
                    disabled={kind === "income"}
                  />
                  <Button 
                    variant="outline" 
                    onClick={addCategory}
                    disabled={kind === "income"}
                  >
                    {kind === "transfer" ? "Transfer-Zweck hinzufügen" : "Kategorie hinzufügen"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* NEU: 4 Kacheln statt 3 */}
          <Card style={{ marginBottom: 16 }}>
            <CardContent>
              <div className="hb-grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                <div>
                  <div className="hb-stat-title">Einnahmen</div>
                  <div className="hb-stat-val hb-ok">+{toCHF(totalIncome)}</div>
                </div>
                <div>
                  <div className="hb-stat-title">Ausgaben</div>
                  <div className="hb-stat-val hb-bad">-{toCHF(totalExpense)}</div>
                </div>
                <div>
                  <div className="hb-stat-title">Transfers</div>
                  <div className="hb-stat-val hb-transfer">→{toCHF(totalTransfers)}</div>
                </div>
                <div>
                  <div className="hb-stat-title">Saldo</div>
                  <div className={`hb-stat-val ${balance >= 0 ? "hb-ok" : "hb-bad"}`}>
                    {toCHF(balance)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* NEU: Topf-Stände */}
          <Card style={{ marginBottom: 16 }}>
            <CardContent>
              <h3 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>Topf-Stände</h3>
              <div className="hb-grid-3" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {potBalances.map((pot) => (
                  <div key={pot.id}>
                    <div className="hb-stat-title">{pot.name}</div>
                    <div className={`hb-stat-val ${pot.balance >= 0 ? "hb-ok" : "hb-bad"}`}>
                      {toCHF(pot.balance)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Budget-Übersicht (nur wenn Kategorien mit Budget existieren) */}
          {budgetStatus.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <CardContent>
                <h3 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>
                  Budget-Übersicht {monthFilter ? `(${monthFilter})` : "(Alle Monate)"}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {budgetStatus.map((item) => (
                    <div key={item.name} className="hb-budget-row">
                      <div className="hb-budget-label">
                        <span style={{ fontWeight: 500 }}>{item.name}</span>
                        <span className="hb-muted">
                          {toCHF(item.spent)} / {toCHF(item.budget)} ({item.percent}%)
                        </span>
                      </div>
                      <div className="hb-budget-bar-bg">
                        <div
                          className={`hb-budget-bar hb-budget-${item.status}`}
                          style={{ width: `${Math.min(item.percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Charts expenseByCategory={pieData} catColor={catColor} toCHF={toCHF} barData={barData} />

          <EntriesTable
            entriesSorted={entriesSorted}
            monthLabel={monthLabel}
            toCHF={toCHF}
            startEdit={startEdit}
            removeEntry={removeEntry}
          />

          <EditDialog
            open={editOpen}
            title={editingEntry ? "Eintrag bearbeiten" : "Eintrag bearbeiten"}
            onClose={closeEdit}
            onSave={saveEdit}
            canSave={canSaveEdit}
          >
            <div className="hb-two" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="hb-field">
                <div className="hb-label">Datum</div>
                <input
                  className="hb-input"
                  type="date"
                  value={editDraft.date}
                  onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))}
                />
              </div>

              <div className="hb-field">
                <div className="hb-label">Art</div>
                <select
                  className="hb-input"
                  value={editDraft.kind}
                  onChange={(e) => setEditDraft((d) => ({ ...d, kind: e.target.value }))}
                >
                  <option value="income">Einnahme</option>
                  <option value="expense">Ausgabe</option>
                  <option value="transfer">Transfer/Rücklage</option>
                </select>
              </div>

              {/* Kategorie: je nach Art unterschiedliche Listen */}
              {editDraft.kind === "income" ? (
                <div className="hb-field hb-field-category">
                  <div className="hb-label">Kategorie</div>
                  <input
                    className="hb-input"
                    type="text"
                    value="Allgemein"
                    disabled
                    style={{ background: "var(--hover-bg)", color: "var(--muted)" }}
                  />
                </div>
              ) : editDraft.kind === "transfer" ? (
                <CategoryPicker
                  className="hb-field-category"
                  label="Transfer-Zweck"
                  value={editDraft.category}
                  categories={indicateTransferCategories}
                  onChange={(cat) => setEditDraft((d) => ({ ...d, category: cat }))}
                  onDelete={deleteTransferCategory}
                  isDeletable={(cat) => indicateTransferCategories.includes(cat) && indicateTransferCategories.length > 1}
                />
              ) : (
                <CategoryPicker
                  className="hb-field-category"
                  label="Kategorie"
                  value={editDraft.category}
                  categories={indicateCategories}
                  onChange={(cat) => setEditDraft((d) => ({ ...d, category: cat }))}
                  onDelete={deleteCategory}
                  isDeletable={isDeletableCategory}
                />
              )}

              {editDraft.kind === "expense" && (
                <div className="hb-field">
                  <div className="hb-label">Bezahlt aus</div>
                  <select
                    className="hb-input"
                    value={editDraft.source}
                    onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))}
                  >
                    <option value="month">Monatsbudget</option>
                    <option value="pot">Topf</option>
                  </select>
                </div>
              )}

              {(editDraft.kind === "transfer" || (editDraft.kind === "expense" && editDraft.source === "pot")) && (
                <div className="hb-field">
                  <div className="hb-label">{editDraft.kind === "transfer" ? "In Topf" : "Aus Topf"}</div>
                  <select
                    className="hb-input"
                    value={editDraft.potId}
                    onChange={(e) => setEditDraft((d) => ({ ...d, potId: e.target.value }))}
                  >
                    {(activeBook?.pots || []).map((pot) => (
                      <option key={pot.id} value={pot.id}>
                        {pot.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="hb-field">
                <div className="hb-label">Betrag</div>
                <input
                  className="hb-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="z.B. 12.50"
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
                />
                <div className="hb-muted" style={{ marginTop: 6 }}>
                  Komma geht auch (z.B. 12,50).
                </div>
              </div>

              <div className="hb-field" style={{ gridColumn: "1 / -1" }}>
                <div className="hb-label">Notiz</div>
                <input
                  className="hb-input"
                  type="text"
                  placeholder="z.B. Migros, Abo, ..."
                  value={editDraft.note}
                  onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </div>
            </div>

            {!canSaveEdit ? (
              <div style={{ marginTop: 10, color: "var(--red)", fontSize: 12 }}>
                Bitte Datum & einen gültigen Betrag (&gt; 0) setzen.
              </div>
            ) : null}
          </EditDialog>

        </>
      )}

      <EditDialog
        open={newBookOpen}
        title="Neues Haushaltsbuch"
        onClose={() => setNewBookOpen(false)}
        onSave={createBook}
        canSave={Boolean(newBookName.trim())}
        saveLabel="Erstellen"
      >
        <div className="hb-field">
          <div className="hb-label">Name</div>
          <input
            className="hb-input"
            value={newBookName}
            onChange={(e) => setNewBookName(e.target.value)}
            placeholder="z.B. 2026, WG, Urlaub, ..."
            autoFocus
          />
          <div className="hb-muted" style={{ marginTop: 8 }}>
            Du kannst mehrere Bücher führen und oben wechseln.
          </div>
        </div>
      </EditDialog>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        books={books}
        activeBookId={activeBookId}
        monthFilter={monthFilter}
        onRestoreAll={restoreAll}
        activeBook={activeBook}
        onUpdateBook={updateBook}
      />
    </div>
  );
}