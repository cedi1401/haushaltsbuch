import React, { memo } from "react";
import { useFmt } from "../../contexts/CurrencyContext.jsx";

// --- Pacing-bewusste Status-Berechnung ---
// Gibt "ok" | "warn" | "risk" | "over" zurück.
// Wenn wir im aktuellen Monat sind und mind. 5 Tage vergangen sind,
// wird das Verbrauchstempo gegen den Monatsverlauf geprüft.
function getBudgetStatus(pct, pacingInfo) {
  if (pct >= 1.0) return "over";
  if (pacingInfo) {
    const { paceRatio } = pacingInfo;
    if (paceRatio > 1.3) return "risk";
    if (paceRatio > 1.1) return "warn";
  }
  if (pct >= 0.9) return "risk";
  if (pct >= 0.7) return "warn";
  return "ok";
}

const STATUS_COLOR = {
  ok:   "var(--green)",
  warn: "var(--yellow)",
  risk: "var(--red)",
  over: "var(--red)",
};

const STATUS_LABEL = {
  ok:   "Im Budget",
  warn: "Aufpassen",
  risk: "Knapp",
  over: "Überschritten",
};

// Gibt null zurück wenn monthFilter kein aktueller Monat ist,
// sonst ein Objekt mit allen Zeitinfos für Pacing/Forecast.
function getMonthTimeInfo(monthFilter) {
  if (!monthFilter) return null;
  const today = new Date();
  const [y, m] = monthFilter.split("-").map(Number);
  if (y !== today.getFullYear() || m !== today.getMonth() + 1) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = today.getDate();
  return {
    dayOfMonth,           // vergangene Tage (inklusive heute)
    daysInMonth,
    remaining: daysInMonth - dayOfMonth,
    expectedPct: dayOfMonth / daysInMonth,
  };
}

// Berechnet Forecast und Pacing für eine einzelne Kategorie.
// Gibt null zurück wenn zu wenig Datenbasis.
function calcItemMetrics(spent, budget, timeInfo) {
  if (!timeInfo || timeInfo.dayOfMonth < 3) return null;

  const rate = spent / timeInfo.dayOfMonth;         // CHF/Tag bisher
  const forecastMonthEnd = rate * timeInfo.daysInMonth;

  const pacing = timeInfo.dayOfMonth >= 5 && budget > 0
    ? {
        paceRatio: (spent / budget) / timeInfo.expectedPct,
      }
    : null;

  return {
    rate,
    forecastMonthEnd,
    forecastDelta: forecastMonthEnd - budget,       // positiv = Überschreitung
    pacing,
  };
}

const BudgetCard = memo(function BudgetCard({ budgetItems, monthFilter }) {
  const fmt = useFmt();
  if (!budgetItems || budgetItems.length === 0) {
    return (
      <div className="hb-insights-pane hb-budget-empty">
        <div className="hb-insight-label">Kein Budget gesetzt</div>
        <div className="hb-muted" style={{ fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
          Öffne den Kategorien-Dialog und setze ein Monatsbudget für eine Ausgaben-Kategorie.
        </div>
      </div>
    );
  }

  const totalBudget  = budgetItems.reduce((s, i) => s + i.budget, 0);
  const totalSpent   = budgetItems.reduce((s, i) => s + i.spent,  0);
  const totalPct     = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const overCount    = budgetItems.filter((i) => i.spent > i.budget).length;
  const timeInfo     = getMonthTimeInfo(monthFilter);

  // Forecast + Pacing für Gesamtbudget
  const totalMetrics  = calcItemMetrics(totalSpent, totalBudget, timeInfo);
  const totalPacing   = totalMetrics?.pacing || null;
  const totalStatus   = getBudgetStatus(totalPct, totalPacing);

  return (
    <div className="hb-insights-pane">
      {/* Gesamt-Header */}
      <div className="hb-budget-summary">
        <div>
          <div className="hb-insight-label">Gesamt</div>
          <div className={`hb-insight-kpi hb-insight-kpi--${totalStatus === "ok" ? "good" : totalStatus === "warn" ? "warn" : "bad"}`}>
            {fmt(totalSpent, 0)}
          </div>
          <div className="hb-insight-sub">
            von {fmt(totalBudget, 0)}
            {" · "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {Math.min(Math.round(totalPct * 100), 150)}% verbraucht
            </span>
          </div>
        </div>

        {timeInfo && (
          <div style={{ textAlign: "right" }}>
            <div className="hb-insight-label">Restmonat</div>
            <div className="hb-insight-kpi">{timeInfo.remaining}</div>
            <div className="hb-insight-sub">von {timeInfo.daysInMonth} Tagen</div>
          </div>
        )}

        {overCount > 0 && (
          <div style={{ textAlign: "right" }}>
            <div className="hb-insight-label">Überschritten</div>
            <div className="hb-insight-kpi hb-insight-kpi--bad">{overCount}</div>
          </div>
        )}
      </div>

      {/* Gesamtbalken + optionaler Forecast */}
      <div className="hb-budget-total-bar">
        <div
          className="hb-budget-bar-fill"
          style={{ "--w": `${Math.min(totalPct * 100, 100)}%`, "--c": STATUS_COLOR[totalStatus] }}
        />
      </div>

      {/* Forecast-Zeile für Gesamtbudget */}
      {totalMetrics && totalBudget > 0 && (
        <div className="hb-budget-total-forecast">
          Prognose Monatsende:{" "}
          <span style={{ color: totalMetrics.forecastMonthEnd > totalBudget ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
            {fmt(totalMetrics.forecastMonthEnd, 0)}
          </span>
          {totalMetrics.forecastDelta > 0 && (
            <span style={{ color: "var(--red)" }}>
              {" "}(+{fmt(totalMetrics.forecastDelta, 0)} über Budget)
            </span>
          )}
        </div>
      )}

      {/* Kategorie-Liste */}
      <div className="hb-budget-list">
        {budgetItems.map((item) => {
          const pct      = item.budget > 0 ? item.spent / item.budget : 0;
          const metrics  = calcItemMetrics(item.spent, item.budget, timeInfo);
          const pacing   = metrics?.pacing || null;
          const status   = getBudgetStatus(pct, pacing);
          const color    = STATUS_COLOR[status];
          const remaining = item.budget - item.spent;
          const isOver   = remaining < 0;

          // Pill-Text: über 150% → nur Label, darunter Prozentzahl
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
                  className={`hb-budget-bar-fill${status === "over" ? " hb-budget-bar-fill--over" : ""}`}
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

                {/* Burn-Rate: ø CHF X/Tag */}
                {metrics && metrics.rate > 0 && (
                  <span className="hb-budget-row-meta-sep">
                    · ø {fmt(metrics.rate, 1)}/Tag
                  </span>
                )}

                {/* Forecast Monatsende */}
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
      </div>
    </div>
  );
});

export default BudgetCard;
