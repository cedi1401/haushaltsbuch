import React, { useState, useMemo } from "react";

const EMPTY_ARRAY = [];
const DEFAULT_CATEGORIES = [{ name: "Allgemein", budget: null }];

import "./styles/haushaltsbuch.css";

import { Button } from "./components/ui.jsx";
import { useToast } from "./components/Toast.jsx";
import { useConfirm } from "./components/ConfirmDialog.jsx";
import { IconInfo, IconClose } from "./components/icons.jsx";

import SettingsDialog from "./features/SettingsDialog.jsx";
import TrendView from "./features/TrendView.jsx";
import PotsView from "./features/PotsView.jsx";
import GoalsView from "./features/GoalsView.jsx";
import FixedCostsView from "./features/FixedCostsView.jsx";
import NavDrawer from "./features/NavDrawer.jsx";
import EditEntryDialog from "./features/EditEntryDialog.jsx";
import AppToolbar from "./features/AppToolbar.jsx";
import DashboardView from "./features/DashboardView.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import {
  getCategoryNames,
  todayISO,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  sumAmounts,
} from "./utils/hbUtils.js";
import CurrencyContext from "./contexts/CurrencyContext.jsx";
import { getEntryFinancialMonth, getFinancialMonthRange } from "./utils/financialMonthUtils.js";
import { calcPotBalance } from "./utils/potUtils.js";

import { useBookManager } from "./hooks/useBookManager.js";
import { useAppSettings } from "./hooks/useAppSettings.js";
import { useEntryActions } from "./hooks/useEntryActions.js";
import { useCategoryStats } from "./hooks/useCategoryStats.js";

const VIEW_LABELS = { trend: "Trend", pots: "Töpfe", goals: "Sparziele", fixed: "Fixkosten" };

