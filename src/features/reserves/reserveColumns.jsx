import React from "react";
import { formatDateDE } from "../../utils/hbUtils.js";
import { IconTag } from "../../components/icons.jsx";

// Turnus im Klartext. Deckt genau die Werte ab, die der Fixkosten-Dialog
// anbietet; alles andere fällt auf „alle N Monate" zurück.
const TURNUS_LABEL = { 1: "Monatlich", 3: "Quartalsweise", 6: "Halbjährlich", 12: "Jährlich" };

const STATUS_LABEL = {
  onTrack: "Im Plan",
  behind: "Rückstand",
  due: "Fällig",
  overdue: "Überfällig",
  free: "Freies Sparen",
};

/**
 * Vorbelegung: die Kernaussage des Views in acht Spalten. Alles Übrige ist über
 * die Spaltenauswahl zuschaltbar. „Letzte Zahlung" ist bewusst dabei — sie macht
 * den Zyklusanker sichtbar und ist damit die Gegenleistung für die einfache
 * Reset-Regel („jede Entnahme startet den Zyklus").
 */
export const DEFAULT_RESERVE_COLUMNS = [
  "name", "turnus", "lastPayment", "nextDue", "target", "actual", "delta", "status",
];

/** Summe eines Feldes über alle Zeilen; null-Werte zählen nicht mit. */
function sumBy(rows, pick) {
  let sum = 0;
  for (const row of rows) {
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Der Spaltenkatalog des Rücklagen-Views.
 *
 * Zeilen sind die Objekte aus `buildSinkingFundRows()`, erweitert um `id` und
 * `bookedThisMonth` (beides setzt der View). Beträge laufen ausnahmslos über
 * `fmt` — deshalb ist der Katalog eine Fabrik und keine Konstante.
 *
 * @param {{ fmt: Function, potNameById: Map, groupNameById: Map }} ctx
 */
export function buildReserveColumns({ fmt, potNameById, groupNameById }) {
  const columns = [
    {
      id: "name",
      label: "Bezeichnung",
      alwaysVisible: true,
      sortValue: (row) => String(row.item?.name ?? "").toLowerCase(),
      render: (row) => row.item?.name,
      // Kein Betrag, aber die Summenzelle, die am weitesten links steht — dort
      // liest sich die Anzahl als Beschriftung des Totals.
      summarize: (rows) => `${rows.length} Position${rows.length === 1 ? "" : "en"}`,
    },
    {
      id: "purpose",
      label: "Zweck",
      sortValue: (row) => String(row.item?.transferCategory ?? "").toLowerCase(),
      render: (row) => row.item?.transferCategory,
    },
    {
      id: "pot",
      label: "Topf",
      sortValue: (row) => String(potNameById.get(row.item?.potId) ?? "").toLowerCase(),
      render: (row) => potNameById.get(row.item?.potId),
    },
    {
      id: "group",
      label: "Gruppe",
      sortValue: (row) => String(groupNameById.get(row.item?.groupId) ?? "").toLowerCase(),
      render: (row) => groupNameById.get(row.item?.groupId),
    },
    {
      id: "tags",
      label: "Tags",
      sortValue: (row) => (row.item?.tags || []).join(", ").toLowerCase(),
      render: (row) => {
        const tags = row.item?.tags || [];
        if (tags.length === 0) return null;
        return (
          <span className="hb-dt-tags">
            {tags.map((tag) => (
              <span key={tag} className="hb-tag-pill">
                <IconTag width={13} height={13} />{tag}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      id: "turnus",
      label: "Turnus",
      sortValue: (row) => (row.isSinkingFund ? row.turnusMonths : null),
      render: (row) =>
        row.isSinkingFund
          ? TURNUS_LABEL[row.turnusMonths] || `alle ${row.turnusMonths} Monate`
          : null,
    },
    {
      id: "cycleAmount",
      label: "Rechnungsbetrag",
      align: "right",
      // Ohne Turnus gibt es keine Rechnung. `cycleAmount` ist dort zwar gefüllt
      // (es ist der monatliche Transfer), als „Rechnungsbetrag" wäre die Zahl
      // aber irreführend.
      sortValue: (row) => (row.isSinkingFund ? row.cycleAmount : null),
      render: (row) => (row.isSinkingFund ? fmt(row.cycleAmount) : null),
      summarize: (rows) => fmt(sumBy(rows, (r) => (r.isSinkingFund ? r.cycleAmount : null))),
    },
    {
      id: "monthlyRate",
      label: "Monatsrate",
      align: "right",
      sortValue: (row) => row.monthlyRate,
      render: (row) => fmt(row.monthlyRate),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.monthlyRate)),
    },
    {
      id: "lastPayment",
      label: "Letzte Zahlung",
      sortValue: (row) => row.lastPayment,
      render: (row) => (row.lastPayment ? formatDateDE(row.lastPayment) : null),
    },
    {
      id: "nextDue",
      label: "Nächste Fälligkeit",
      sortValue: (row) => row.nextDue,
      render: (row) => (row.nextDue ? formatDateDE(row.nextDue) : null),
    },
    {
      id: "target",
      label: "Soll-Stand",
      align: "right",
      sortValue: (row) => row.target,
      render: (row) => (row.target === null ? null : fmt(row.target)),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.target)),
    },
    {
      id: "actual",
      label: "Ist-Stand",
      align: "right",
      sortValue: (row) => row.actual,
      render: (row) => fmt(row.actual),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.actual)),
    },
    {
      id: "delta",
      label: "Differenz",
      align: "right",
      sortValue: (row) => row.delta,
      // Immer über fmt: `delta` ist ungerundet (D5), roh ausgegeben stünden bei
      // exakter Deckung Fliesskomma-Reste — und damit „−0.00" — in der Zelle.
      render: (row) => {
        if (row.delta === null) return null;
        const cls =
          row.delta < -row.tolerance
            ? "hb-dt-delta--neg"
            : row.delta > row.tolerance
              ? "hb-dt-delta--pos"
              : undefined;
        return <span className={cls}>{fmt(row.delta)}</span>;
      },
      summarize: (rows) => fmt(sumBy(rows, (r) => r.delta)),
    },
    {
      id: "coverage",
      label: "Deckung",
      align: "right",
      sortValue: (row) => row.coverage,
      render: (row) => pct(row.coverage),
    },
    {
      id: "progress",
      label: "Fortschritt",
      sortValue: (row) => row.progress,
      render: (row) => {
        if (row.progress === null) return null;
        const width = Math.max(0, Math.min(1, row.progress)) * 100;
        return (
          <span className="hb-dt-progress">
            <span className="hb-dt-progress-track">
              <span className="hb-dt-progress-fill" style={{ width: `${width}%` }} />
            </span>
            <span className="hb-dt-progress-value">{pct(row.progress)}</span>
          </span>
        );
      },
    },
    {
      id: "bookedThisMonth",
      label: "Diesen Monat gebucht",
      align: "right",
      sortValue: (row) => row.bookedThisMonth,
      render: (row) => (row.bookedThisMonth ? fmt(row.bookedThisMonth) : null),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.bookedThisMonth)),
    },
    {
      id: "status",
      label: "Status",
      sortValue: (row) => STATUS_LABEL[row.status] ?? null,
      render: (row) => STATUS_LABEL[row.status] ?? null,
    },
  ];

  const defaults = new Set(DEFAULT_RESERVE_COLUMNS);
  return columns.map((col) => ({ ...col, defaultVisible: defaults.has(col.id) }));
}
