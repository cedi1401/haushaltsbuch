import React, { useEffect, useMemo, useRef, useState } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { AlertBar, Button, RangeTabs } from "../components/ui.jsx";
import { IconUpload } from "../components/icons.jsx";
import { useBaseCurrency, useFmt } from "../contexts/CurrencyContext.jsx";
import { useUndo } from "../contexts/UndoContext.js";
import { CamtParseError } from "../utils/camtParser.js";
import { parseStatement } from "../utils/statementParser.js";
import {
  ROW_HINTS,
  buildEntriesFromRows,
  buildImportRows,
  getAccountImportStatus,
  merchantKey,
  recentCategories,
} from "../utils/bankImportUtils.js";
import CategoryFlyout from "../components/CategoryFlyout.jsx";
import { formatDateDE } from "../utils/formatUtils.js";
import { EMPTY_ARRAY } from "../utils/constants.js";
import makeLogger from "../utils/logger.js";

const log = makeLogger("BankImport");

// Titel der Fehlermeldung je CamtParseError-Code; der Text kommt vom Parser.
const ERROR_TITLES = {
  empty: "Keine Buchungen gefunden",
  "no-entries": "Keine Buchungen gefunden",
  "not-xml": "Keine XML-Datei",
  "not-camt": "Kein camt.053-Kontoauszug",
  "multiple-accounts": "Mehrere Konten in einer Datei",
  "not-csv-profile": "Unbekanntes CSV-Format",
  "not-statement": "Kein Kontoauszug",
};

// Titel der Parser-Warnungen im Dialogkopf (gelb, blockieren nichts).
const WARNING_TITLES = {
  "balance-mismatch": "Saldo stimmt nicht",
  "pending-skipped": "Vorgemerkte Buchungen",
  "missing-ref": "Bankreferenz fehlt",
  "missing-amount": "Betrag fehlt",
  "rows-skipped": "Zeilen weggelassen",
  "invalid-date": "Datum ungültig",
};

// Ohne IBAN (CSV-Export) trägt das Konto einen festen Schlüssel „CSV:…“.
function accountLabel(iban) {
  return String(iban || "").startsWith("CSV:") ? "CSV" : shortIban(iban);
}

// Hinweis-Chips einer Zeile: Text und Färbung über die Modifier der Status-Pille.
const HINT_CHIPS = {
  [ROW_HINTS.alreadyImported]: { label: "Schon importiert", tone: "" },
  [ROW_HINTS.suggested]: { label: "Vorschlag", tone: "due" },
  [ROW_HINTS.similar]: { label: "Bereits erfasst?", tone: "behind" },
  [ROW_HINTS.missingCategory]: { label: "Kategorie fehlt", tone: "" },
  [ROW_HINTS.reversal]: { label: "Storno", tone: "" },
  [ROW_HINTS.missingAmount]: { label: "Betrag fehlt", tone: "overdue" },
};

// Diese Hinweise zählen für den Filter „Hinweise“ — „Vorschlag“ allein nicht.
const ATTENTION_HINTS = new Set([
  ROW_HINTS.similar,
  ROW_HINTS.missingCategory,
  ROW_HINTS.reversal,
  ROW_HINTS.missingAmount,
]);

function typeLabel(tx) {
  if (tx.direction === "credit" && tx.type === "card") return "Rückerstattung";
  switch (tx.type) {
    case "twint": return "TWINT";
    case "transfer": return "Überweisung";
    case "standing-order": return "Dauerauftrag";
    case "incoming": return "Gutschrift";
    default: return "";
  }
}

// "CH9300762011623852957" → "CH93 … 2957"
function shortIban(iban) {
  const s = String(iban || "").replace(/\s+/g, "");
  return s.length > 8 ? `${s.slice(0, 4)} … ${s.slice(-4)}` : s;
}

