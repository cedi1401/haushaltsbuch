import React, { useState, useMemo } from "react";

const EMPTY_ARRAY = [];
const DEFAULT_CATEGORIES = [{ name: "Allgemein", budget: null }];

import "./styles/haushaltsbuch.css";

import { Button, Card, CardContent } from "./components/ui.jsx";
import EditDialog from "./components/EditDialog.jsx";
import CategoryManagerDialog from "./components/CategoryManagerDialog.jsx";
import OverflowMenu from "./components/OverflowMenu.jsx";
import RenameDialog from "./components/RenameDialog.jsx";
import { useToast } from "./components/Toast.jsx";
import { useConfirm } from "./components/ConfirmDialog.jsx";
import { IconMenu, IconClose, IconInfo, IconSettings, IconSun, IconMoon } from "./components/icons.jsx";

import SettingsDialog from "./features/SettingsDialog.jsx";
import Charts from "./features/Charts.jsx";
import InsightsPanel from "./features/InsightsPanel.jsx";
import EntriesTable from "./features/EntriesTable.jsx";
import TrendView from "./features/TrendView.jsx";
import PotsView from "./features/PotsView.jsx";
import GoalsView from "./features/GoalsView.jsx";
import FixedCostsView from "./features/FixedCostsView.jsx";
import NavDrawer from "./features/NavDrawer.jsx";
import EntryFormDialog from "./features/EntryFormDialog.jsx";
import EditEntryDialog from "./features/EditEntryDialog.jsx";

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
const VIEW_TITLES = { book: "Dashboard", trend: "Trend", pots: "Töpfe", goals: "Sparziele", fixed: "Fixkosten" };

