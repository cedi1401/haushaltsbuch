import React, { memo, useState, useEffect } from "react";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconInbox } from "../../components/icons.jsx";
import { getFinancialMonthRange, getFinancialMonth } from "../../utils/financialMonthUtils.js";

function getBudgetStatus(pct) {
  if (pct >= 1.0) return "over";
  if (pct >= 0.95) return "risk";
  return "ok";
}

const STATUS_COLOR = {
  ok:   "var(--green)",
  warn: "var(--yellow)",
  risk: "var(--yellow)",
  over: "var(--red)",
};

const STATUS_LABEL = {
  ok:   "Im Budget",
  warn: "Aufpassen",
  risk: "Knapp",
  over: "Überschritten",
};

function getMonthTimeInfo(monthFilter, monthStartDay) {
  if (!monthFilter) return null;
  const startDay = monthStartDay ?? 1;
  const range = getFinancialMonthRange(monthFilter, startDay);
  if (!range) return null;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const isCurrentMonth = getFinancialMonth(todayStr, startDay)?.yyyymm === monthFilter;
  if (!isCurrentMonth) return null;

  const msPerDay = 86400000;
  const startDate = new Date(range.startDate + "T00:00:00");
  const endDate = new Date(range.endDate + "T00:00:00");
  const daysInMonth = Math.round((endDate - startDate) / msPerDay) + 1;
  const dayOfMonth = Math.min(
    Math.round((today - startDate) / msPerDay) + 1,
    daysInMonth
  );
  return {
    dayOfMonth,
    daysInMonth,
    remaining: daysInMonth - dayOfMonth,
    expectedPct: dayOfMonth / daysInMonth,
  };
}

function calcItemMetrics(spent, budget, timeInfo) {
  if (!timeInfo || timeInfo.dayOfMonth < 3) return null;

  const rate = spent / timeInfo.dayOfMonth;
  const forecastMonthEnd = rate * timeInfo.daysInMonth;

  return {
    rate,
    forecastMonthEnd,
    forecastDelta: forecastMonthEnd - budget,
  };
}

const PAGE_SIZE = 4;

