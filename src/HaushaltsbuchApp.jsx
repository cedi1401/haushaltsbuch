import React, { useState, useMemo, useCallback } from "react";

import "./styles/haushaltsbuch.css";

import { Button } from "./components/ui.jsx";
import { useToast } from "./components/toastContext.js";
import { useConfirm } from "./components/ConfirmDialog.jsx";
import { IconInfo, IconClose } from "./components/icons.jsx";

import SettingsDialog from "./features/SettingsDialog.jsx";
import NavPane from "./features/NavPane.jsx";
import EditEntryDialog from "./features/EditEntryDialog.jsx";
import AppToolbar from "./features/AppToolbar.jsx";
import { DEFAULT_VIEW_ID, getView } from "./features/viewRegistry.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import CategoryManagerDialog from "./components/CategoryManagerDialog.jsx";

import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./utils/bookDefaults.js";
import { sumAmounts } from "./utils/hbUtils.js";
import { getActiveTransferCategories, getFixedCostItems } from "./utils/transferCategoryUtils.js";
import { calcExpenseByHierarchy, calcIncomeByHierarchy } from "./utils/budgetUtils.js";
import { EMPTY_ARRAY, MONTHS_LONG, MONTHS_SHORT } from "./utils/constants.js";
import { CurrencyContext } from "./contexts/CurrencyContext.jsx";
import { UndoContext } from "./contexts/UndoContext.js";
import { getEntryFinancialMonth, getFinancialMonthRange } from "./utils/financialMonthUtils.js";
import { calcPotBalance } from "./utils/potUtils.js";

import { useBookManager } from "./hooks/useBookManager.js";
import { useAppSettings } from "./hooks/useAppSettings.js";
import { useUpdateManager } from "./hooks/useUpdateManager.js";
import { useEntryActions } from "./hooks/useEntryActions.js";

