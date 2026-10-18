import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, CardContent } from "../components/ui.jsx";
import { IconBudget, IconChevron, IconEdit, IconInfo, IconPlus } from "../components/icons.jsx";
import { useUndo } from "../contexts/UndoContext.js";
import { formatPercent } from "../utils/formatUtils.js";
import { BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL, buildBudgetRows, setCategoryBudgets } from "../utils/budgetUtils.js";
import { useFmt } from "../contexts/CurrencyContext.jsx";
import { budgetMoney } from "./budget/budgetFormat.js";
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
 * Layout: eine Karte je budgetierter Oberkategorie (Muster der Topf-Karten),
 * ihre Unterkategorien stehen in der Karte. Darunter die Kategorien ohne
 * Budget als kleine Karten mit Plus.
 *
 * Budgets werden nur hier gepflegt: über die Karten, die Liste und den
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
  const undo = useUndo();
  const money = useMemo(() => (value) => budgetMoney(fmt, value), [fmt]);

  const model = useMemo(
    () => buildBudgetRows({ entries, expenseCategories, monthStartDay }),
    [entries, expenseCategories, monthStartDay]
  );
  const { budgeted, unbudgeted, totals, monthInfo } = model;

  // Bearbeitet wird immer die Oberkategorie samt ihrer Aufteilung. Über
  // die ID statt das Objekt, damit eine inzwischen gelöschte Kategorie den
  // Dialog schließt statt ihn mit veralteten Daten offen zu halten.
  const [editCategoryId, setEditCategoryId] = useState(null);
  // Höchstens eine Karte ist aufgeklappt; nicht persistent.
  const [openCardId, setOpenCardId] = useState(null);
  const editCategory = editCategoryId
    ? (expenseCategories || []).find((c) => c.id === editCategoryId) || null
    : null;

  function saveBudget(change) {
    onUpdateExpenseCategories(setCategoryBudgets(expenseCategories, editCategory.id, change));
    undo.offer(`Budget für „${editCategory.name}“ gespeichert.`);
    setEditCategoryId(null);
  }

  function removeBudget() {
    onUpdateExpenseCategories(setCategoryBudgets(expenseCategories, editCategory.id));
    undo.offer(`Budget für „${editCategory.name}“ entfernt.`);
    setEditCategoryId(null);
  }

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
              Unter „Ohne Budget“ stehen alle Ausgaben-Kategorien. Lege mit dem Plus neben
              einer Kategorie ihr Budget fest.
            </div>
          </div>
        </div>
      )}

      {hasBudgets && (
        <div className={`hb-pot-grid hb-budget-grid${openCardId ? " has-open" : ""}`}>
          {budgeted.map((row) => (
            <BudgetCategoryCard
              key={row.id}
              row={row}
              money={money}
              onEdit={() => setEditCategoryId(row.categoryId)}
              isOpen={openCardId === row.id}
              onToggle={() => setOpenCardId((id) => (id === row.id ? null : row.id))}
              onClose={() => setOpenCardId(null)}
            />
          ))}
        </div>
      )}

      {unbudgeted.length > 0 && (
        <section aria-labelledby="hb-budget-free-title">
          <h3 id="hb-budget-free-title" className="hb-budget-section-title">Ohne Budget</h3>
          <ul className="hb-budget-free-grid">
            {unbudgeted.map((row) => (
              <li key={row.id} className="hb-budget-free-card">
                <span className="hb-cat-dot" style={{ background: row.color || "var(--muted)" }} />
                <span className="hb-budget-free-name" title={row.name}>{row.name}</span>
                <span className="hb-budget-free-amount">{money(row.spent)}</span>
                {/* Unkategorisierte Ausgaben haben keine Kategorie, an der ein
                    Budget hängen könnte — der Platzhalter hält die Beträge bündig. */}
                {row.categoryId ? (
                  <button
                    type="button"
                    className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
                    onClick={() => setEditCategoryId(row.categoryId)}
                    title="Budget festlegen"
                    aria-label={`Budget festlegen: „${row.name}“`}
                  >
                    <IconPlus />
                  </button>
                ) : (
                  <span className="hb-budget-free-spacer" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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

/**
 * Karte einer budgetierten Oberkategorie: Ist von Budget, Auslastung, Status
 * und — falls vorhanden — die Aufteilung: Unterkategorien mit eigenem Budget,
 * je mit eigenem Balken.
 */
function BudgetCategoryCard({ row, money, onEdit, isOpen, onToggle, onClose }) {
  const isOver = row.status === "over";
  // Nur die Aufteilung zählt: Unterkategorien ohne eigenes Budget stehen
  // nicht in der Karte, ihr Ist steckt bereits in der Summe oben.
  const subs = row.subs.filter((sub) => sub.budget != null);
  // Zugeklappt zeigt die Karte nur das Gesamtbudget; die Aufteilung steht
  // hinter dem Aufklapper. Den Status meldet allein die Pille oben rechts,
  // die Unterkategorien zeigen ihn nur über die Balkenfarbe.
  const showSubs = isOpen && subs.length > 0;

  // Aufgeklappt löst sich die Karte aus dem Raster (position: absolute) und
  // legt sich über die Karten darunter. Der Platzhalter behält dafür die
  // zugeklappte Höhe, damit die Reihe bleibt, wie sie ist.
  const slotRef = useRef(null);
  const toggleRef = useRef(null);
  const [slotHeight, setSlotHeight] = useState(null);

  function toggle() {
    if (!isOpen) setSlotHeight(slotRef.current?.offsetHeight ?? null);
    onToggle();
  }

  // Klick daneben oder Escape klappt wieder zu.
  useEffect(() => {
    if (!isOpen) return undefined;
    function onPointerDown(e) {
      if (!slotRef.current?.contains(e.target)) onClose();
    }
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      onClose();
      toggleRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={slotRef}
      className={`hb-budget-card-slot${showSubs ? " is-open" : ""}`}
      style={showSubs && slotHeight ? { height: slotHeight } : undefined}
    >
      <article className="hb-pot-card hb-budget-card" aria-label={row.name}>
        <div className="hb-pot-card-top">
          <div className="hb-pot-card-head">
            <div className="hb-pot-card-name">
              <span className="hb-cat-dot" style={{ background: row.color || "var(--muted)" }} />
              <span className="hb-budget-card-name-text" title={row.name}>{row.name}</span>
            </div>
            <div className="hb-budget-card-amounts">
              <span className="hb-pot-card-amount">{money(row.spent)}</span>
              <span className="hb-budget-card-of">von {money(row.budget)}</span>
            </div>
          </div>
          <div className="hb-budget-card-actions">
            <StatusPill status={row.status} />
            <button
              type="button"
              className="hb-icon-btn hb-icon-btn--sm hb-icon-btn--subtle"
              onClick={onEdit}
              title="Budget bearbeiten"
              aria-label={`Budget bearbeiten: „${row.name}“`}
            >
              <IconEdit />
            </button>
          </div>
        </div>

        <UsageMeter pct={row.pct} status={row.status} />

        {subs.length > 0 && (
          <button
            type="button"
            className="hb-link-btn hb-budget-subs-toggle"
            ref={toggleRef}
            onClick={toggle}
            aria-expanded={showSubs}
          >
            {showSubs ? "Unterkategorien ausblenden" : plural(subs.length, "Unterkategorie", "Unterkategorien")}
            <IconChevron className={showSubs ? "is-open" : undefined} />
          </button>
        )}

        {showSubs && (
          <div className="hb-budget-subs">
            <div className="hb-budget-subs-head">
              <span>Unterkategorien</span>
              <span>{money(row.allocated)} von {money(row.budget)} aufgeteilt</span>
            </div>
            <ul className="hb-budget-subs-list">
              {subs.map((sub) => (
                <li key={sub.id} className="hb-budget-sub">
                  <div className="hb-budget-sub-line">
                    <span className="hb-budget-sub-name" title={sub.name}>{sub.name}</span>
                    <span className="hb-budget-sub-amount">
                      {money(sub.spent)}
                      <span className="hb-budget-sub-of"> / {money(sub.budget)}</span>
                    </span>
                  </div>
                  <span
                    className="hb-meter hb-meter--sm"
                    style={{ "--meter-tone": BUDGET_STATUS_COLOR[sub.status] }}
                    aria-hidden="true"
                  >
                    <span className="hb-meter-fill" style={{ width: `${Math.min(sub.pct, 1) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="hb-pot-card-foot">
          <span className="hb-pot-card-foot-label">{isOver ? "Über Budget" : "Verbleibend"}</span>
          <span className="hb-pot-card-foot-value">
            {isOver ? (
              <span className="hb-pot-foot-out">+{money(-row.remaining)}</span>
            ) : (
              money(row.remaining)
            )}
          </span>
        </div>
      </article>
    </div>
  );
}

/** Auslastungsbalken im Statuston, daneben der Prozentwert. */
function UsageMeter({ pct, status }) {
  return (
    <div className="hb-dt-progress">
      <span
        className="hb-meter hb-dt-progress-track"
        style={{ "--meter-tone": BUDGET_STATUS_COLOR[status] }}
        aria-hidden="true"
      >
        <span className="hb-meter-fill" style={{ width: `${Math.min(pct, 1) * 100}%` }} />
      </span>
      <span className="hb-dt-progress-value">{percent(pct)}</span>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`hb-budget-status-pill hb-budget-status-pill--${status}`}>
      {BUDGET_STATUS_LABEL[status]}
    </span>
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