export default function HaushaltsbuchApp() {
  const toast = useToast();
  const { confirm } = useConfirm();

  // UI state
  const [view, setView] = useState("book");
  const [navOpen, setNavOpen] = useState(false);
  const [navAnchor, setNavAnchor] = useState(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAllPots, setShowAllPots] = useState(false);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookName, setNewBookName] = useState("Neues Haushaltsbuch");
  const [renameBookOpen, setRenameBookOpen] = useState(false);

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
  const { darkMode, setDarkMode, monthFilter, setMonthFilter, updateReady, setUpdateReady } = appSettings;

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

  // Restores a full backup: orchestrates multiple hooks
  function restoreAll(restored) {
    setBooks(restored.books);
    setActiveBookId(restored.activeBookId);
    setMonthFilter(restored.monthFilter);

    const nextBook =
      restored.books.find((b) => b.id === restored.activeBookId) || restored.books[0];
    const nextCatNames = getCategoryNames(nextBook?.categories || []);
    if (!nextCatNames.includes(entryActions.addDraft.category)) {
      const fallback = nextCatNames.includes("Allgemein") ? "Allgemein" : nextCatNames[0];
      entryActions.setAddField("category", fallback || "Allgemein");
    }
  }

  function handleCreateBook() {
    createBook(newBookName);
    entryActions.setAddField("category", "Allgemein");
    setNewBookOpen(false);
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
  const themeTooltip = darkMode ? "Zu Light Mode wechseln" : "Zu Dark Mode wechseln";
  const viewLabel = VIEW_LABELS[view];

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

        {/* Mobile-only kompakte Toolbar (< 768px) */}
        <div className="hb-mobile-toolbar">
          <button className="hb-icon-btn" type="button" title="Menü" aria-label="Menü" onClick={openNav}>
            <IconMenu />
          </button>
          <div className="hb-mobile-toolbar-title">{VIEW_TITLES[view] || "Dashboard"}</div>
          <button
            className="hb-icon-btn"
            type="button"
            title="Einstellungen"
            onClick={() => setSettingsOpen(true)}
            aria-label="Einstellungen"
          >
            <IconSettings />
          </button>
        </div>

        <div className="hb-top hb-desktop-toolbar">
          <div className="hb-row">
            <div className="hb-title-row">
              <button
                className="hb-icon-btn hb-hamburger-btn"
                type="button"
                title="Menü"
                aria-label="Menü"
                onClick={openNav}
              >
                <IconMenu />
              </button>
              <div>
                <h1 className="hb-title">{VIEW_TITLES[view] || "Dashboard"}</h1>
              </div>
            </div>

            <div className="hb-group">
              <label className="hb-muted" htmlFor="hb-book-select">Buch</label>
              <select
                id="hb-book-select"
                className="hb-input"
                value={activeBook?.id || ""}
                onChange={(e) => setActiveBookId(e.target.value)}
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              {view === "book" && (
                <Button variant="outline" onClick={() => setNewBookOpen(true)}>Neues Buch</Button>
              )}

              <OverflowMenu
                label="Buchaktionen"
                items={[
                  { label: "Umbenennen", onClick: () => setRenameBookOpen(true) },
                  { label: "Löschen", onClick: deleteActiveBook, disabled: books.length <= 1, danger: true },
                ]}
              />

              <div className="hb-divider" />

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label className="hb-muted" htmlFor="hb-month-input">Monat</label>
                {isViewWithoutMonth ? <span className="hb-badge">nur Buch</span> : null}
              </div>
              <div className="hb-month-filter">
                <input
                  id="hb-month-input"
                  className="hb-input"
                  type="month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  disabled={isViewWithoutMonth}
                  title={isViewWithoutMonth ? "Der Monatsfilter gilt nur in der Buch-Ansicht." : undefined}
                />
                <button
                  type="button"
                  className="hb-month-filter-clear"
                  onClick={() => setMonthFilter("")}
                  disabled={isViewWithoutMonth || !monthFilter}
                  aria-label="Monatsfilter zurücksetzen"
                  title="Alle Monate anzeigen"
                >
                  <IconClose />
                </button>
              </div>

              <button
                className="hb-icon-btn hb-gear-btn"
                type="button"
                title={themeTooltip}
                onClick={() => setDarkMode(!darkMode)}
                aria-label={themeTooltip}
              >
                {darkMode ? <IconSun /> : <IconMoon />}
              </button>

              <button
                className="hb-icon-btn hb-gear-btn"
                type="button"
                title="Einstellungen"
                onClick={() => setSettingsOpen(true)}
                aria-label="Einstellungen"
              >
                <IconSettings />
              </button>
            </div>
          </div>
        </div>

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
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <Button onClick={() => entryActions.setAddEntryOpen(true)}>Buchung hinzufügen</Button>
              <Button variant="outline" onClick={() => setCategoryManagerOpen(true)}>
                Kategorien bearbeiten
              </Button>
            </div>

            <EntryFormDialog
              open={entryActions.addEntryOpen}
              onClose={entryActions.closeAddEntry}
              onSave={entryActions.handleAddEntry}
              canSave={entryActions.canAddEntry}
              draft={entryActions.addDraft}
              setField={entryActions.setAddField}
              pots={activeBook?.pots || []}
              expenseCategories={activeBook?.expenseCategories || DEFAULT_EXPENSE_CATEGORIES}
              incomeCategories={activeBook?.incomeCategories || DEFAULT_INCOME_CATEGORIES}
              transferCategories={indicateTransferCategories}
              availableWithdrawalCategories={entryActions.availableWithdrawalCategories}
              onOpenCategoryManager={() => {
                entryActions.setAddEntryOpen(false);
                setCategoryManagerOpen(true);
              }}
            />

            <div className="hb-stat-tiles">
              <div className="hb-stat-tile">
                <div className="hb-stat-tile-label">Einnahmen</div>
                <div className="hb-stat-tile-value hb-ok">+{fmt(totalIncome)}</div>
              </div>
              <div className="hb-stat-tile">
                <div className="hb-stat-tile-label">Ausgaben</div>
                <div className="hb-stat-tile-value hb-bad">-{fmt(totalExpense)}</div>
              </div>
              <div className="hb-stat-tile">
                <div className="hb-stat-tile-label">Transfers</div>
                <div className="hb-stat-tile-value hb-transfer">→{fmt(totalTransfers)}</div>
              </div>
              <div className="hb-stat-tile">
                <div className="hb-stat-tile-label">Saldo</div>
                <div className={`hb-stat-tile-value ${balance >= 0 ? "hb-ok" : "hb-bad"}`}>
                  {fmt(balance)}
                </div>
              </div>
            </div>

            <Card style={{ marginBottom: 16 }}>
              <CardContent>
                <div className="hb-row" style={{ marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Topf-Stände</h3>
                  {potBalances.length > 8 && (
                    <button
                      type="button"
                      className="hb-link-btn"
                      onClick={() => setShowAllPots((v) => !v)}
                    >
                      {showAllPots ? "Weniger anzeigen" : `Alle ${potBalances.length} anzeigen`}
                    </button>
                  )}
                </div>
                <div className="hb-pot-tiles">
                  {(showAllPots ? potBalances : potBalances.slice(0, 8)).map((pot) => (
                    <div key={pot.id} className="hb-pot-tile">
                      <div className="hb-stat-title">{pot.name}</div>
                      <div className={`hb-stat-val ${pot.balance >= 0 ? "hb-ok" : "hb-bad"}`}>
                        {fmt(pot.balance)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="hb-analysis-grid">
              <Charts
                expenseByHierarchy={expenseByHierarchy}
                incomeByHierarchy={incomeByHierarchy}
                baseCurrency={baseCurrency}
              />
              <InsightsPanel
                expenseByHierarchy={expenseByHierarchy}
                filteredEntries={filteredEntries}
                monthFilter={monthFilter}
                entries={entries}
                monthStartDay={monthStartDay}
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                expenseCategories={activeBook?.expenseCategories || []}
              />
            </div>

            <EntriesTable
              entriesSorted={entriesSorted}
              monthLabel={monthLabel}
              monthFilter={monthFilter}
              startEdit={entryActions.startEdit}
              removeEntry={entryActions.removeEntry}
              onAddEntry={() => entryActions.setAddEntryOpen(true)}
            />
          </>
        )}

        {/* EditDialog für Eintrag bearbeiten — global, verfügbar in allen Views */}
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

        <EditDialog
          open={newBookOpen}
          title="Neues Haushaltsbuch"
          onClose={() => setNewBookOpen(false)}
          onSave={handleCreateBook}
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
            />
            <div className="hb-muted" style={{ marginTop: 8 }}>
              Du kannst mehrere Bücher führen und oben wechseln.
            </div>
          </div>
        </EditDialog>

        <RenameDialog
          open={renameBookOpen}
          title="Buch umbenennen"
          label="Neuer Name"
          initialValue={activeBook?.name || ""}
          onClose={() => setRenameBookOpen(false)}
          onSave={(name) => {
            applyRenameActiveBook(name);
            setRenameBookOpen(false);
          }}
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
        />

        <CategoryManagerDialog
          open={categoryManagerOpen}
          onClose={() => setCategoryManagerOpen(false)}
          expenseCategories={activeBook?.expenseCategories || []}
          incomeCategories={activeBook?.incomeCategories || []}
          transferCategories={indicateTransferCategories}
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
      </div>
    </div>
    </CurrencyContext.Provider>
  );
}
