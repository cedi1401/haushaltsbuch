import React from "react";
import HbTooltip from "../../components/HbTooltip.jsx";
import { formatPercent } from "../../utils/hbUtils.js";
import { BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL } from "../../utils/budgetUtils.js";

/**
 * Spaltenkatalog der Budget-Tabelle. Gleiche Mechanik wie `reserveColumns.jsx`:
 * eine Fabrik, weil Beträge ausnahmslos über `fmt` laufen.
 *
 * Zeilen sind die Objekte aus `buildBudgetRows()` — budgetierte und nicht
 * budgetierte in einer Tabelle. Alles, was ein Budget voraussetzt (Auslastung,
 * Rest, Prognose, Status), bleibt in den Zeilen ohne Budget leer.
 */

const DEFAULT_COLUMNS = ["name", "budget", "spent", "usage", "remaining", "forecast", "avg6", "status"];

// Sortierrang nach Handlungsbedarf, nicht alphabetisch — aufsteigend steht
// oben, was zuerst Aufmerksamkeit braucht.
const STATUS_ORDER = { over: 0, full: 1, risk: 2, warn: 3, ok: 4 };

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
 * Der Tooltip an der Status-Pille: der Zeitvergleich als Text. Den gibt es nur
 * im laufenden Monat und erst nach ein paar Tagen — sonst bleibt die Pille ohne
 * Blase.
 */
function statusTooltip(row, fmt) {
  if (row.expectedPct == null) return undefined;
  const elapsed = `Monat zu ${formatPercent(row.expectedPct * 100, { digits: 0, sign: false })} um.`;
  // Ohne variablen Teil (das Budget besteht ganz aus Fixkosten) gibt es keinen
  // Zeitplan, dem die Ausgaben voraus sein könnten.
  if (row.paceDelta == null) return `${elapsed} Das Budget ist ganz durch Fixkosten gebunden.`;
  const fixed = row.fixedBooked + row.fixedOpen > 0 ? " Fixkosten sind herausgerechnet." : "";
  const pace =
    Math.round(row.paceDelta) === 0
      ? "Genau im Zeitplan."
      : row.paceDelta > 0
        ? `${budgetMoney(fmt, row.paceDelta)} über Zeitplan.`
        : `${budgetMoney(fmt, -row.paceDelta)} unter Zeitplan.`;
  return `${pace} ${elapsed}${fixed}`;
}

/**
 * @param {object} ctx
 * @param {Function} ctx.fmt
 * @param {boolean} ctx.isAverage - „Alle Monate“: das Ist ist ein Ø pro Monat
 * @param {boolean} ctx.showActual - false im zukünftigen Monat: nur das Soll
 */
export function buildBudgetColumns({ fmt, isAverage, showActual }) {
  const defaults = new Set(DEFAULT_COLUMNS);
  const actual = (pick) => (row) => (showActual ? pick(row) : null);
  const spent = actual((row) => row.spent);
  const pct = actual((row) => (hasBudget(row) ? row.pct : null));
  const remaining = actual((row) => (hasBudget(row) ? row.remaining : null));
  const forecast = actual((row) => (hasBudget(row) ? row.forecast : null));
  const status = actual((row) => (hasBudget(row) ? row.status : null));
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
      label: isAverage ? "Ø Ist" : "Ist",
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
      id: "forecast",
      label: "Prognose",
      align: "right",
      sortValue: forecast,
      render: (row) => money(forecast(row)),
      summarize: (rows) => money(sumOrNull(rows, forecast)),
    },
    {
      id: "avg6",
      label: "Ø 6 Monate",
      align: "right",
      sortValue: (row) => row.avg6,
      render: (row) => money(row.avg6),
      summarize: (rows) => money(sumOrNull(budgetedOnly(rows), (r) => r.avg6)),
    },
    {
      id: "median12",
      label: "Median 12 Monate",
      align: "right",
      sortValue: (row) => row.median12,
      render: (row) => money(row.median12),
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
        const pill = (
          <span className={`hb-budget-status-pill hb-budget-status-pill--${value}`}>
            {BUDGET_STATUS_LABEL[value]}
          </span>
        );
        const tip = statusTooltip(row, fmt);
        return tip ? <HbTooltip text={tip} focusable={false}>{pill}</HbTooltip> : pill;
      },
    },
  ].map((col) => ({ ...col, defaultVisible: defaults.has(col.id) }));
}
