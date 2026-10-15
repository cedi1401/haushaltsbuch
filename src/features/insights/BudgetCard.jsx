import React, { memo, useState, useEffect } from "react";
import { useFmt } from "../../contexts/CurrencyContext.jsx";
import { IconChevronLeft, IconChevronRight, IconInbox } from "../../components/icons.jsx";
import { formatPercent } from "../../utils/hbUtils.js";
import { BUDGET_STATUS_COLOR as STATUS_COLOR, BUDGET_STATUS_LABEL } from "../../utils/budgetUtils.js";

const PAGE_SIZE = 4;

const BudgetCard = memo(function BudgetCard({ budgetItems, totals, monthInfo, isFallbackMonth }) {
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
        <IconChevronLeft />
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
        <IconChevronRight />
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
            Lege unter „Budgets“ ein Budget für eine Ausgaben-Kategorie fest.
          </div>
        </div>
        {pagination}
      </div>
    );
  }

  const totalBudget  = totals.budget;
  const totalSpent   = totals.spent;
  const totalPct     = totals.pct;
  const overCount    = totals.overCount;
  const timeInfo     = monthInfo?.isCurrentMonth ? monthInfo : null;

  const totalStatus  = totals.status;

  const pagedItems = budgetItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="hb-insights-pane">
      {/* Gesamt-Header */}
      <div className="hb-budget-summary">
        <div>
          <div className="hb-insight-label">{isFallbackMonth ? "Laufender Monat" : "Gesamt"}</div>
          <div className="hb-budget-total-inline">
            <span className="hb-insight-kpi">{fmt(totalSpent, 0)}</span>
            <span className="hb-budget-total-sub">
              / {fmt(totalBudget, 0)}
              {" · "}
              {formatPercent(Math.min(Math.round(totalPct * 100), 150), { digits: 0, sign: false })} verbraucht
            </span>
          </div>
        </div>

        {timeInfo && (
          <div style={{ textAlign: "right" }}>
            <div className="hb-insight-label">Restmonat</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "flex-end" }}>
              <span className="hb-insight-kpi">{timeInfo.daysRemaining}</span>
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
      <div className="hb-meter hb-meter--sm hb-budget-total-bar">
        <div
          className="hb-meter-fill hb-budget-bar-fill"
          style={{ "--w": `${Math.min(totalPct * 100, 100)}%`, "--meter-tone": STATUS_COLOR[totalStatus] }}
        />
      </div>

      {/* Kategorie-Liste */}
      <div className="hb-budget-list">
        {pagedItems.map((item) => {
          const { pct, status, remaining } = item;
          const isOver   = status === "over";
          const pctText  = formatPercent(Math.round(pct * 100), { digits: 0, sign: false });

          // Gleiche Sprache wie die Karten im Budget-View: Status als Wort in
          // der Pille, Ton nur im Balken, Beträge in Textfarbe.
          return (
            <div key={item.id} className="hb-budget-row">
              <div className="hb-budget-row-head">
                <span className="hb-dot" style={{ background: item.color || "var(--muted)" }} />
                <span className="hb-budget-row-name">{item.name}</span>
                <span className="hb-budget-row-amounts">
                  {fmt(item.spent, 0)}
                  <span className="hb-budget-row-target"> / {fmt(item.budget, 0)}</span>
                </span>
                <span className={`hb-budget-status-pill hb-budget-status-pill--${status}`}>
                  {BUDGET_STATUS_LABEL[status]}
                </span>
              </div>

              <div className="hb-meter">
                <div
                  className="hb-meter-fill hb-budget-bar-fill"
                  style={{ "--w": `${Math.min(pct * 100, 100)}%`, "--meter-tone": STATUS_COLOR[status] }}
                />
              </div>

              <div className="hb-budget-row-meta">
                {pctText}
                {" · "}
                {isOver ? (
                  <span className="hb-pot-foot-out">
                    +{fmt(Math.abs(remaining), 0)} über Budget
                  </span>
                ) : (
                  `${fmt(remaining, 0)} verbleibend`
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
            <div className="hb-meter" />
            <div className="hb-budget-row-meta">&nbsp;</div>
          </div>
        ))}
      </div>

      {pagination}
    </div>
  );
});

export default BudgetCard;