export default function HaushaltsbuchApp() {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState("book");
  const [navOpen, setNavOpen] = useState(false);
  const [navAnchor, setNavAnchor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const bookManager = useBookManager({ toast, confirm });
  const {
    books, setBooks, setActiveBookId,
    activeBook, baseCurrency, monthStartDay, fmt,
    patchActiveBook, updateBook,
    createBook, applyRenameActiveBook, deleteActiveBook,
    importBook, handleMonthStartDayChange,
    isInitialLoad,
  } = bookManager;

  const appSettings = useAppSettings({ isInitialLoad });
  const { darkMode, setDarkMode, fontFamily, setFontFamily, monthFilter, setMonthFilter, updateReady, setUpdateReady } = appSettings;

  const entries = activeBook?.entries || EMPTY_ARRAY;
  const indicateTransferCategories = activeBook?.transferCategories || EMPTY_ARRAY;
  const indicateCategories = activeBook?.categories || DEFAULT_CATEGORIES;
  const indicateCategoryNames = useMemo(() => getCategoryNames(indicateCategories), [indicateCategories]);

  const entryActions = useEntryActions({
    activeBook,
    patchActiveBook,
    fmt,
    confirm,
    indicateTransferCategories,
    indicateCategoryNames,
  });

  function openNav(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setNavAnchor({ top: rect.bottom + 6, left: rect.left });
    setNavOpen(true);
  }

  function handleCreateBook(name) {
    createBook(name);
    entryActions.setAddField("category", "Allgemein");
    setView("book");
  }

  // Restores a full backup: orchestrates multiple hooks
  function restoreAll(restored) {
    setBooks(restored.books);
    setActiveBookId(restored.activeBookId);
    setMonthFilter(restored.monthFilter);

    const nextBook = restored.books.find((b) => b.id === restored.activeBookId) || restored.books[0];
    const nextCatNames = getCategoryNames(nextBook?.categories || []);
    if (!nextCatNames.includes(entryActions.addDraft.category)) {
      const fallback = nextCatNames.includes("Allgemein") ? "Allgemein" : nextCatNames[0];
      entryActions.setAddField("category", fallback || "Allgemein");
    }
  }

  // Derived data
  const filteredEntries = useMemo(() => {
    const month = monthFilter?.trim();
    if (!month) return entries;
    return entries.filter((e) => getEntryFinancialMonth(e, monthStartDay) === month);
  }, [entries, monthFilter, monthStartDay]);

  const totalIncome = useMemo(
    () => sumAmounts(filteredEntries, (e) => e.kind === "income"),
    [filteredEntries]
  );
  const totalExpense = useMemo(
    () => sumAmounts(filteredEntries, (e) => e.kind === "expense" && e.source === "month"),
    [filteredEntries]
  );
  const totalTransfers = useMemo(
    () => sumAmounts(filteredEntries, (e) => e.kind === "transfer"),
    [filteredEntries]
  );
  const balance = totalIncome - totalExpense - totalTransfers;

  const { expenseByHierarchy, incomeByHierarchy } = useCategoryStats(
    filteredEntries,
    activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES,
    activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES,
    monthFilter,
    monthStartDay
  );

  const potBalances = useMemo(() => {
    if (!activeBook?.pots) return [];
    return activeBook.pots.map((pot) => ({
      ...pot,
      balance: calcPotBalance(entries, pot.id),
    }));
  }, [activeBook, entries]);

  const entriesSorted = useMemo(
    () =>
      filteredEntries.toSorted((a, b) => {
        const da = String(a.date || ""), db = String(b.date || "");
        if (da !== db) return db.localeCompare(da);
        return Number(b.id) - Number(a.id);
      }),
    [filteredEntries]
  );

  const monthLabel = useMemo(() => {
    if (!monthFilter) return "(Alle Monate)";
    if (monthStartDay === 1) return `(${monthFilter})`;
    const range = getFinancialMonthRange(monthFilter, monthStartDay);
    if (!range) return `(${monthFilter})`;
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const fmtDate = (iso) => {
      if (!iso) return "";
      const [, mm, dd] = iso.split("-");
      return `${Number(dd)}. ${months[Number(mm) - 1]}`;
    };
    return `(${monthFilter} · ${fmtDate(range.startDate)} – ${fmtDate(range.endDate)})`;
  }, [monthFilter, monthStartDay]);

  const allEntries = useMemo(
    () =>
      (books || []).flatMap((b) =>
        (b.entries || []).map((e) => ({ ...e, __bookId: b.id, __bookName: b.name }))
      ),
    [books]
  );

  const isViewWithoutMonth = view in VIEW_LABELS;

  return (
    <CurrencyContext.Provider value={fmt}>
      <div className="hb-page">
        <div className="hb-page-container">
          {updateReady && (
            <div className="hb-infobar" role="status">
              <div className="hb-infobar-icon"><IconInfo /></div>
              <div className="hb-infobar-content">
                <div className="hb-infobar-title">Update bereit</div>
                <div className="hb-infobar-message">
                  Eine neue Version wurde heruntergeladen. Beim Neustart wird sie installiert.
                </div>
              </div>
              <div className="hb-infobar-actions">
                <Button onClick={() => window.electronAPI.installUpdate()}>Jetzt neu starten</Button>
                <button
                  type="button"
                  className="hb-icon-btn"
                  onClick={() => setUpdateReady(false)}
                  aria-label="Schließen"
                  title="Schließen"
                >
                  <IconClose />
                </button>
              </div>
            </div>
          )}

          <NavDrawer
            open={navOpen}
            onClose={() => setNavOpen(false)}
            view={view}
            onChangeView={setView}
            anchor={navAnchor}
          />

          <AppToolbar
            books={books}
            activeBookId={activeBook?.id || ""}
            onBookChange={setActiveBookId}
            view={view}
            onOpenNav={openNav}
            onCreateBook={handleCreateBook}
            onDeleteBook={deleteActiveBook}
            canDeleteBook={books.length > 1}
            activeBookName={activeBook?.name || ""}
            onRenameBook={applyRenameActiveBook}
            monthFilter={monthFilter}
            onMonthFilterChange={setMonthFilter}
            darkMode={darkMode}
            onDarkModeToggle={() => setDarkMode(!darkMode)}
            onOpenSettings={() => setSettingsOpen(true)}
            isViewWithoutMonth={isViewWithoutMonth}
          />

          <ErrorBoundary context={view === "book" ? "Dashboard" : view === "trend" ? "Trend" : view === "pots" ? "Töpfe" : view === "goals" ? "Sparziele" : "Fixkosten"}>
            {view === "trend" ? (
              <TrendView
                entries={entries}
                entriesAll={allEntries}
                recurringExpenses={activeBook?.recurringExpenses || []}
                expenseCategories={activeBook?.expenseCategories || []}
                monthStartDay={monthStartDay}
              />
            ) : view === "pots" ? (
              <PotsView
                activeBook={activeBook}
                entries={entries}
                baseCurrency={baseCurrency}
                onAddTransferEntry={entryActions.addTransferEntry}
                onUpdateBook={updateBook}
                transferCategories={indicateTransferCategories}
                todayISO={todayISO}
                onEditEntry={entryActions.startEdit}
                onRemoveEntry={entryActions.removeEntry}
                monthStartDay={monthStartDay}
              />
            ) : view === "goals" ? (
              <GoalsView
                activeBook={activeBook}
                entries={entries}
                baseCurrency={baseCurrency}
                onUpdateBook={updateBook}
                todayISO={todayISO}
                monthStartDay={monthStartDay}
              />
            ) : view === "fixed" ? (
              <FixedCostsView
                activeBook={activeBook}
                entries={entries}
                baseCurrency={baseCurrency}
                onUpdateBook={updateBook}
                onAddEntry={entryActions.addTransferEntry}
                todayISO={todayISO}
              />
            ) : (
              <DashboardView
                activeBook={activeBook}
                filteredEntries={filteredEntries}
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                totalTransfers={totalTransfers}
                balance={balance}
                potBalances={potBalances}
                expenseByHierarchy={expenseByHierarchy}
                incomeByHierarchy={incomeByHierarchy}
                baseCurrency={baseCurrency}
                monthFilter={monthFilter}
                monthLabel={monthLabel}
                monthStartDay={monthStartDay}
                entriesSorted={entriesSorted}
                entryActions={entryActions}
                onUpdateBook={updateBook}
                patchActiveBook={patchActiveBook}
                indicateTransferCategories={indicateTransferCategories}
              />
            )}
          </ErrorBoundary>

          {/* EditEntryDialog global — wird auch aus PotsView heraus geöffnet */}
          <EditEntryDialog
            open={entryActions.editOpen}
            onClose={entryActions.closeEdit}
            onSave={entryActions.saveEdit}
            canSave={entryActions.canSaveEdit}
            editDraft={entryActions.editDraft}
            setEditDraft={entryActions.setEditDraft}
            pots={activeBook?.pots || []}
            expenseCategories={activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES}
            incomeCategories={activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES}
            transferCategories={indicateTransferCategories}
            withdrawalCategories={entryActions.editWithdrawalCategories}
          />

          <SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            monthFilter={monthFilter}
            onRestoreAll={restoreAll}
            onImportBook={importBook}
            activeBook={activeBook}
            onUpdateBook={updateBook}
            onMonthStartDayChange={(newStartDay) =>
              handleMonthStartDayChange(newStartDay, setMonthFilter)
            }
            fontFamily={fontFamily}
            onFontFamilyChange={setFontFamily}
          />
        </div>
      </div>
    </CurrencyContext.Provider>
  );
}
