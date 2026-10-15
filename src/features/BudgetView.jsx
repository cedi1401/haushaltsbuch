import React, { useMemo, useState } from "react";
import { Button, Card, CardContent } from "../components/ui.jsx";
import DataTable from "../components/DataTable.jsx";
import { IconBudget, IconEdit, IconInfo, IconPlus } from "../components/icons.jsx";
import { useToast } from "../components/toastContext.js";
import { formatPercent } from "../utils/hbUtils.js";
import { buildBudgetRows, setCategoryBudgets } from "../utils/budgetUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { buildBudgetColumns, budgetMoney } from "./budget/budgetColumns.jsx";
import BudgetEditDialog from "./budget/BudgetEditDialog.jsx";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const percent = (ratio) => formatPercent(ratio * 100, { digits: 0, sign: false });

/**
 * Budget-View — welche Kategorie hat ein Budget, welche nicht, und wie viel
 * davon ist im laufenden Finanzmonat verbraucht?
 *
 * Der View ist bewusst schmal: kein Verlauf, keine Vorschlagswerte, keine
 * Prognose. Er zeigt immer den laufenden Finanzmonat, unabhängig vom
 * Monatsfilter der Toolbar.
 *
 * Budgets werden nur hier gepflegt: über die Zeilenaktionen und den
 * Bearbeiten-Dialog. Der Kategorien-Dialog zeigt sie bloß an.
 */
export default function BudgetView({
  entries,
  expenseCategories,
  monthStartDay = 1,
  onUpdateExpenseCategories,
  onOpenCategoryManager,
}) {
  const fmt = useFmt();
  const toast = useToast();
  const money = useMemo(() => (value) => budgetMoney(fmt, value), [fmt]);

  const model = useMemo(
    () => buildBudgetRows({ entries, expenseCategories, monthStartDay }),
    [entries, expenseCategories, monthStartDay]
  );
  const { budgeted, unbudgeted, totals, unbudgetedSpent, monthInfo } = model;

  // Bearbeitet wird immer die Oberkategorie samt ihrer Aufteilung. Über
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

  // Aktionen am Zeilenende — DataTable blendet sie beim Überfahren ein.
  // Unkategorisierte Ausgaben haben keine Kategorie, an der ein Budget hängen könnte.
  function renderRowActions(row) {
    if (!row.categoryId) return null;
    const isNew = row.isParent && row.budget == null;
    const title = isNew ? "Budget festlegen" : "Budget bearbeiten";
    const target = row.parentName || row.name;
    return (
      <button
        type="button"
        className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
        onClick={() => setEditCategoryId(row.categoryId)}
        title={title}
        aria-label={`${title}: „${target}“`}
      >
        {isNew ? <IconPlus /> : <IconEdit />}
      </button>
    );
  }

  const columns = useMemo(() => buildBudgetColumns({ fmt }), [fmt]);

  const sections = useMemo(() => {
    const result = [];
    if (budgeted.length > 0) {
      // Übergang bis zum Karten-Layout: Unterkategorien mit eigenem Budget
      // stehen als Zeilen direkt unter ihrer Oberkategorie.
      const rows = budgeted.flatMap((row) => [row, ...row.subs.filter((sub) => sub.budget != null)]);
      result.push({
        key: "budgeted",
        label: "Mit Budget",
        // Ohne Farbe: die Kante hieße hier nichts, und der Punkt im Band läse
        // sich über der Spalte der Kategoriepunkte wie eine blaue Kategorie.
        accent: null,
        rows,
        countLabel: () => plural(budgeted.length, "Budget", "Budgets"),
        total: `${money(totals.spent)} von ${money(totals.budget)}`,
      });
    }
    if (unbudgeted.length > 0) {
      result.push({
        key: "unbudgeted",
        label: "Ohne Budget",
        accent: null,
        rows: unbudgeted,
        countLabel: (n) => plural(n, "Kategorie", "Kategorien"),
        total: money(unbudgetedSpent),
      });
    }
    return result;
  }, [budgeted, unbudgeted, totals, unbudgetedSpent, money]);

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

  let budgetSub = plural(budgeted.length, "Budget", "Budgets");
  if (totals.overCount > 0) budgetSub += ` · ${totals.overCount} überschritten`;

  const spentSub = hasBudgets ? `${percent(totals.pct)} des Budgets` : "kein Budget festgelegt";

  let remainingSub = "kein Budget festgelegt";
  if (hasBudgets && monthInfo) {
    remainingSub =
      monthInfo.daysRemaining === 0
        ? "letzter Tag des Monats"
        : `noch ${plural(monthInfo.daysRemaining, "Tag", "Tage")}`;
  }

  const spentTone = !hasBudgets
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
          label="Verbraucht"
          value={hasBudgets ? money(totals.spent) : "—"}
          sub={spentSub}
        />
        <StatPill
          label="Verbleibend"
          value={hasBudgets ? money(totals.remaining) : "—"}
          sub={remainingSub}
        />
      </div>

      {!hasBudgets && (
        <div className="hb-infobar" role="status">
          <div className="hb-infobar-icon"><IconInfo /></div>
          <div className="hb-infobar-content">
            <div className="hb-infobar-title">Noch kein Budget festgelegt</div>
            <div className="hb-infobar-message">
              In der Tabelle stehen alle Ausgaben-Kategorien. Fahre über eine Zeile und lege
              mit dem Plus ein Budget fest.
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
            renderRowActions={renderRowActions}
          />
        </CardContent>
      </Card>

      {editCategory && (
        <BudgetEditDialog
          key={editCategory.id}
          category={editCategory}
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
