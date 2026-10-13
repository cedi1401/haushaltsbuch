import React from "react";
import { formatPercent } from "../../utils/hbUtils.js";
import { BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL } from "../../utils/budgetUtils.js";

/**
 * Spaltenkatalog der Budget-Tabelle. Gleiche Mechanik wie `reserveColumns.jsx`:
 * eine Fabrik, weil Beträge ausnahmslos über `fmt` laufen.
 *
 * Zeilen sind die Objekte aus `buildBudgetRows()` — budgetierte und nicht
 * budgetierte in einer Tabelle. Alles, was ein Budget voraussetzt (Auslastung,
 * Rest, Status), bleibt in den Zeilen ohne Budget leer.
 */

// Sortierrang nach Handlungsbedarf, nicht alphabetisch — aufsteigend steht
// oben, was zuerst Aufmerksamkeit braucht.
const STATUS_ORDER = { over: 0, full: 1, risk: 2, ok: 3 };

const hasBudget = (row) => row.budget != null;

/** Summe eines Feldes über alle Zeilen; null-Werte zählen nicht mit. */
function sumBy(rows, pick) {
  let sum = 0;
  for (const row of rows) {
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

/** Wie `sumBy`, aber null, wenn keine Zeile einen Wert hat — dann „—" statt 0. */
function sumOrNull(rows, pick) {
  return rows.some((r) => pick(r) != null) ? sumBy(rows, pick) : null;
}

// Die Summenzeile rechnet nur über budgetierte Zeilen: Budget, Ist und Rest
// müssen nebeneinander aufgehen. Was ohne Budget ausgegeben wurde, steht im
// Band der Sektion und in der Pill.
const budgetedOnly = (rows) => rows.filter(hasBudget);

function rowLabel(row) {
  return row.isRemainder ? `${row.name} · Übriges` : row.name;
}

// Beträge ohne Nachkommastellen. Vorher runden: sonst wird aus einer
// Überschreitung um ein paar Rappen eine „−0".
export function budgetMoney(fmt, value) {
  return value == null ? null : fmt(Math.round(value) || 0, 0);
}

// Tooltip nur, wenn der Text wirklich gekürzt ist. Gemessen wird an der
// Textzeile selbst: die Namenszelle kürzt je Zeile, der Deckel der Zelle
// (.hb-dt-clamp) läuft deshalb nie über.
function clampTitle(e) {
  const el = e.currentTarget;
  if (el.scrollWidth > el.clientWidth) el.title = el.textContent;
  else el.removeAttribute("title");
}

/**
 * @param {object} ctx
 * @param {Function} ctx.fmt
 */
export function buildBudgetColumns({ fmt }) {
  const spent = (row) => row.spent;
  const pct = (row) => (hasBudget(row) ? row.pct : null);
  const remaining = (row) => (hasBudget(row) ? row.remaining : null);
  const status = (row) => (hasBudget(row) ? row.status : null);
  const money = (value) => budgetMoney(fmt, value);

  return [
    {
      id: "name",
      label: "Kategorie",
      alwaysVisible: true,
      maxWidth: 320,
      sortValue: (row) => rowLabel(row).toLowerCase(),
      render: (row) => (
        <span className="hb-budget-cell-name">
          <span className="hb-cat-dot" style={{ background: row.color || "var(--muted)" }} />
          <span className="hb-budget-cell-names">
            <span className="hb-budget-cell-label" onMouseEnter={clampTitle}>{rowLabel(row)}</span>
            {row.parentName && (
              <span className="hb-budget-cell-parent" onMouseEnter={clampTitle}>{row.parentName}</span>
            )}
          </span>
        </span>
      ),
      summarize: () => "Summe mit Budget",
    },
    {
      id: "budget",
      label: "Budget",
      align: "right",
      sortValue: (row) => row.budget,
      render: (row) => money(row.budget),
      summarize: (rows) => money(sumOrNull(rows, (r) => r.budget)),
    },
    {
      id: "spent",
      label: "Ist",
      align: "right",
      sortValue: spent,
      render: (row) => money(spent(row)),
      summarize: (rows) => money(sumOrNull(budgetedOnly(rows), spent)),
    },
    {
      id: "usage",
      label: "Auslastung",
      // Der Balken ist die Kernaussage der Zeile — ohne feste Breite bliebe er
      // bei der Mindestbreite und der Überschuss ginge an die Status-Spalte.
      width: 180,
      sortValue: pct,
      render: (row) => {
        const value = pct(row);
        if (value == null) return null;
        return (
          <span className="hb-dt-progress">
            <span
              className="hb-meter hb-dt-progress-track"
              style={{ "--meter-tone": BUDGET_STATUS_COLOR[row.status] }}
              aria-hidden="true"
            >
              <span className="hb-meter-fill" style={{ width: `${Math.min(value, 1) * 100}%` }} />
            </span>
            <span className="hb-dt-progress-value">
              {formatPercent(value * 100, { digits: 0, sign: false })}
            </span>
          </span>
        );
      },
    },
    {
      id: "remaining",
      label: "Rest",
      align: "right",
      sortValue: remaining,
      render: (row) => money(remaining(row)),
      summarize: (rows) => money(sumOrNull(rows, remaining)),
    },
    {
      id: "status",
      label: "Status",
      // Rechtsbündig wie in der Rückstellungs-Tabelle: der letzten Spalte fällt
      // der Überschuss des auto-Layouts zu, linksbündig stünde die Pille mittendrin.
      align: "right",
      sortValue: (row) => STATUS_ORDER[status(row)] ?? null,
      render: (row) => {
        const value = status(row);
        if (!value) return null;
        return (
          <span className={`hb-budget-status-pill hb-budget-status-pill--${value}`}>
            {BUDGET_STATUS_LABEL[value]}
          </span>
        );
      },
    },
  ].map((col) => ({ ...col, defaultVisible: true }));
}