const BudgetCard = memo(function BudgetCard({ budgetItems, monthFilter, monthStartDay }) {
  const fmt = useFmt();
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [budgetItems]);

  const isEmpty = !budgetItems || budgetItems.length === 0;
  const totalPages = isEmpty ? 1 : Math.ceil(budgetItems.length / PAGE_SIZE);

  const pagination = (
    <div className="hb-budget-pagination" style={{ marginTop: "auto" }}>
      <button
        className="hb-budget-pag-btn"
        disabled={isEmpty || page === 0}
        onClick={() => setPage((p) => p - 1)}
        aria-label="Vorherige Seite"
      >
        ‹
      </button>
      <span className="hb-budget-pag-info">
        {isEmpty ? "–" : `${page + 1} / ${totalPages}`}
      </span>
      <button
        className="hb-budget-pag-btn"
        disabled={isEmpty || page >= totalPages - 1}
        onClick={() => setPage((p) => p + 1)}
        aria-label="Nächste Seite"
      >
        ›
      </button>
    </div>
  );

  if (isEmpty) {
    return (
      <div className="hb-insights-pane">
        <div className="hb-empty hb-empty--sm" style={{ flex: 1 }}>
          <div className="hb-empty-icon"><IconInbox /></div>
          <div className="hb-empty-title">Kein Budget gesetzt</div>
          <div className="hb-empty-text">
            Öffne den Kategorien-Dialog und setze ein Monatsbudget für eine Ausgaben-Kategorie.
          </div>
        </div>
        {pagination}
      </div>
    );
  }

  const totalBudget  = budgetItems.reduce((s, i) => s + i.budget, 0);
  const totalSpent   = budgetItems.reduce((s, i) => s + i.spent,  0);
  const totalPct     = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const overCount    = budgetItems.filter((i) => i.spent > i.budget).length;
  const timeInfo     = getMonthTimeInfo(monthFilter, monthStartDay);

  const totalMetrics = calcItemMetrics(totalSpent, totalBudget, timeInfo);
  const totalStatus  = getBudgetStatus(totalPct);

  const pagedItems = budgetItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="hb-insights-pane">
      {/* Gesamt-Header */}
      <div className="hb-budget-summary">
        <div>
          <div className="hb-insight-label">Gesamt</div>
          <div className="hb-budget-total-inline">
            <span className="hb-insight-kpi">{fmt(totalSpent, 0)}</span>
            <span className="hb-budget-total-sub">
              / {fmt(totalBudget, 0)}
              {" · "}
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {Math.min(Math.round(totalPct * 100), 150)}% verbraucht
              </span>
            </span>
          </div>
        </div>

        {timeInfo && (
          <div style={{ textAlign: "right" }}>
            <div className="hb-insight-label">Restmonat</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "flex-end" }}>
              <span className="hb-insight-kpi">{timeInfo.remaining}</span>
              <span className="hb-budget-total-sub">von {timeInfo.daysInMonth} Tagen</span>
            </div>
          </div>
        )}

        {overCount > 0 && (
          <div style={{ textAlign: "right" }}>
            <div className="hb-insight-label">Überschritten</div>
            <div className="hb-insight-kpi">{overCount}</div>
          </div>
        )}
      </div>

      {/* Gesamtbalken */}
      <div className="hb-budget-total-bar">
        <div
          className="hb-budget-bar-fill"
          style={{ "--w": `${Math.min(totalPct * 100, 100)}%`, "--c": STATUS_COLOR[totalStatus] }}
        />
      </div>

      {/* Kategorie-Liste */}
      <div className="hb-budget-list">
        {pagedItems.map((item) => {
          const pct      = item.budget > 0 ? item.spent / item.budget : 0;
          const metrics  = calcItemMetrics(item.spent, item.budget, timeInfo);
          const status   = getBudgetStatus(pct);
          const color    = STATUS_COLOR[status];
          const remaining = item.budget - item.spent;
          const isOver   = remaining < 0;

          const pctDisplay = Math.round(pct * 100);
          const pillText   = pctDisplay > 150 ? STATUS_LABEL[status] : `${pctDisplay}%`;

          return (
            <div key={item.id} className="hb-budget-row">
              <div className="hb-budget-row-head">
                <span className="hb-dot" style={{ background: item.color || "var(--muted)", flexShrink: 0 }} />
                <span className="hb-budget-row-name">
                  {item.isParent ? item.name : `${item.parentName} › ${item.name}`}
                </span>
                <span className="hb-budget-row-amounts" style={{ color }}>
                  {fmt(item.spent, 0)}
                  <span className="hb-budget-row-target"> / {fmt(item.budget, 0)}</span>
                </span>
                <span className={`hb-budget-status-pill hb-budget-status-pill--${status}`}>
                  {pillText}
                </span>
              </div>

              <div className="hb-insight-bar-track">
                <div
                  className="hb-budget-bar-fill"
                  style={{ "--w": `${Math.min(pct * 100, 100)}%`, "--c": color }}
                />
              </div>

              <div className="hb-budget-row-meta">
                {isOver ? (
                  <span style={{ color: "var(--red)" }}>
                    +{fmt(Math.abs(remaining), 0)} über Budget
                  </span>
                ) : (
                  `${fmt(remaining, 0)} verbleibend`
                )}

                {metrics && metrics.rate > 0 && (
                  <span className="hb-budget-row-meta-sep">
                    · ø {fmt(metrics.rate, 1)} pro Tag
                  </span>
                )}

                {metrics && item.budget > 0 && (
                  <span className="hb-budget-row-meta-sep">
                    · Prognose:{" "}
                    <span style={{ color: metrics.forecastMonthEnd > item.budget ? "var(--red)" : "var(--green)" }}>
                      {fmt(metrics.forecastMonthEnd, 0)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {Array.from({ length: PAGE_SIZE - pagedItems.length }).map((_, i) => (
          <div key={`ph-${i}`} className="hb-budget-row hb-budget-row--placeholder" aria-hidden="true">
            <div className="hb-budget-row-head">
              <span className="hb-dot" />
              <span className="hb-budget-row-name">&nbsp;</span>
              <span className="hb-budget-row-amounts">&nbsp;</span>
              <span className="hb-budget-status-pill">&nbsp;</span>
            </div>
            <div className="hb-insight-bar-track" />
            <div className="hb-budget-row-meta">&nbsp;</div>
          </div>
        ))}
      </div>

      {pagination}
    </div>
  );
});

export default BudgetCard;
