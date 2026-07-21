import React, { useState, useMemo } from "react";

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
import CostGroupsView from "./features/CostGroupsView.jsx";
import NavDrawer from "./features/NavDrawer.jsx";
import EditEntryDialog from "./features/EditEntryDialog.jsx";
import AppToolbar from "./features/AppToolbar.jsx";
import DashboardView from "./features/DashboardView.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  sumAmounts,
} from "./utils/hbUtils.js";
import { calcExpenseByHierarchy, calcIncomeByHierarchy } from "./utils/budgetUtils.js";
import { EMPTY_ARRAY, MONTHS_LONG, MONTHS_SHORT } from "./utils/constants.js";
import CurrencyContext from "./contexts/CurrencyContext.jsx";
import { getEntryFinancialMonth, getFinancialMonthRange } from "./utils/financialMonthUtils.js";
import { calcPotBalance } from "./utils/potUtils.js";

import { useBookManager } from "./hooks/useBookManager.js";
import { useAppSettings } from "./hooks/useAppSettings.js";
import { useUpdateManager } from "./hooks/useUpdateManager.js";
import { useEntryActions } from "./hooks/useEntryActions.js";

const VIEW_LABELS = { trend: "Trend", pots: "Töpfe", goals: "Sparziele", fixed: "Fixkosten", costgroups: "Kostenrechner" };

