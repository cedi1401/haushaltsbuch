import React from "react";
import HbTooltip from "../../components/HbTooltip.jsx";
import { formatDateDE, formatPercent } from "../../utils/formatUtils.js";
import { IconTag } from "../../components/icons.jsx";
import { formatRateCount } from "./reserveFormat.js";

// Turnus im Klartext. Deckt die Werte ab, die der Dialog anbietet, plus den
// Bestandswert 1; alles andere fällt auf „Alle N Monate" zurück. Exportiert,
// weil die Fixkosten-Tabelle dieselbe Beschriftung braucht.
export const TURNUS_LABEL = {
  1: "Monatlich",
  3: "Quartalsweise",
  6: "Halbjährlich",
  12: "Jährlich",
  24: "Alle 2 Jahre",
  36: "Alle 3 Jahre",
};

/** Die drei Arten einer Sparposition, in der Reihenfolge des Dialogs. */
export const RULE_LABEL = {
  free: "Freie Rücklage",
  reserve: "Rückstellung",
  goal: "Sparziel",
};

// Statustext je Stufe. Freie Rücklagen („free") und Sparziele ohne Deadline
// („open") haben keinen Maßstab, an dem ein Status etwas bedeuten würde — sie
// bleiben leer. Exportiert, weil die Sparziel-Karten dieselben Stufen zeigen.
export const STATUS_LABEL = {
  onTrack: "Im Plan",
  behind: "Rückstand",
  due: "Fällig",
  overdue: "Überfällig",
  reached: "Erreicht",
  offTrack: "Nicht im Plan",
  missed: "Überschritten",
};

// Die Sparziel-Stufen leihen sich die Farben der Rückstellungs-Pillen: dieselbe
// Bedeutung („gut", „aufpassen", „zu spät") soll gleich aussehen.
export const STATUS_TONE = {
  onTrack: "onTrack",
  behind: "behind",
  due: "due",
  overdue: "overdue",
  reached: "onTrack",
  offTrack: "behind",
  missed: "overdue",
};

// Sortierrang nach Handlungsbedarf, nicht alphabetisch: aufsteigend steht oben,
// was zuerst Aufmerksamkeit braucht.
export const STATUS_ORDER = { overdue: 0, missed: 0, due: 1, behind: 2, offTrack: 2, onTrack: 3, reached: 4 };

/**
 * Vorbelegung: die Kernaussage der View in acht Spalten. Alles Übrige ist über
 * die Spaltenauswahl zuschaltbar und erscheint sonst im Detailbereich.
 */
export const DEFAULT_SAVINGS_COLUMNS = [
  "name", "rule", "monthlyRate", "goalAmount", "actual", "progress", "nextDate", "status",
];

/** Summe eines Feldes über die Zeilen; null-Werte zählen nicht mit. */
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
  return formatPercent(value * 100, { digits: 0, sign: false });
}

// Die Überleitungszeilen („Sparziele", „Abgeschlossene Sparziele", „Ohne Sparposition")
// zeigen nur Bezeichnung und Ist-Stand; alle anderen Spalten bleiben leer.
const position = (fn) => (row) => (row.isRemainder ? null : fn(row));

/**
 * Tooltip an der Status-Pille. Er sagt, was die Farbe nur andeutet, und bei
 * „Fällig"/„Überfällig", was als Nächstes zu tun ist.
 */
function statusTooltip(row, fmt) {
  const due = row.nextDate ? formatDateDE(row.nextDate) : "—";
  switch (row.status) {
    case "onTrack":
      return (
        "Für diese Rückstellung liegt im Topf mindestens so viel, wie zum jetzigen " +
        "Zeitpunkt im Zyklus zurückgelegt sein müsste."
      );
    case "behind": {
      const short = -row.delta;
      const rates = row.monthlyRate > 0 ? ` (${formatRateCount(short / row.monthlyRate)})` : "";
      return `Es fehlen ${fmt(short)}${rates} bis zum Soll-Stand. Die Rechnung ist erst am ${due} fällig.`;
    }
    case "due":
      return (
        `Die Rechnung ist seit ${due} fällig. Über „Rechnung bezahlt" erfasst du die ` +
        "Zahlung als Entnahme aus dem Topf — damit ist dieser Zyklus abgeschlossen."
      );
    case "overdue":
      return (
        `Die Rechnung war am ${due} fällig — das ist über einen Monat her. Solange die ` +
        "Zahlung nicht als Entnahme erfasst ist, rückt die Fälligkeit nicht weiter."
      );
    default:
      return undefined;
  }
}

/**
 * Der Spaltenkatalog der Rücklagen-Tabelle (Rückstellungen und freie
 * Rücklagen; Sparziele stehen als Karten darunter).
 *
 * Zeilen sind die Objekte aus `buildSavingsModel()` (savingsUtils), plus die
 * Überleitungszeilen mit `isRemainder: true`. Beträge laufen ausnahmslos über
 * `fmt` — deshalb ist der Katalog eine Fabrik und keine Konstante.
 *
 * @param {{ fmt: Function, groupNameById: Map }} ctx
 */
