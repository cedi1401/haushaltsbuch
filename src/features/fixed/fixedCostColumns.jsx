import React from "react";
import { IconCheck, IconTag } from "../../components/icons.jsx";
import { formatDateDE } from "../../utils/hbUtils.js";
import { annualAmount, isSinkingFund, monthlyRate, turnusMonths } from "../../utils/fixedCostUtils.js";
import { TURNUS_LABEL } from "../reserves/reserveColumns.jsx";

/**
 * Spaltenkataloge der beiden Fixkosten-Tabellen („Ausgaben" und „Rücklagen &
 * Rückstellungen"). Gleiche Mechanik wie `reserveColumns.jsx`: eine Fabrik,
 * weil Beträge ausnahmslos über `fmt` laufen.
 *
 * Zeilen haben die Form `{ id, item, booked }` — `item` ist die Position aus
 * `recurringExpenses`, `booked` die Buchungen dieses Finanzmonats
 * (`{ count, amount, lastDate }`) oder `null`. Beides setzt der View.
 */

const DEFAULT_COLUMNS = {
  expense: ["name", "category", "monthlyRate", "status"],
  transfer: ["name", "purpose", "pot", "turnus", "cycleAmount", "monthlyRate", "status"],
};

/** Summe eines Feldes über alle Zeilen; null-Werte zählen nicht mit. */
function sumBy(rows, pick) {
  let sum = 0;
  for (const row of rows) {
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v)) sum += v;
  }
  return sum;
}

function statusTitle(booked, fmt) {
  if (!booked) return "In diesem Finanzmonat noch nicht gebucht.";
  const last = formatDateDE(booked.lastDate);
  if (booked.count === 1) {
    return `In diesem Finanzmonat am ${last} gebucht (${fmt(booked.amount)}).`;
  }
  return (
    `In diesem Finanzmonat ${booked.count}-mal gebucht, zuletzt am ${last} — ` +
    `zusammen ${fmt(booked.amount)}.`
  );
}

function categoryLabel(item, categoryById) {
  const cat = categoryById.get(item.categoryId);
  if (!cat) return { cat: null, text: item.category || "Unkategorisiert" };
  const sub = item.subcategoryId
    ? (cat.subcategories || []).find((s) => s.id === item.subcategoryId)
    : null;
  return { cat, text: sub ? `${cat.name} › ${sub.name}` : cat.name };
}

