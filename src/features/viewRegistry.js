import { lazy } from "react";

import {
  IconBook,
  IconBudget,
  IconPots,
  IconSavings,
  IconFixed,
  IconTrend,
  IconCostGroups,
  IconInvest,
} from "../components/icons.jsx";

import DashboardView from "./DashboardView.jsx";
import BudgetView from "./BudgetView.jsx";
import PotsView from "./PotsView.jsx";
import FixedCostsView from "./FixedCostsView.jsx";
import SavingsView from "./SavingsView.jsx";
import TrendView from "./TrendView.jsx";
import CostGroupsView from "./CostGroupsView.jsx";

// Investment-View (eingefroren) und Marktdaten-Testbench: nur im Dev-Modus geladen.
// Der dynamische Import steht in einem Zweig, den der Production-Build als toten
// Code entfernt — so bleiben beide aus dem Release.
const InvestmentsView = import.meta.env.DEV
  ? lazy(() => import("./InvestmentsView.jsx"))
  : null;
const MarketDebugView = import.meta.env.DEV
  ? lazy(() => import("./MarketDebugView.jsx"))
  : null;

export const DEFAULT_VIEW_ID = "book";

/** Gruppen der Navigationsleiste, in dieser Reihenfolge. */
export const VIEW_GROUPS = [
  { id: "daily", label: "Alltag" },
  { id: "planning", label: "Planung" },
  { id: "analysis", label: "Analyse" },
  ...(import.meta.env.DEV ? [{ id: "dev", label: "Entwicklung" }] : []),
];

/**
 * Alle Ansichten der App. Eine neue View braucht nur einen Eintrag hier.
 *
 * - `group`: Gruppe in der Navigationsleiste (siehe VIEW_GROUPS)
 * - `usesMonth`: true, wenn die View den Monatsfilter der Toolbar auswertet;
 *   sonst blendet die Toolbar ihn aus. Töpfe gehört dazu, weil ihre
 *   Buchungsliste nach Monat filtert.
 * - `getProps(ctx)`: baut die Props aus dem Kontext, den HaushaltsbuchApp
 *   zusammenstellt (Buch, abgeleitete Werte, Aktionen, Navigation).
 */
