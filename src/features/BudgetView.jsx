import React, { useMemo } from "react";
import { Card, CardContent } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import { IconBudget, IconInfo } from "../components/icons.jsx";
import { formatPercent } from "../utils/hbUtils.js";
import { buildBudgetRows } from "../utils/budgetUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { buildBudgetColumns, budgetMoney } from "./budget/budgetColumns.jsx";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const percent = (ratio) => formatPercent(ratio * 100, { digits: 0, sign: false });

/**
 * Budget-View — was darf je Kategorie passieren, und wird es eingehalten?
 *
 * Abgrenzung zum Dashboard: dort steht das Budget nur als Ampel, hier als
 * Planungstabelle mit allen Ausgaben-Kategorien, auch denen ohne Budget.
 * Gemessen wird immer am heutigen Budget — einen Verlauf der Budgets selbst
 * gibt es nicht, vergangene Monate sind deshalb ein Realitätscheck und keine
 * Historie.
 *
 * Dieser Stand ist nur lesend: gepflegt werden Budgets im Kategorien-Dialog.
 */
export default function BudgetView({
  entries,
  expenseCategories,
  recurringExpenses,
  monthFilter,
  monthStartDay = 1,
}) {
  const fmt = useFmt();
  const money = useMemo(() => (value) => budgetMoney(fmt, value), [fmt]);

  const model = useMemo(
    () => buildBudgetRows({ entries, expenseCategories, recurringExpenses, monthFilter, monthStartDay }),
    [entries, expenseCategories, recurringExpenses, monthFilter, monthStartDay]
  );
  const { budgeted, unbudgeted, totals, unbudgetedSpent, monthInfo, isAverage } = model;

  const isCurrent = Boolean(monthInfo?.isCurrentMonth);
  const isFuture = Boolean(monthInfo?.isFutureMonth);
  // Im zukünftigen Monat gibt es nur das Soll — ein Ist von 0 läse sich dort
  // wie ein eingehaltenes Budget.
  const showActual = !isFuture;

  const columns = useMemo(
    () => buildBudgetColumns({ fmt, isAverage, showActual }),
    [fmt, isAverage, showActual]
  );

  const sections = useMemo(() => {
    const result = [];
    if (budgeted.length > 0) {
      result.push({
        key: "budgeted",
        label: "Mit Budget",
        // Ohne Farbe: die Kante hieße hier nichts, und der Punkt im Band läse
        // sich über der Spalte der Kategoriepunkte wie eine blaue Kategorie.
        accent: null,
        rows: budgeted,
        countLabel: (n) => plural(n, "Budget", "Budgets"),
        total: showActual
          ? `${isAverage ? "Ø " : ""}${money(totals.spent)} von ${money(totals.budget)}`
          : money(totals.budget),
      });
    }
    if (unbudgeted.length > 0) {
      result.push({
        key: "unbudgeted",
        label: "Ohne Budget",
        accent: null,
        rows: unbudgeted,
        countLabel: (n) => plural(n, "Kategorie", "Kategorien"),
        total: showActual ? `${isAverage ? "Ø " : ""}${money(unbudgetedSpent)}` : null,
      });
    }
    return result;
  }, [budgeted, unbudgeted, totals, unbudgetedSpent, showActual, isAverage, money]);

  if (budgeted.length === 0 && unbudgeted.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="hb-empty">
            <div className="hb-empty-icon"><IconBudget /></div>
            <div className="hb-empty-title">Noch keine Ausgaben-Kategorien</div>
            <div className="hb-empty-text">
              Budgets hängen an Ausgaben-Kategorien. Lege im Kategorien-Dialog auf dem
              Dashboard eine Kategorie an und gib ihr ein Budget.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasBudgets = budgeted.length > 0;
  const totalSpent = totals.spent + unbudgetedSpent;
  const unbudgetedShare = totalSpent > 0 ? unbudgetedSpent / totalSpent : null;
  const pending = "Monat hat noch nicht begonnen";

  let budgetSub = plural(budgeted.length, "Budget", "Budgets");
  if (showActual && totals.overCount > 0) budgetSub += ` · ${totals.overCount} überschritten`;

  // Vergangene Monate und der Ø messen am heutigen Budget, nicht an dem von
  // damals — das steht dort, wo gemessen wird.
  let spentSub = pending;
  if (showActual) {
    if (!hasBudgets) spentSub = "kein Budget festgelegt";
    else if (isCurrent) {
      spentSub =
        `${percent(totals.pct)} des Budgets` +
        ` · Monat zu ${percent(monthInfo.daysElapsed / monthInfo.daysInMonth)} um`;
    } else spentSub = `${percent(totals.pct)} des heutigen Budgets`;
  }

  let remainingSub = pending;
  if (showActual) {
    if (!hasBudgets) remainingSub = "kein Budget festgelegt";
    else if (isCurrent && totals.paceDelta != null) {
      const pace = Math.round(totals.paceDelta);
      remainingSub =
        pace === 0
          ? "genau im Zeitplan"
          : pace > 0
            ? `${money(pace)} über Zeitplan`
            : `${money(-pace)} unter Zeitplan`;
    } else {
      remainingSub =
        totals.overCount > 0
          ? `${plural(totals.overCount, "Budget", "Budgets")} überschritten`
          : "kein Budget überschritten";
    }
    if (isCurrent && hasBudgets) {
      remainingSub +=
        monthInfo.daysRemaining === 0
          ? " · letzter Tag"
          : ` · noch ${plural(monthInfo.daysRemaining, "Tag", "Tage")}`;
    }
  }

  const spentTone = !showActual || !hasBudgets
    ? ""
    : totals.status === "over"
      ? " hb-stat-pill--bad"
      : totals.status === "ok"
        ? " hb-stat-pill--ok"
        : "";

  return (
    <>
      <div className="hb-stat-pills">
        <StatPill
          tone=" hb-stat-pill--accent"
          label="Budgetiert"
          value={hasBudgets ? money(totals.budget) : "—"}
          sub={budgetSub}
        />
        <StatPill
          tone={spentTone}
          label={isAverage ? "Verbraucht Ø/Monat" : "Verbraucht"}
          value={showActual && hasBudgets ? money(totals.spent) : "—"}
          sub={spentSub}
        />
        <StatPill
          label="Verbleibend"
          value={showActual && hasBudgets ? money(totals.remaining) : "—"}
          sub={remainingSub}
        />
        <StatPill
          label={isAverage ? "Ohne Budget Ø/Monat" : "Ohne Budget"}
          value={showActual ? money(unbudgetedSpent) : "—"}
          sub={
            !showActual
              ? pending
              : unbudgetedShare == null
                ? plural(unbudgeted.length, "Kategorie", "Kategorien")
                : `${percent(unbudgetedShare)} der Ausgaben`
          }
        />
      </div>

      {isAverage && hasBudgets && (
        <div className="hb-infobar" role="status">
          <div className="hb-infobar-icon"><IconInfo /></div>
          <div className="hb-infobar-content">
            <div className="hb-infobar-title">Alle Monate: Durchschnitt statt Summe</div>
            <div className="hb-infobar-message">
              Die Spalte „Ø Ist“ zeigt, was du im Durchschnitt pro abgeschlossenem Monat
              ausgegeben hast, gemessen am heutigen Budget. Zeitvergleich und Prognose gibt
              es nur für einen einzelnen Monat.
            </div>
          </div>
        </div>
      )}

      {!hasBudgets && (
        <div className="hb-infobar" role="status">
          <div className="hb-infobar-icon"><IconInfo /></div>
          <div className="hb-infobar-content">
            <div className="hb-infobar-title">Noch kein Budget festgelegt</div>
            <div className="hb-infobar-message">
              Öffne auf dem Dashboard den Kategorien-Dialog und lege ein Budget für eine
              Ausgaben-Kategorie fest. Der Durchschnitt der letzten Monate in der Tabelle
              hilft bei der Höhe.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent>
          <DataTable
            columns={columns}
            sections={sections}
            storageKey="hb.budget.table"
            label="Budgets"
            toolbar={<h3 className="hb-card-title">Kategorien</h3>}
          />
        </CardContent>
      </Card>
    </>
  );
}

function StatPill({ tone = "", label, value, sub }) {
  return (
    <div className={"hb-stat-pill" + tone}>
      <div className="hb-stat-pill-top">
        <span className="hb-stat-pill-label">{label}</span>
      </div>
      <span className="hb-stat-pill-value">{value}</span>
      <span className="hb-stat-pill-sub">{sub}</span>
    </div>
  );
}