export function buildSavingsColumns({ fmt, groupNameById }) {
  const defaults = new Set(DEFAULT_SAVINGS_COLUMNS);
  const catalog = [
    {
      id: "name",
      label: "Bezeichnung",
      alwaysVisible: true,
      maxWidth: 320,
      sortValue: position((row) => String(row.purpose?.name ?? "").toLowerCase()),
      render: (row) =>
        row.isRemainder ? <span className="hb-dt-remainder-label">{row.label}</span> : row.purpose?.name,
      summarize: (rows) => {
        const n = rows.filter((r) => !r.isRemainder).length;
        return `${n} Sparposition${n === 1 ? "" : "en"}`;
      },
    },
    {
      id: "rule",
      label: "Art",
      sortValue: position((row) => RULE_LABEL[row.rule] ?? null),
      render: position((row) => RULE_LABEL[row.rule]),
    },
    {
      id: "group",
      label: "Gruppe",
      sortValue: position((row) => String(groupNameById.get(row.purpose?.groupId) ?? "").toLowerCase()),
      render: position((row) => groupNameById.get(row.purpose?.groupId)),
    },
    {
      id: "tags",
      label: "Tags",
      sortValue: position((row) => (row.purpose?.tags || []).join(", ").toLowerCase()),
      render: position((row) => {
        const tags = row.purpose?.tags || [];
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
      }),
    },
    {
      id: "turnus",
      label: "Turnus",
      sortValue: position((row) => (row.isSinkingFund ? row.turnusMonths : null)),
      render: position((row) =>
        row.isSinkingFund
          ? TURNUS_LABEL[row.turnusMonths] || `Alle ${row.turnusMonths} Monate`
          : null
      ),
    },
    {
      id: "monthlyRate",
      label: "Monatsrate",
      align: "right",
      sortValue: position((row) => row.monthlyRate ?? null),
      render: position((row) => (row.monthlyRate ? fmt(row.monthlyRate) : null)),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.monthlyRate)),
    },
    {
      id: "goalAmount",
      // Rechnungsbetrag je Zyklus; freie Rücklagen haben keinen.
      label: "Rechnungsbetrag",
      align: "right",
      sortValue: position((row) => row.goalAmount ?? null),
      render: position((row) => (row.goalAmount ? fmt(row.goalAmount) : null)),
    },
    {
      id: "target",
      label: "Soll-Stand",
      align: "right",
      sortValue: position((row) => row.target ?? null),
      render: position((row) => (row.target === null || row.target === undefined ? null : fmt(row.target))),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.target)),
    },
    {
      id: "actual",
      label: "Ist-Stand",
      align: "right",
      sortValue: position((row) => row.actual),
      render: (row) => fmt(row.actual),
      // Über alle Zeilen inklusive Überleitung: die Fußsumme ist damit der Stand
      // aller Töpfe.
      summarize: (rows) => fmt(sumBy(rows, (r) => r.actual)),
    },
    {
      id: "delta",
      label: "Differenz",
      align: "right",
      sortValue: position((row) => row.delta ?? null),
      render: position((row) => {
        if (row.delta === null || row.delta === undefined) return null;
        const cls =
          row.delta < -row.tolerance
            ? "hb-dt-delta--neg"
            : row.delta > row.tolerance
              ? "hb-dt-delta--pos"
              : undefined;
        return <span className={cls}>{fmt(row.delta)}</span>;
      }),
      summarize: (rows) => fmt(sumBy(rows, (r) => r.delta)),
    },
    {
      id: "progress",
      label: "Fortschritt",
      sortValue: position((row) => row.progress ?? null),
      render: position((row) => {
        if (row.progress === null || row.progress === undefined) return null;
        const width = Math.max(0, Math.min(1, row.progress)) * 100;
        return (
          <span className="hb-dt-progress">
            <span className="hb-meter hb-dt-progress-track" aria-hidden="true">
              <span className="hb-meter-fill" style={{ width: `${width}%` }} />
            </span>
            <span className="hb-dt-progress-value">{pct(row.progress)}</span>
          </span>
        );
      }),
    },
    {
      id: "lastPayment",
      label: "Letzte Zahlung",
      sortValue: position((row) => row.lastPayment ?? null),
      render: position((row) => (row.lastPayment ? formatDateDE(row.lastPayment) : null)),
    },
    {
      id: "nextDate",
      label: "Fällig am",
      sortValue: position((row) => row.nextDate ?? null),
      render: position((row) => (row.nextDate ? formatDateDE(row.nextDate) : null)),
    },
    {
      id: "status",
      label: "Status",
      // Rechtsbündig, obwohl kein Betrag: als letzte Spalte fällt ihr der
      // Überschuss des auto-Layouts zu; linksbündig stünde das Badge mittendrin.
      align: "right",
      sortValue: position((row) => STATUS_ORDER[row.status] ?? null),
      render: position((row) => {
        const label = STATUS_LABEL[row.status];
        if (!label) return null;
        return (
          <HbTooltip text={statusTooltip(row, fmt)} focusable={false}>
            <span className={`hb-badge hb-res-pill hb-res-pill--${STATUS_TONE[row.status]}`}>{label}</span>
          </HbTooltip>
        );
      }),
    },
  ];
  return catalog.map((col) => ({ ...col, defaultVisible: defaults.has(col.id) }));
}