export default function HaushaltsbuchApp() {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState(DEFAULT_VIEW_ID);
  // Sprung aus den Fixkosten in die Rücklagen mit offenem Dialog (siehe
  // SavingsView). Jeder andere Wechsel verwirft ihn, damit ein späterer Besuch
  // der Rücklagen den Dialog nicht erneut öffnet.
  const [savingsIntent, setSavingsIntent] = useState(null);
  const changeView = useCallback((id) => {
    setSavingsIntent(null);
    setView(id);
  }, []);
  const openSavingsPosition = useCallback((intent) => {
    setSavingsIntent(intent);
    setView("savings");
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Der Kategorien-Dialog wird vom Dashboard aus geöffnet.
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  // Frei gewählter Zeitraum des Kostenrechners. Liegt hier, weil CostGroupsView
  // beim Ansichtswechsel unmountet wird — so überlebt die Einstellung die
  // Navigation, aber bewusst nur zur Laufzeit: ein Neustart beginnt wieder bei
  // "Gesamt". `active` merkt sich, ob der Bereich zuletzt auch ausgewählt war.
  const [costGroupRange, setCostGroupRange] = useState({ from: "", to: "", active: false });
  // Gewählter Topf der Töpfe-Ansicht. Liegt aus demselben Grund hier: er
  // überlebt den Ansichtswechsel, aber nur zur Laufzeit. Eine unbekannte ID
  // (anderes Buch, gelöschter Topf) fällt in PotsView auf den ersten Topf zurück.
  const [selectedPotId, setSelectedPotId] = useState("");

  const bookManager = useBookManager({ toast, confirm });
  const {
    books, setActiveBookId,
    activeBook, baseCurrency, monthStartDay, fmt,
    patchActiveBook, updateBook,
    createBook, applyRenameActiveBook, deleteActiveBook,
    importBook, handleMonthStartDayChange,
    undoHistory,
  } = bookManager;

  const appSettings = useAppSettings();
  const { darkMode, setDarkMode, monthFilter, setMonthFilter, navExpanded, setNavExpanded } = appSettings;
  const update = useUpdateManager();

  const entries = activeBook?.entries || EMPTY_ARRAY;
  // Volle Liste inkl. gelöschter Zwecke (für Namen bestehender Buchungen) und
  // die aktiven Zwecke (für Auswahllisten und Standardwerte).
  const allTransferCategories = activeBook?.transferCategories || EMPTY_ARRAY;
  const indicateTransferCategories = useMemo(
    () => getActiveTransferCategories(allTransferCategories),
    [allTransferCategories]
  );
  // Ausgaben-Positionen plus Zwecke mit Rate — die Fixkosten-Sicht für den Trend.
  const recurringExpenses = activeBook?.recurringExpenses;
  const fixedCostItems = useMemo(
    () => getFixedCostItems({ recurringExpenses, transferCategories: allTransferCategories }),
    [recurringExpenses, allTransferCategories]
  );

  const entryActions = useEntryActions({
    activeBook,
    patchActiveBook,
    fmt,
    confirm,
    indicateTransferCategories,
    offerUndo: undoHistory.offer,
  });

  function handleCreateBook(name) {
    createBook(name);
    entryActions.setAddField("category", "Allgemein");
    changeView(DEFAULT_VIEW_ID);
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

  const currentView = getView(view);
  const CurrentViewComponent = currentView.Component;

  // Alles, woraus die Registry die Props der Views baut (siehe viewRegistry.js).
  const viewContext = {
    books, activeBook, entries, filteredEntries, entriesSorted,
    totalIncome, totalExpense, totalTransfers,
    totalSavingsTransfers, totalReserveTransfers, balance,
    potBalances, expenseByHierarchy, incomeByHierarchy,
    expenseCategories, allTransferCategories, indicateTransferCategories, fixedCostItems,
    monthFilter, setMonthFilter, monthLabel, monthStartDay, baseCurrency,
    entryActions, updateBook, patchActiveBook,
    selectedPotId, setSelectedPotId,
    costGroupRange, setCostGroupRange,
    navigate: changeView,
    savingsIntent, openSavingsPosition,
    openCategoryManager: () => setCategoryManagerOpen(true),
  };

  const currencyContextValue = useMemo(() => ({ fmt, baseCurrency }), [fmt, baseCurrency]);

  return (
    <CurrencyContext.Provider value={currencyContextValue}>
    <UndoContext.Provider value={undoHistory}>
      <NavPane
        view={currentView.id}
        onChangeView={changeView}
        expanded={navExpanded}
        onExpandedChange={setNavExpanded}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
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
                  aria-label="Schließen"
                  title="Schließen"
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
                  aria-label="Schließen"
                  title="Schließen"
                >
                  <IconClose />
                </button>
              </div>
            </div>
          )}

          <AppToolbar
            books={books}
            activeBookId={activeBook?.id || ""}
            onBookChange={setActiveBookId}
            title={currentView.label}
            onCreateBook={handleCreateBook}
            onDeleteBook={deleteActiveBook}
            canDeleteBook={books.length > 1}
            activeBookName={activeBook?.name || ""}
            onRenameBook={applyRenameActiveBook}
            monthFilter={monthFilter}
            onMonthFilterChange={setMonthFilter}
            darkMode={darkMode}
            onDarkModeToggle={() => setDarkMode(!darkMode)}
            showMonthFilter={currentView.usesMonth}
          />

          <ErrorBoundary key={currentView.id} context={currentView.label}>
            <CurrentViewComponent {...currentView.getProps(viewContext)} />
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
            allTransferCategories={allTransferCategories}
            purposes={entryActions.editPurposes}
          />

          <CategoryManagerDialog
            open={categoryManagerOpen}
            onClose={() => setCategoryManagerOpen(false)}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            transferCategories={allTransferCategories}
            pots={activeBook?.pots || EMPTY_ARRAY}
            onUpdateExpenseCategories={(newCats) =>
              patchActiveBook((b) => ({ ...b, expenseCategories: newCats }))
            }
            onUpdateIncomeCategories={(newCats) =>
              patchActiveBook((b) => ({ ...b, incomeCategories: newCats }))
            }
            onUpdateTransferCategories={(newCats) =>
              patchActiveBook((b) => ({ ...b, transferCategories: newCats }))
            }
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
            update={update}
          />
        </div>
      </div>
    </UndoContext.Provider>
    </CurrencyContext.Provider>
  );
}