function catalog(kind, { fmt, categoryById, potNameById, groupNameById }) {
  const name = {
    id: "name",
    label: "Bezeichnung",
    alwaysVisible: true,
    maxWidth: 320,
    sortValue: (row) => String(row.item?.name ?? "").toLowerCase(),
    render: (row) => row.item?.name,
    summarize: (rows) => `${rows.length} Position${rows.length === 1 ? "" : "en"}`,
  };

  const group = {
    id: "group",
    label: "Gruppe",
    sortValue: (row) => String(groupNameById.get(row.item?.groupId) ?? "").toLowerCase(),
    render: (row) => groupNameById.get(row.item?.groupId),
  };

  const tags = {
    id: "tags",
    label: "Tags",
    sortValue: (row) => (row.item?.tags || []).join(", ").toLowerCase(),
    render: (row) => {
      const list = row.item?.tags || [];
      if (list.length === 0) return null;
      return (
        <span className="hb-dt-tags">
          {list.map((tag) => (
            <span key={tag} className="hb-tag-pill">
              <IconTag width={13} height={13} />{tag}
            </span>
          ))}
        </span>
      );
    },
  };

  // Beträge in Textfarbe: Eine Fixkosten-Position ist der Normalfall, kein
  // Fehlbetrag — Rot bleibt Zuständen vorbehalten, die Handeln verlangen.
  const rate = {
    id: "monthlyRate",
    label: "Monatsrate",
    align: "right",
    sortValue: (row) => monthlyRate(row.item),
    render: (row) => fmt(monthlyRate(row.item)),
    summarize: (rows) => fmt(sumBy(rows, (r) => monthlyRate(r.item))),
  };

  const annual = {
    id: "annual",
    label: "Jahresbetrag",
    align: "right",
    sortValue: (row) => annualAmount(row.item),
    render: (row) => fmt(annualAmount(row.item)),
    summarize: (rows) => fmt(sumBy(rows, (r) => annualAmount(r.item))),
  };

  const status = {
    id: "status",
    label: "Diesen Monat",
    // Das Datum der letzten Buchung sortiert; offene Positionen landen dank
    // der null-Regel von DataTable immer am Ende.
    sortValue: (row) => row.booked?.lastDate ?? null,
    render: (row) =>
      row.booked ? (
        <span className="hb-fixed-state hb-fixed-state--done" title={statusTitle(row.booked, fmt)}>
          <IconCheck width={14} height={14} aria-hidden="true" />
          <span className="hb-fixed-sr">Gebucht am </span>
          {formatDateDE(row.booked.lastDate)}
        </span>
      ) : (
        <span className="hb-fixed-state hb-fixed-state--open" title={statusTitle(null, fmt)}>
          Offen
        </span>
      ),
    summarize: (rows) => `${rows.filter((r) => r.booked).length} von ${rows.length} gebucht`,
  };

  if (kind === "expense") {
    return [
      name,
      {
        id: "category",
        label: "Kategorie",
        sortValue: (row) => categoryLabel(row.item, categoryById).text.toLowerCase(),
        render: (row) => {
          const { cat, text } = categoryLabel(row.item, categoryById);
          return (
            <span className="hb-fixed-cat">
              {cat?.color && <span className="hb-cat-dot" style={{ background: cat.color }} />}
              {text}
            </span>
          );
        },
      },
      group,
      tags,
      rate,
      annual,
      status,
    ];
  }

  return [
    name,
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
      render: (row) => potNameById.get(row.item?.potId) ?? row.item?.potId,
    },
    group,
    tags,
    {
      id: "turnus",
      label: "Turnus",
      sortValue: (row) => (isSinkingFund(row.item) ? turnusMonths(row.item) : null),
      // Ohne Turnus ist die Position eine Rücklage (freies Sparen) — das steht
      // hier statt eines „—", weil genau das die Position von einer
      // Rückstellung unterscheidet. Dasselbe Merkmal trägt die Trend-Übersicht.
      render: (row) => {
        if (!isSinkingFund(row.item)) {
          return (
            <span
              className="hb-fixed-free"
              title="Rücklage ohne Turnus — freies Sparen, zählt nicht zu den Fixkosten pro Monat"
            >
              Rücklage
            </span>
          );
        }
        const months = turnusMonths(row.item);
        return TURNUS_LABEL[months] || `Alle ${months} Monate`;
      },
    },
    {
      id: "cycleAmount",
      label: "Rechnungsbetrag",
      align: "right",
      // Nur mit Turnus gibt es eine Rechnung; bei einer Rücklage ist `amount`
      // der monatliche Transfer und stünde als „Rechnungsbetrag" irreführend da.
      sortValue: (row) => (isSinkingFund(row.item) ? Number(row.item.amount || 0) : null),
      render: (row) => (isSinkingFund(row.item) ? fmt(Number(row.item.amount || 0)) : null),
      summarize: (rows) =>
        fmt(sumBy(rows, (r) => (isSinkingFund(r.item) ? Number(r.item.amount || 0) : null))),
    },
    rate,
    annual,
    status,
  ];
}

/**
 * Spaltenkatalog einer der beiden Fixkosten-Tabellen.
 *
 * @param {"expense"|"transfer"} kind
 * @param {{ fmt: Function, categoryById: Map, potNameById: Map, groupNameById: Map }} ctx
 */
export function buildFixedCostColumns(kind, ctx) {
  const defaults = new Set(DEFAULT_COLUMNS[kind]);
  return catalog(kind, ctx).map((col) => ({ ...col, defaultVisible: defaults.has(col.id) }));
}
