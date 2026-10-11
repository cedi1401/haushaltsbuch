import React, { useCallback, useMemo, useState } from "react";
import { Button, Card, CardContent } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import { IconBudget, IconEdit, IconInfo, IconPlus } from "../components/icons.jsx";
import { useToast } from "../components/toastContext.js";
import { formatPercent } from "../utils/hbUtils.js";
import { buildBudgetHistory, buildBudgetRows, calcBudgetSuggestions, setCategoryBudgets } from "../utils/budgetUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { buildBudgetColumns, budgetMoney } from "./budget/budgetColumns.jsx";
import BudgetEditDialog from "./budget/BudgetEditDialog.jsx";
import BudgetDetail from "./budget/BudgetDetail.jsx";
import BudgetHistoryCard from "./budget/BudgetHistoryCard.jsx";

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
 * Budgets werden nur hier gepflegt: über die Zeilenaktionen und den
 * Bearbeiten-Dialog. Der Kategorien-Dialog zeigt sie bloß an.
 *
 * Jede Zeile klappt auf (`BudgetDetail`): Kennzahlen, Verlauf der Kategorie
 * und die Buchungen des Monats.
 */
export default function BudgetView({
  entries,
  expenseCategories,
  recurringExpenses,
  monthFilter,
  monthStartDay = 1,
  onUpdateExpenseCategories,
  onOpenCategoryManager,
}) {
  const fmt = useFmt();
  const toast = useToast();
  const money = useMemo(() => (value) => budgetMoney(fmt, value), [fmt]);

  const model = useMemo(
    () => buildBudgetRows({ entries, expenseCategories, recurringExpenses, monthFilter, monthStartDay }),
    [entries, expenseCategories, recurringExpenses, monthFilter, monthStartDay]
  );
  const { budgeted, unbudgeted, totals, unbudgetedSpent, monthInfo, isAverage, firstMonth, currentMonth } = model;

  // Verlauf über alle budgetierten Zeilen — unabhängig vom Monatsfilter.
  const history = useMemo(
    () => buildBudgetHistory(budgeted.map((row) => row.monthly), firstMonth, currentMonth),
    [budgeted, firstMonth, currentMonth]
  );

  const renderDetail = useCallback(
    (row, hiddenColumns) => (
      <BudgetDetail
        row={row}
        hiddenColumns={hiddenColumns}
        fmt={fmt}
        entries={entries}
        expenseCategories={expenseCategories}
        monthFilter={monthFilter}
        monthStartDay={monthStartDay}
        monthInfo={monthInfo}
        firstMonth={firstMonth}
        currentMonth={currentMonth}
      />
    ),
    [fmt, entries, expenseCategories, monthFilter, monthStartDay, monthInfo, firstMonth, currentMonth]
  );

  // Vorschlagswerte beider Ebenen für den Dialog — die Zeilen kennen nur ihre eigene.
  const suggestions = useMemo(
    () => calcBudgetSuggestions({ entries, expenseCategories, monthStartDay }),
    [entries, expenseCategories, monthStartDay]
  );

  // Bearbeitet wird immer die Oberkategorie; die Ebene wählt der Dialog. Über
  // die ID statt das Objekt, damit eine inzwischen gelöschte Kategorie den
  // Dialog schließt statt ihn mit veralteten Daten offen zu halten.
  const [editCategoryId, setEditCategoryId] = useState(null);
  const editCategory = editCategoryId
    ? (expenseCategories || []).find((c) => c.id === editCategoryId) || null
    : null;

  function saveBudget(change) {
    onUpdateExpenseCategories(setCategoryBudgets(expenseCategories, editCategory.id, change));
    toast.success(`Budget für „${editCategory.name}“ gespeichert.`);
    setEditCategoryId(null);
  }

  function removeBudget() {
    onUpdateExpenseCategories(setCategoryBudgets(expenseCategories, editCategory.id));
    toast.success(`Budget für „${editCategory.name}“ entfernt.`);
    setEditCategoryId(null);
  }

  // „Ø übernehmen“: der Durchschnitt der letzten sechs Monate wird ohne Umweg
  // über den Dialog zum Budget der ganzen Kategorie.
  function adoptAverage(row) {
    const budget = Math.round(row.avg6);
    onUpdateExpenseCategories(setCategoryBudgets(expenseCategories, row.categoryId, { budget }));
    toast.success(`Budget für „${row.name}“ auf ${money(budget)} festgelegt.`);
  }

  // Aktionen am Zeilenende — DataTable blendet sie beim Überfahren ein.
  // Unkategorisierte Ausgaben haben keine Kategorie, an der ein Budget hängen könnte.
  function renderRowActions(row) {
    if (!row.categoryId) return null;
    const isNew = row.budget == null && !row.isRemainder;
    const title = isNew ? "Budget festlegen" : "Budget bearbeiten";
    const target = row.parentName || row.name;
    // Der Betrag steht im Button: die Leiste verdeckt die Spalte, aus der er stammt.
    const average = Math.round(row.avg6 || 0);
    return (
      <>
        {isNew && average > 0 && (
          <button
            type="button"
            className="hb-btn hb-btn-outline hb-btn-sm"
            onClick={() => adoptAverage(row)}
            aria-label={`Durchschnitt ${money(average)} als Budget für „${row.name}“ übernehmen`}
          >
            Ø {money(average)} übernehmen
          </button>
        )}
        <button
          type="button"
          className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
          onClick={() => setEditCategoryId(row.categoryId)}
          title={title}
          aria-label={`${title}: „${target}“`}
        >
          {isNew ? <IconPlus /> : <IconEdit />}
        </button>
      </>
    );
  }

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
              Budgets hängen an Ausgaben-Kategorien. Lege zuerst eine Kategorie an, danach
              kannst du ihr hier ein Budget geben.
            </div>
            <Button onClick={onOpenCategoryManager}>Kategorien bearbeiten</Button>
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
      <div className="hb-view-actions">
        <Button variant="outline" onClick={onOpenCategoryManager}>
          Kategorien bearbeiten
        </Button>
      </div>

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
              In der Tabelle stehen alle Ausgaben-Kategorien mit ihrem Durchschnitt der letzten
              Monate. Fahre über eine Zeile und wähle „Ø … übernehmen“ oder lege mit dem Plus
              einen eigenen Betrag fest.
            </div>
          </div>
        </div>
      )}

      {hasBudgets && <BudgetHistoryCard series={history} budget={totals.budget} />}

      <Card>
        <CardContent>
          <DataTable
            columns={columns}
            sections={sections}
            storageKey="hb.budget.table"
            label="Budgets"
            toolbar={<h3 className="hb-card-title">Kategorien</h3>}
            renderDetail={renderDetail}
            renderRowActions={renderRowActions}
          />
        </CardContent>
      </Card>

      {editCategory && (
        <BudgetEditDialog
          key={editCategory.id}
          category={editCategory}
          suggestions={suggestions}
          onSave={saveBudget}
          onRemove={removeBudget}
          onClose={() => setEditCategoryId(null)}
        />
      )}
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