export const VIEWS = [
  {
    id: "book",
    label: "Dashboard",
    Icon: IconBook,
    group: "daily",
    usesMonth: true,
    Component: DashboardView,
    getProps: (ctx) => ({
      activeBook: ctx.activeBook,
      filteredEntries: ctx.filteredEntries,
      totalIncome: ctx.totalIncome,
      totalExpense: ctx.totalExpense,
      totalTransfers: ctx.totalTransfers,
      totalSavingsTransfers: ctx.totalSavingsTransfers,
      totalReserveTransfers: ctx.totalReserveTransfers,
      balance: ctx.balance,
      potBalances: ctx.potBalances,
      expenseByHierarchy: ctx.expenseByHierarchy,
      incomeByHierarchy: ctx.incomeByHierarchy,
      monthFilter: ctx.monthFilter,
      monthLabel: ctx.monthLabel,
      monthStartDay: ctx.monthStartDay,
      entriesSorted: ctx.entriesSorted,
      entryActions: ctx.entryActions,
      onUpdateBook: ctx.updateBook,
      patchActiveBook: ctx.patchActiveBook,
      indicateTransferCategories: ctx.indicateTransferCategories,
      onOpenCategoryManager: ctx.openCategoryManager,
      onNavigateToBudget: () => ctx.navigate("budget"),
    }),
  },
  {
    id: "budget",
    label: "Budgets",
    Icon: IconBudget,
    group: "daily",
    usesMonth: false,
    Component: BudgetView,
    getProps: (ctx) => ({
      entries: ctx.entries,
      expenseCategories: ctx.expenseCategories,
      monthStartDay: ctx.monthStartDay,
      onUpdateExpenseCategories: (newCats) =>
        ctx.patchActiveBook((b) => ({ ...b, expenseCategories: newCats })),
      onOpenCategoryManager: ctx.openCategoryManager,
    }),
  },
  {
    id: "pots",
    label: "Töpfe",
    Icon: IconPots,
    group: "daily",
    usesMonth: true,
    Component: PotsView,
    getProps: (ctx) => ({
      activeBook: ctx.activeBook,
      selectedPotId: ctx.selectedPotId,
      onSelectPot: ctx.setSelectedPotId,
      entries: ctx.entries,
      onAddTransferEntry: ctx.entryActions.addTransferEntry,
      onUpdateBook: ctx.updateBook,
      transferCategories: ctx.indicateTransferCategories,
      onEditEntry: ctx.entryActions.startEdit,
      onRemoveEntry: ctx.entryActions.removeEntry,
      monthStartDay: ctx.monthStartDay,
      monthFilter: ctx.monthFilter,
      monthLabel: ctx.monthLabel,
    }),
  },
  {
    id: "fixed",
    label: "Fixkosten",
    Icon: IconFixed,
    group: "planning",
    usesMonth: false,
    Component: FixedCostsView,
    getProps: (ctx) => ({
      activeBook: ctx.activeBook,
      entries: ctx.entries,
      monthStartDay: ctx.monthStartDay,
      onUpdateBook: ctx.updateBook,
      onAddEntry: ctx.entryActions.addTransferEntry,
      onAddEntries: ctx.entryActions.addEntries,
    }),
  },
  {
    id: "savings",
    label: "Rücklagen",
    Icon: IconSavings,
    group: "planning",
    usesMonth: false,
    Component: SavingsView,
    getProps: (ctx) => ({
      activeBook: ctx.activeBook,
      entries: ctx.entries,
      monthStartDay: ctx.monthStartDay,
      onUpdateBook: ctx.updateBook,
      onAddEntry: ctx.entryActions.addTransferEntry,
      onAddEntries: ctx.entryActions.addEntries,
      onNavigateToPots: () => ctx.navigate("pots"),
    }),
  },
  {
    id: "trend",
    label: "Trend",
    Icon: IconTrend,
    group: "analysis",
    usesMonth: false,
    Component: TrendView,
    getProps: (ctx) => ({
      entries: ctx.entries,
      // Ausgaben-Positionen plus Zwecke mit Rate (Schema 7)
      recurringExpenses: ctx.fixedCostItems,
      expenseCategories: ctx.activeBook?.expenseCategories || [],
      monthStartDay: ctx.monthStartDay,
      pots: ctx.activeBook?.pots || [],
      transferCategories: ctx.allTransferCategories,
    }),
  },
  {
    id: "costgroups",
    label: "Kostenrechner",
    Icon: IconCostGroups,
    group: "analysis",
    usesMonth: false,
    Component: CostGroupsView,
    getProps: (ctx) => ({
      activeBook: ctx.activeBook,
      onUpdateBook: ctx.updateBook,
      monthStartDay: ctx.monthStartDay,
      customRange: ctx.costGroupRange,
      onCustomRangeChange: ctx.setCostGroupRange,
    }),
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: "investments",
          label: "Investments",
          Icon: IconInvest,
          group: "dev",
          usesMonth: false,
          Component: InvestmentsView,
          getProps: (ctx) => ({
            activeBook: ctx.activeBook,
            onUpdateBook: ctx.updateBook,
          }),
        },
        {
          id: "marketdebug",
          label: "Marktdaten (Debug)",
          Icon: IconTrend,
          group: "dev",
          usesMonth: false,
          Component: MarketDebugView,
          getProps: (ctx) => ({ baseCurrency: ctx.baseCurrency }),
        },
      ]
    : []),
];

const VIEWS_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v]));

/** Liefert die View zur ID; unbekannte IDs fallen aufs Dashboard zurück. */
export function getView(id) {
  return VIEWS_BY_ID[id] || VIEWS_BY_ID[DEFAULT_VIEW_ID];
}