export default function HaushaltsbuchApp() {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState("book");
  const [navOpen, setNavOpen] = useState(false);
  const [navAnchor, setNavAnchor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const bookManager = useBookManager({ toast, confirm });
  const {
    books, setActiveBookId,
    activeBook, baseCurrency, monthStartDay, fmt,
    patchActiveBook, updateBook,
    createBook, applyRenameActiveBook, deleteActiveBook,
    importBook, handleMonthStartDayChange,
  } = bookManager;

  const appSettings = useAppSettings();
  const { darkMode, setDarkMode, fontFamily, setFontFamily, monthFilter, setMonthFilter } = appSettings;
  const update = useUpdateManager();

  const entries = activeBook?.entries || EMPTY_ARRAY;
  const indicateTransferCategories = activeBook?.transferCategories || EMPTY_ARRAY;

  const entryActions = useEntryActions({
    activeBook,
    patchActiveBook,
    fmt,
    confirm,
    indicateTransferCategories,
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

  const savingsPotIds = useMemo(
    () => new Set((activeBook?.pots || []).filter((p) => p.isSavings).map((p) => p.id)),
    [activeBook?.pots]
  );
  const totalSavingsTransfers = useMemo(
    () => sumAmounts(filteredEntries, (e) => e.kind === "transfer" && savingsPotIds.has(e.potId)),
    [filteredEntries, savingsPotIds]
  );
  const totalReserveTransfers = useMemo(
    () => sumAmounts(filteredEntries, (e) => e.kind === "transfer" && !savingsPotIds.has(e.potId)),
    [filteredEntries, savingsPotIds]
  );

  const expenseCategories = activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
  const incomeCategories = activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES;
  const expenseByHierarchy = useMemo(
    () => calcExpenseByHierarchy(filteredEntries, expenseCategories, monthFilter, monthStartDay),
    [filteredEntries, expenseCategories, monthFilter, monthStartDay]
  );
  const incomeByHierarchy = useMemo(
    () => calcIncomeByHierarchy(filteredEntries, incomeCategories, monthFilter, monthStartDay),
    [filteredEntries, incomeCategories, monthFilter, monthStartDay]
  );

  const potBalances = useMemo(
    () =>
      (activeBook?.pots || []).map((pot) => ({
        ...pot,
        balance: calcPotBalance(entries, pot.id),
      })),
    [activeBook?.pots, entries]
  );

  const entriesSorted = useMemo(
    () =>
      filteredEntries.toSorted((a, b) => {
        const da = String(a.date || ""), db = String(b.date || "");
        if (da !== db) return db.localeCompare(da);
        // IDs sind Strings ("entry_<timestamp>_<rand>") → Number() wäre NaN.
        // String-Vergleich sortiert bei gleichem Datum neueste zuerst.
        return String(b.id || "").localeCompare(String(a.id || ""));
      }),
    [filteredEntries]
  );

  const monthLabel = useMemo(() => {
    if (!monthFilter) return "Alle Monate";
    const [yyyy, mm] = monthFilter.split("-");
    const monthName = MONTHS_LONG[Number(mm) - 1];
    if (monthStartDay === 1) return `${monthName} ${yyyy}`;
    const range = getFinancialMonthRange(monthFilter, monthStartDay);
    if (!range) return `${monthName} ${yyyy}`;
    const fmtDate = (iso) => {
      if (!iso) return "";
      const [, m, dd] = iso.split("-");
      return `${Number(dd)}. ${MONTHS_SHORT[Number(m) - 1]}`;
    };
    return `${monthName} ${yyyy} · ${fmtDate(range.startDate)} – ${fmtDate(range.endDate)}`;
  }, [monthFilter, monthStartDay]);

  const allEntries = useMemo(
    () =>
      (books || []).flatMap((b) =>
        (b.entries || []).map((e) => ({ ...e, __bookId: b.id, __bookName: b.name }))
      ),
    [books]
  );

  const isViewWithoutMonth = view in VIEW_LABELS;

  const currencyContextValue = useMemo(() => ({ fmt, baseCurrency }), [fmt, baseCurrency]);

  return (
    <CurrencyContext.Provider value={currencyContextValue}>
      <div className="hb-page">
        <div className="hb-page-container">
          {update.available && !update.ready && (
            <div className="hb-infobar" role="status">
              <div className="hb-infobar-icon"><IconInfo /></div>
              <div className="hb-infobar-content">
                <div className="hb-infobar-title">Update verfügbar</div>
                <div className="hb-infobar-message">
                  Version <strong>v{update.available.version}</strong> ist verfügbar.
                </div>
              </div>
              <div className="hb-infobar-actions">
                <Button onClick={update.download} disabled={update.downloading}>
                  {update.downloading
                    ? "Wird heruntergeladen…"
                    : update.manualDownload
                    ? "Auf GitHub herunterladen"
                    : "Herunterladen"}
                </Button>
                <button
                  type="button"
                  className="hb-icon-btn"
                  onClick={update.dismissAvailable}
                  aria-label="Schliessen"
                  title="Schliessen"
                >
                  <IconClose />
                </button>
              </div>
            </div>
          )}
          {update.ready && (
            <div className="hb-infobar" role="status">
              <div className="hb-infobar-icon"><IconInfo /></div>
              <div className="hb-infobar-content">
                <div className="hb-infobar-title">Update bereit</div>
                <div className="hb-infobar-message">
                  Eine neue Version wurde heruntergeladen. Beim Neustart wird sie installiert.
                </div>
              </div>
              <div className="hb-infobar-actions">
                <Button onClick={update.install}>Jetzt neu starten</Button>
                <button
                  type="button"
                  className="hb-icon-btn"
                  onClick={update.dismissReady}
                  aria-label="Schliessen"
                  title="Schliessen"
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

          <ErrorBoundary context={view === "book" ? "Dashboard" : view === "trend" ? "Trend" : view === "pots" ? "Töpfe" : view === "goals" ? "Sparziele" : view === "costgroups" ? "Kostenrechner" : "Fixkosten"}>
            {view === "trend" ? (
              <TrendView
                entries={entries}
                entriesAll={allEntries}
                recurringExpenses={activeBook?.recurringExpenses || []}
                expenseCategories={activeBook?.expenseCategories || []}
                monthStartDay={monthStartDay}
                pots={activeBook?.pots || []}
              />
            ) : view === "pots" ? (
              <PotsView
                activeBook={activeBook}
                entries={entries}
                onAddTransferEntry={entryActions.addTransferEntry}
                onUpdateBook={updateBook}
                transferCategories={indicateTransferCategories}
                onEditEntry={entryActions.startEdit}
                onRemoveEntry={entryActions.removeEntry}
                monthStartDay={monthStartDay}
                monthFilter={monthFilter}
                monthLabel={monthLabel}
              />
            ) : view === "goals" ? (
              <GoalsView
                activeBook={activeBook}
                entries={entries}
                onUpdateBook={updateBook}
                monthStartDay={monthStartDay}
              />
            ) : view === "fixed" ? (
              <FixedCostsView
                activeBook={activeBook}
                entries={entries}
                onUpdateBook={updateBook}
                onAddEntry={entryActions.addTransferEntry}
              />
            ) : view === "costgroups" ? (
              <CostGroupsView
                activeBook={activeBook}
                onUpdateBook={updateBook}
                monthStartDay={monthStartDay}
              />
            ) : (
              <DashboardView
                activeBook={activeBook}
                filteredEntries={filteredEntries}
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                totalTransfers={totalTransfers}
                totalSavingsTransfers={totalSavingsTransfers}
                totalReserveTransfers={totalReserveTransfers}
                balance={balance}
                potBalances={potBalances}
                expenseByHierarchy={expenseByHierarchy}
                incomeByHierarchy={incomeByHierarchy}
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
            onImportBook={importBook}
            activeBook={activeBook}
            onUpdateBook={updateBook}
            onMonthStartDayChange={(newStartDay) =>
              handleMonthStartDayChange(newStartDay, setMonthFilter)
            }
            fontFamily={fontFamily}
            onFontFamilyChange={setFontFamily}
            update={update}
          />
        </div>
      </div>
    </CurrencyContext.Provider>
  );
}
