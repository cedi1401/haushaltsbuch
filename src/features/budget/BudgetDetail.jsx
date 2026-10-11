import React, { useId, useMemo, useState } from "react";
import { formatYearMonth } from "../../utils/financialMonthUtils.js";
import { buildBudgetHistory, calcHistoryAverage, listBudgetRowEntries } from "../../utils/budgetUtils.js";
import BudgetHistoryChart from "./BudgetHistoryChart.jsx";
import { budgetMoney } from "./budgetColumns.jsx";

const HISTORY_MONTHS = 12;
const HISTORY_HEIGHT = 180;
// So viele Buchungen stehen ohne Nachfrage da; der Rest klappt auf.
const ENTRY_LIMIT = 8;

// „2026-10-05" → „05.10." — der Monat samt Jahr steht in der Überschrift.
function shortDateDE(iso) {
  const m = String(iso || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}.${m[1]}.` : "";
}

/**
 * Der aufklappbare Detailbereich einer Zeile im Budget-View. Gerüst und Kacheln
 * kommen vom Detailbereich der Rückstellungen (.hb-res-detail): links Zahlen
 * und Verlauf, rechts die Buchungen des Monats.
 *
 * Er beantwortet, was in einer Tabellenzelle keinen Platz hat: wie die Zeile
 * zum Zeitplan steht, wie viel des Budgets Fixkosten binden, wie sich die
 * Kategorie über zwölf Monate gegen das heutige Budget verhält und welche
 * Buchungen hinter dem Ist stecken.
 *
 * `hiddenColumns` liefert `DataTable` — abgewählte Spalten erscheinen als
 * Kacheln, soweit sie für die Zeile einen Wert haben.
 */
export default function BudgetDetail({
  row,
  hiddenColumns,
  fmt,
  entries,
  expenseCategories,
  monthFilter,
  monthStartDay,
  monthInfo,
  firstMonth,
  currentMonth,
}) {
  const money = (value) => budgetMoney(fmt, value);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();

  const history = useMemo(
    () => buildBudgetHistory([row.monthly], firstMonth, currentMonth, HISTORY_MONTHS),
    [row.monthly, firstMonth, currentMonth]
  );
  const average = useMemo(() => calcHistoryAverage(history), [history]);

  const bookings = useMemo(
    () => listBudgetRowEntries({ entries, expenseCategories, row, monthFilter, monthStartDay }),
    [entries, expenseCategories, row, monthFilter, monthStartDay]
  );
  const subNames = useMemo(() => {
    const category = (expenseCategories || []).find((c) => c.id === row.categoryId);
    return new Map((category?.subcategories || []).map((s) => [s.id, s.name]));
  }, [expenseCategories, row.categoryId]);

  const facts = buildFacts(row, monthInfo, fmt, money);
  for (const col of hiddenColumns) {
    const value = col.render(row);
    if (value !== null && value !== undefined && value !== "") {
      facts.push({ id: `col-${col.id}`, label: col.label, value });
    }
  }

  const monthLabel = monthFilter ? formatYearMonth(monthFilter) : "";
  const shown = showAll ? bookings : bookings.slice(0, ENTRY_LIMIT);
  const bookingSum = bookings.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="hb-res-detail">
      <div className="hb-budget-detail-main">
        {facts.length > 0 && (
          <div className="hb-res-facts">
            {facts.map((fact) => (
              <div key={fact.id} className="hb-res-fact">
                <span className="hb-res-fact-label">{fact.label}</span>
                <span className="hb-res-fact-value">{fact.value}</span>
              </div>
            ))}
          </div>
        )}

        <section className="hb-budget-detail-chart">
          <h4 className="hb-res-note-title">
            {history.length > 1 ? `Verlauf der letzten ${history.length} Monate` : "Verlauf"}
          </h4>
          {history.length > 0 ? (
            <BudgetHistoryChart
              data={history}
              budget={row.budget}
              average={average}
              color={row.color}
              height={HISTORY_HEIGHT}
            />
          ) : (
            <p className="hb-res-note-text">Noch keine Buchungen erfasst.</p>
          )}
        </section>
      </div>

      <div className="hb-res-side">
        <section className="hb-res-note hb-res-note--plain">
          {!monthFilter ? (
            <>
              <h4 className="hb-res-note-title">Buchungen</h4>
              <p className="hb-res-note-text">
                Wähle oben einen einzelnen Monat, um die Buchungen hinter dem Ist zu sehen.
              </p>
            </>
          ) : (
            <>
              <h4 className="hb-res-note-title">
                {bookings.length === 0
                  ? `Buchungen im ${monthLabel}`
                  : `${bookings.length} Buchung${bookings.length === 1 ? "" : "en"} im ${monthLabel}`}
                {bookings.length > 0 && <span className="hb-inv-sub"> · Summe {money(bookingSum)}</span>}
              </h4>
              {bookings.length === 0 ? (
                <p className="hb-res-note-text">In diesem Monat ist hier nichts gebucht.</p>
              ) : (
                <ul className="hb-budget-detail-entries" id={listId}>
                  {shown.map((e) => (
                    <li key={e.id} className="hb-budget-detail-entry">
                      <span className="hb-muted">{shortDateDE(e.date)}</span>
                      <span className="hb-budget-detail-entry-text">
                        {String(e.note || "").trim() || subNames.get(e.subcategoryId) || (
                          <span className="hb-muted">Ohne Notiz</span>
                        )}
                      </span>
                      {e.recurringId ? (
                        <span className="hb-badge" title="Fixkosten-Buchung">Fix</span>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <span className="hb-budget-detail-entry-amount">{fmt(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {bookings.length > ENTRY_LIMIT && (
                <button
                  type="button"
                  className="hb-link-btn hb-budget-detail-more"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  aria-controls={listId}
                >
                  {showAll ? "Weniger anzeigen" : `Weitere ${bookings.length - ENTRY_LIMIT} anzeigen`}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Kennzahlen, die es nur im Detail gibt. Zeitvergleich und Tagesrate setzen
 * den laufenden Monat voraus, Fixkosten ein Budget; im zukünftigen Monat zeigt
 * die Tabelle nur das Soll — vordatierte Buchungen stehen deshalb hier.
 */
function buildFacts(row, monthInfo, fmt, money) {
  const facts = [];
  const hasBudget = row.budget != null;

  if (hasBudget && monthInfo?.isCurrentMonth) {
    if (row.expectedPct != null) {
      facts.push({ id: "pace", label: "Zeitvergleich", value: paceText(row, money) });
    }
    // Was offene Fixkosten noch holen, ist nicht mehr frei.
    const free = row.remaining - row.fixedOpen;
    if (monthInfo.daysRemaining > 0 && free > 0) {
      facts.push({
        id: "perDay",
        label: `Frei pro Tag (noch ${monthInfo.daysRemaining} ${monthInfo.daysRemaining === 1 ? "Tag" : "Tage"})`,
        value: fmt(free / monthInfo.daysRemaining),
      });
    }
  }
  if (hasBudget && row.fixedBooked > 0) {
    facts.push({ id: "fixedBooked", label: "Fixkosten gebucht", value: money(row.fixedBooked) });
  }
  if (hasBudget && row.fixedOpen > 0) {
    facts.push({ id: "fixedOpen", label: "Fixkosten noch offen", value: money(row.fixedOpen) });
  }
  if (monthInfo?.isFutureMonth && row.spent > 0) {
    facts.push({ id: "predated", label: "Vordatiert gebucht", value: money(row.spent) });
  }
  return facts;
}

function paceText(row, money) {
  // Ohne variablen Teil gibt es keinen Zeitplan, dem die Ausgaben voraus sein könnten.
  if (row.paceDelta == null) return "Entfällt (nur Fixkosten)";
  const pace = Math.round(row.paceDelta);
  if (pace === 0) return "Genau im Zeitplan";
  return pace > 0 ? `${money(pace)} über Zeitplan` : `${money(-pace)} unter Zeitplan`;
}