// "2026-10-16" → "16.10."
function shortDate(iso) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[2]}.${m[1]}.` : "";
}

function formatPeriod({ from, to }) {
  if (!from && !to) return "";
  if (from && to && from.slice(0, 4) === to.slice(0, 4)) {
    return `${shortDate(from)}–${formatDateDE(to)}`;
  }
  return `${formatDateDE(from)}–${formatDateDE(to)}`;
}

function categoryValue(row) {
  return row.categoryId ? `${row.categoryId}|${row.subcategoryId || ""}` : "";
}

function categoryLabel(categories, row) {
  const cat = (categories || []).find((c) => c.id === row.categoryId);
  if (!cat) return "";
  const sub = row.subcategoryId ? (cat.subcategories || []).find((s) => s.id === row.subcategoryId) : null;
  return sub ? `${cat.name} › ${sub.name}` : cat.name;
}

/**
 * Bankimport (F1): Kontoauszug (camt oder Yuh-CSV) einlesen, Zeilen prüfen und nur die angehakten als
 * Ausgaben/Einnahmen ins aktive Buch schreiben — ein Undo-Schritt.
 * Wird nur gemountet, solange er offen ist; Schließen verwirft alles.
 */
export default function BankImportDialog({ open, onClose, books, activeBook, patchActiveBook }) {
  const fmt = useFmt();
  const baseCurrency = useBaseCurrency();
  const undo = useUndo();
  const fileInputRef = useRef(null);
  const headCheckboxRef = useRef(null);

  const [statement, setStatement] = useState(null);
  const [rows, setRows] = useState(EMPTY_ARRAY);
  const [error, setError] = useState(null); // { title, message }
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState("all");
  // Zeile, deren Kategorie zuletzt geändert wurde — nur dort erscheint
  // „Auch für … übernehmen“.
  const [lastCategoryRowId, setLastCategoryRowId] = useState(null);

  // Im Dialog zugewiesene Kategorien, neueste zuerst — für „Zuletzt verwendet“.
  const [picks, setPicks] = useState({ expense: EMPTY_ARRAY, income: EMPTY_ARRAY });

  const expenseCategories = activeBook?.expenseCategories || EMPTY_ARRAY;
  const incomeCategories = activeBook?.incomeCategories || EMPTY_ARRAY;
  const recentExpense = useMemo(
    () => recentCategories(activeBook, "expense", picks.expense),
    [activeBook, picks.expense]
  );
  const recentIncome = useMemo(
    () => recentCategories(activeBook, "income", picks.income),
    [activeBook, picks.income]
  );

  async function readFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseStatement(text);
      setStatement(parsed);
      setRows(buildImportRows(parsed, activeBook));
      setError(null);
      setFilter("all");
      setLastCategoryRowId(null);
    } catch (e) {
      if (e instanceof CamtParseError) {
        setError({ title: ERROR_TITLES[e.code] || "Datei nicht lesbar", message: e.message });
      } else {
        log.error("Kontoauszug konnte nicht gelesen werden", e);
        setError({ title: "Datei nicht lesbar", message: "Die Datei konnte nicht gelesen werden." });
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function resetToDrop() {
    setStatement(null);
    setRows(EMPTY_ARRAY);
    setError(null);
  }

  const accountStatus = useMemo(
    () => (statement ? getAccountImportStatus(books, activeBook?.id, statement.account.iban) : null),
    [statement, books, activeBook?.id]
  );

  const currencyMismatch =
    !!statement?.account.currency && statement.account.currency !== baseCurrency;

  const selectableRows = rows.filter((r) => !r.locked);
  const selectedCount = selectableRows.filter((r) => r.selected).length;
  const attentionCount = rows.filter((r) => r.hints.some((h) => ATTENTION_HINTS.has(h))).length;

  const visibleRows = rows.filter((r) => {
    if (filter === "selected") return r.selected && !r.locked;
    if (filter === "hints") return r.hints.some((h) => ATTENTION_HINTS.has(h));
    return true;
  });
  const visibleSelectable = visibleRows.filter((r) => !r.locked);
  const visibleSelected = visibleSelectable.filter((r) => r.selected).length;
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelected === visibleSelectable.length;

  // Eine Datei, die neben der Ablagefläche landet, darf das Fenster nicht auf
  // die Datei umleiten (Electron erlaubt file://-Navigation).
  useEffect(() => {
    const block = (e) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  useEffect(() => {
    if (headCheckboxRef.current) {
      headCheckboxRef.current.indeterminate = visibleSelected > 0 && !allVisibleSelected;
    }
  }, [visibleSelected, allVisibleSelected]);

  function updateRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleAllVisible() {
    const ids = new Set(visibleSelectable.map((r) => r.id));
    const next = !allVisibleSelected;
    setRows((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, selected: next } : r)));
  }

  function changeCategory(row, next) {
    updateRow(row.id, next);
    setLastCategoryRowId(row.id);
    if (next.categoryId) {
      setPicks((prev) => ({ ...prev, [row.kind]: [next, ...prev[row.kind]] }));
    }
  }

  // Andere offene Zeilen desselben Händlers mit abweichender Kategorie.
  function sameMerchantRows(row) {
    const key = merchantKey(row.transaction.counterparty);
    if (!key) return EMPTY_ARRAY;
    return rows.filter(
      (r) =>
        r.id !== row.id &&
        !r.locked &&
        r.kind === row.kind &&
        merchantKey(r.transaction.counterparty) === key &&
        categoryValue(r) !== categoryValue(row)
    );
  }

  function applyCategoryToSameMerchant(row) {
    const ids = new Set(sameMerchantRows(row).map((r) => r.id));
    setRows((prev) =>
      prev.map((r) =>
        ids.has(r.id) ? { ...r, categoryId: row.categoryId, subcategoryId: row.subcategoryId } : r
      )
    );
    setLastCategoryRowId(null);
  }

  const canImport = !!statement && selectedCount > 0 && !currencyMismatch;

  function handleImport() {
    if (!canImport) return;
    const newEntries = buildEntriesFromRows(rows, statement.account, activeBook);
    if (newEntries.length === 0) return;
    patchActiveBook((b) => ({ ...b, entries: [...(b.entries || []), ...newEntries] }));
    undo.offer(newEntries.length === 1 ? "1 Buchung importiert." : `${newEntries.length} Buchungen importiert.`);
    onClose();
  }

  function renderRow(row) {
    const tx = row.transaction;
    const categories = row.kind === "income" ? incomeCategories : expenseCategories;
    const isIncome = row.kind === "income";
    const meta = [typeLabel(tx), tx.original ? `${tx.original.currency} ${Number(tx.original.amount).toFixed(2)}` : ""]
      .filter(Boolean)
      .join(" · ");
    const others = row.id === lastCategoryRowId ? sameMerchantRows(row) : EMPTY_ARRAY;
    const amountText = Number(tx.amount) > 0 ? `${isIncome ? "+" : "−"}${fmt(Number(tx.amount))}` : "—";

    return (
      <tr key={row.id} className={row.locked ? "hb-bankimport-row--locked" : undefined}>
        <td className="hb-bankimport-col-check">
          <input
            type="checkbox"
            checked={row.selected && !row.locked}
            disabled={row.locked}
            onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
            aria-label={`${tx.counterparty || "Buchung"} vom ${formatDateDE(tx.date)} importieren`}
          />
        </td>
        <td className="hb-col-date">{formatDateDE(tx.date)}</td>
        <td className="hb-bankimport-col-text">
          <div className="hb-bankimport-text">{tx.counterparty || "—"}</div>
          {(meta || row.hints.length > 0) && (
            <div className="hb-bankimport-meta">
              {meta && <span className="hb-muted hb-muted--sm">{meta}</span>}
              {row.hints.map((code) => {
                const chip = HINT_CHIPS[code];
                if (!chip) return null;
                return (
                  <span
                    key={code}
                    className={`hb-badge hb-res-pill${chip.tone ? ` hb-res-pill--${chip.tone}` : ""}`}
                  >
                    {chip.label}
                  </span>
                );
              })}
              {row.similar && (
                <span className="hb-muted hb-muted--sm">
                  {[shortDate(row.similar.date), row.similar.note, fmt(row.similar.amount)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="hb-col-category">
          {row.locked ? (
            <span className="hb-bankimport-static">{categoryLabel(categories, row) || "—"}</span>
          ) : (
            <>
              <CategoryFlyout
                value={{ categoryId: row.categoryId, subcategoryId: row.subcategoryId }}
                categories={categories}
                recent={row.kind === "income" ? recentIncome : recentExpense}
                onChange={(next) => changeCategory(row, next)}
              />
              {others.length > 0 && (
                <button
                  type="button"
                  className="hb-link-btn hb-bankimport-apply"
                  onClick={() => applyCategoryToSameMerchant(row)}
                >
                  Auch für {others.length} weitere „{tx.counterparty}“ übernehmen
                </button>
              )}
            </>
          )}
        </td>
        <td className="hb-col-note">
          {row.locked ? (
            <span className="hb-bankimport-static">{row.note || "—"}</span>
          ) : (
            <input
              className="hb-input"
              type="text"
              placeholder="Notiz"
              value={row.note}
              onChange={(e) => updateRow(row.id, { note: e.target.value })}
              aria-label="Notiz"
            />
          )}
        </td>
        <td className={`hb-col-amount hb-right ${isIncome ? "hb-ok" : "hb-bad"}`}>{amountText}</td>
      </tr>
    );
  }

  function renderDropZone() {
    return (
      <>
        {error && <AlertBar title={error.title} message={error.message} />}
        <div
          className={`hb-empty hb-bankimport-drop${dragOver ? " hb-bankimport-drop--over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            readFile(e.dataTransfer.files?.[0]);
          }}
        >
          <div className="hb-empty-icon"><IconUpload /></div>
          <div className="hb-empty-title">Kontoauszug hierher ziehen</div>
          <div className="hb-empty-text">
            oder Datei auswählen. Nichts wird gespeichert, bevor du die Buchungen geprüft und bestätigt hast.
          </div>
          <div className="hb-info-pills hb-bankimport-formats">
            <span className="hb-muted">Unterstützte Formate:</span>
            <span className="hb-info-pill">camt.053 (.xml)</span>
            <span className="hb-info-pill">.csv</span>
          </div>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Datei auswählen
          </Button>
        </div>
      </>
    );
  }

  function renderStatement() {
    const { account, period, warnings } = statement;
    const otherBooks = accountStatus?.otherBookNames || EMPTY_ARRAY;
    const onlyOtherBooks = otherBooks.length > 0 && !accountStatus?.lastImportedDate;
    return (
      <>
        <div className="hb-bankimport-head">
          <div className="hb-info-pills">
            {account.bankName && <span className="hb-info-pill">{account.bankName}</span>}
            {account.iban && <span className="hb-info-pill">{accountLabel(account.iban)}</span>}
            {formatPeriod(period) && <span className="hb-info-pill">{formatPeriod(period)}</span>}
            <span className="hb-info-pill">
              {rows.length === 1 ? "1 Buchung" : `${rows.length} Buchungen`}
            </span>
            <button type="button" className="hb-link-btn hb-bankimport-other" onClick={resetToDrop}>
              Andere Datei wählen
            </button>
          </div>
          {accountStatus?.lastImportedDate && (
            <div className="hb-muted hb-muted--sm">
              Zuletzt aus diesem Konto importiert bis {formatDateDE(accountStatus.lastImportedDate)}
            </div>
          )}
        </div>

        <div className="hb-bankimport-alerts">
          {currencyMismatch && (
            <AlertBar
              compact
              title={`Kontowährung ${account.currency} passt nicht zum Buch (${baseCurrency})`}
              message="Import nicht möglich. Bitte das passende Buch wählen."
            />
          )}
          {onlyOtherBooks && (
            <AlertBar
              compact
              tone="warning"
              title="Anderes Buch"
              message={`Aus diesem Konto wurde bisher in „${otherBooks.join("“, „")}“ importiert.`}
            />
          )}
          {warnings.map((w) => (
            <AlertBar
              key={w.code}
              compact
              tone="warning"
              title={WARNING_TITLES[w.code] || "Hinweis"}
              message={w.message}
            />
          ))}
        </div>

        <RangeTabs
          ariaLabel="Zeilen filtern"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Alle ${rows.length}` },
            { value: "selected", label: `Angehakt ${selectedCount}` },
            { value: "hints", label: `Hinweise ${attentionCount}` },
          ]}
        />

        {visibleRows.length === 0 ? (
          <div className="hb-empty hb-empty--sm">
            <div className="hb-empty-title">
              {filter === "selected" ? "Keine Zeile angehakt" : "Keine Hinweise"}
            </div>
          </div>
        ) : (
          <div className="hb-table-wrap">
            <table className="hb-table hb-entries-table hb-bankimport-table">
              <thead>
                <tr>
                  <th className="hb-bankimport-col-check">
                    <input
                      ref={headCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={visibleSelectable.length === 0}
                      onChange={toggleAllVisible}
                      aria-label="Alle anhaken oder abwählen"
                    />
                  </th>
                  <th className="hb-col-date">Datum</th>
                  <th className="hb-bankimport-col-text">Buchung</th>
                  <th className="hb-col-category">Kategorie</th>
                  <th className="hb-col-note">Notiz</th>
                  <th className="hb-col-amount hb-right">Betrag</th>
                </tr>
              </thead>
              <tbody>{visibleRows.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <EditDialog
      open={open}
      title="Kontoauszug importieren"
      onClose={onClose}
      onSave={handleImport}
      canSave={canImport}
      saveLabel="Importieren"
      size="full"
      footerStart={
        statement && (
          <span className="hb-muted hb-bankimport-count">
            {selectedCount} von {rows.length} Buchungen importieren
          </span>
        )
      }
    >
      <div className="hb-bankimport">
        {statement ? renderStatement() : renderDropZone()}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.csv,application/xml,text/xml,text/csv"
          style={{ display: "none" }}
          onChange={(e) => readFile(e.target.files?.[0])}
        />
      </div>
    </EditDialog>
  );
}
