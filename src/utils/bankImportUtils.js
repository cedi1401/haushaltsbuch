// src/utils/bankImportUtils.js
//
// Vorschläge für den Bankimport (F1): aus den Transaktionen von `parseCamt`
// werden Zeilen für den Import-Dialog, aus den angehakten Zeilen Buchungen.
// Rein: das Buch wird nur gelesen, nie verändert.
//
// Der Import legt ausschließlich Ausgaben und Einnahmen an und verknüpft nichts
// mit bestehenden Buchungen. Alles hier ist ein Vorschlag, den der Nutzer im
// Dialog pro Zeile überschreiben kann.

import { generateId } from "./idUtils.js";

// Ein Hinweis „ähnliche Buchung vorhanden“ greift bis zu so vielen Tagen Abstand.
export const SIMILAR_MAX_DAYS = 3;

// Diese Arten sind beim Einlesen angehakt (nur als Belastung); alles andere
// bucht der Nutzer meist selbst (Lohn, Fixkosten, Überträge).
const PRESELECTED_TYPES = new Set(["card", "twint"]);

// Hinweis-Codes einer Zeile; die Texte dazu liefert der Dialog.
export const ROW_HINTS = {
  alreadyImported: "already-imported",
  similar: "similar",
  suggested: "suggested",
  missingCategory: "missing-category",
  reversal: "reversal",
  missingAmount: "missing-amount",
};

function normalizeIban(iban) {
  return String(iban ?? "").replace(/\s+/g, "").toUpperCase();
}

function refKey(iban, ref) {
  return `${normalizeIban(iban)}|${ref}`;
}

/**
 * Schlüssel für „derselbe Händler“: klein, ohne Ziffern, ß = ss, Satzzeichen
 * als Leerzeichen. „Coop Pronto 3443“ und „Coop Pronto 6259“ → „coop pronto“.
 */
export function merchantKey(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/\d+/g, " ")
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
}

function daysBetween(a, b) {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

function findCategory(categories, categoryId) {
  return (categories || []).find((c) => c.id === categoryId) ?? null;
}

/** Kategorie + Unterkategorie, sofern beide (noch) existieren; sonst null bzw. ohne Unterkategorie. */
function validCategory(categories, categoryId, subcategoryId) {
  const cat = findCategory(categories, categoryId);
  if (!cat) return null;
  const sub = subcategoryId ? (cat.subcategories || []).find((s) => s.id === subcategoryId) : null;
  return { categoryId: cat.id, subcategoryId: sub ? sub.id : null };
}

function defaultIncomeCategory(book) {
  const cats = book?.incomeCategories || [];
  const cat = findCategory(cats, "cat_einnahmen") ?? cats[0] ?? null;
  return cat ? { categoryId: cat.id, subcategoryId: null } : { categoryId: null, subcategoryId: null };
}

/**
 * Kategorie-Vorschlag aus der zuletzt importierten Buchung desselben Händlers
 * und derselben Art. Maßgeblich ist, was heute an der Buchung steht — wurde sie
 * in der App umkategorisiert, gilt die neue Kategorie. Buchungen mit gelöschter
 * oder ohne Kategorie werden übersprungen.
 */
function suggestCategory(book, kind, key) {
  if (!key) return null;
  const categories = kind === "income" ? book?.incomeCategories : book?.expenseCategories;
  const entries = book?.entries || [];
  // Die Liste wächst durch Anhängen: weiter hinten = später importiert.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e?.bankRef || e.kind !== kind) continue;
    if (merchantKey(e.bankRef.text) !== key) continue;
    const valid = validCategory(categories, e.categoryId, e.subcategoryId);
    if (valid) return valid;
  }
  return null;
}

function formatForeignAmount(original) {
  return `${original.currency} ${Number(original.amount).toFixed(2)}`;
}

/** Notiz-Vorschlag: Händler bzw. Empfänger, bei Überweisungen mit Mitteilung, Fremdwährung in Klammern. */
export function suggestNote(transaction) {
  const parts = [transaction.counterparty, transaction.message].filter(Boolean);
  let note = parts.join(" · ");
  if (transaction.original && Number.isFinite(transaction.original.amount)) {
    const foreign = `(${formatForeignAmount(transaction.original)})`;
    note = note ? `${note} ${foreign}` : foreign;
  }
  return note;
}

/**
 * Ordnet Zeilen bestehenden Buchungen ohne `bankRef` zu, die schon erfasst sein
 * könnten: gleiche Art, gleicher Betrag, höchstens SIMILAR_MAX_DAYS Tage Abstand.
 * Jede Buchung dient höchstens einer Zeile als Hinweis, die nächstliegenden
 * Paare zuerst — zwei gleiche Kaffees erkennen so nicht dieselbe Buchung.
 * @returns {Map<number, object>} Zeilenindex → bestehende Buchung
 */
function matchSimilar(candidates, entries) {
  const manual = (entries || []).filter(
    (e) => e && !e.bankRef && (e.kind === "expense" || e.kind === "income") && e.date
  );
  const pairs = [];
  candidates.forEach(({ index, kind, cents, date }) => {
    for (const e of manual) {
      if (e.kind !== kind || toCents(e.amount) !== cents) continue;
      const diff = daysBetween(e.date, date);
      if (diff <= SIMILAR_MAX_DAYS) pairs.push({ index, entry: e, diff });
    }
  });
  pairs.sort((a, b) => a.diff - b.diff || a.index - b.index);

  const byRow = new Map();
  const used = new Set();
  for (const { index, entry } of pairs) {
    if (byRow.has(index) || used.has(entry)) continue;
    byRow.set(index, entry);
    used.add(entry);
  }
  return byRow;
}

/**
 * Baut die Zeilen des Import-Dialogs.
 *
 * Jede Zeile: `{ id, transaction, kind, selected, locked, categoryId,
 * subcategoryId, note, hints, similar }`. `locked` heißt nicht anhakbar
 * (schon importiert oder ohne Betrag); `similar` ist die vermutlich schon
 * erfasste Buchung (`{ id, date, note, amount }`) oder null.
 *
 * @param {{ transactions: object[], account: { iban: string } }} statement — Ergebnis von parseCamt
 * @param {object} book — aktives Buch
 */
export function buildImportRows(statement, book) {
  const iban = statement?.account?.iban ?? "";
  const imported = new Set(
    (book?.entries || []).filter((e) => e?.bankRef?.ref).map((e) => refKey(e.bankRef.iban, e.bankRef.ref))
  );

  const rows = (statement?.transactions || []).map((tx) => {
    const kind = tx.direction === "credit" ? "income" : "expense";
    const hints = [];
    const alreadyImported = imported.has(refKey(iban, tx.ref));
    const missingAmount = !(Number(tx.amount) > 0);

    let category = suggestCategory(book, kind, merchantKey(tx.counterparty));
    if (category) {
      hints.push(ROW_HINTS.suggested);
    } else if (kind === "income") {
      category = defaultIncomeCategory(book);
    } else {
      category = { categoryId: null, subcategoryId: null };
    }
    if (!category.categoryId) hints.push(ROW_HINTS.missingCategory);
    if (tx.reversal) hints.push(ROW_HINTS.reversal);
    if (missingAmount) hints.push(ROW_HINTS.missingAmount);
    if (alreadyImported) hints.unshift(ROW_HINTS.alreadyImported);

    const locked = alreadyImported || missingAmount;
    const preselected = PRESELECTED_TYPES.has(tx.type) && kind === "expense" && !tx.reversal;

    return {
      id: tx.ref,
      transaction: tx,
      kind,
      selected: preselected && !locked,
      locked,
      categoryId: category.categoryId,
      subcategoryId: category.subcategoryId,
      note: suggestNote(tx),
      hints,
      similar: null,
    };
  });

  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.locked && row.transaction.date)
    .map(({ row, index }) => ({
      index,
      kind: row.kind,
      cents: toCents(row.transaction.amount),
      date: row.transaction.date,
    }));
  for (const [index, entry] of matchSimilar(candidates, book?.entries)) {
    const row = rows[index];
    row.similar = { id: entry.id, date: entry.date, note: entry.note || "", amount: Number(entry.amount) };
    row.selected = false;
    row.hints.push(ROW_HINTS.similar);
  }

  return rows;
}

/**
 * Buchungen aus den angehakten Zeilen — normale Ausgaben/Einnahmen mit `bankRef`.
 * Gesperrte Zeilen werden auch dann übergangen, wenn sie angehakt sind.
 *
 * @param {object[]} rows — Zeilen aus buildImportRows, im Dialog bearbeitet
 * @param {{ iban: string }} account — `statement.account`
 * @param {object} book — für den Klartext-Kategorienamen (Legacy-Feld `category`)
 */
export function buildEntriesFromRows(rows, account, book) {
  const iban = normalizeIban(account?.iban);
  return (rows || [])
    .filter((row) => row.selected && !row.locked)
    .filter((row) => Number(row.transaction.amount) > 0 && row.transaction.date)
    .map((row) => {
      const { transaction: tx, kind } = row;
      const categories = kind === "income" ? book?.incomeCategories : book?.expenseCategories;
      const valid = validCategory(categories, row.categoryId, row.subcategoryId);
      const entry = {
        id: generateId("entry"),
        amount: Number(tx.amount),
        kind,
        note: String(row.note || "").trim(),
        date: tx.date,
        categoryId: valid?.categoryId ?? null,
        subcategoryId: valid?.subcategoryId ?? null,
        category: valid ? findCategory(categories, valid.categoryId).name : "",
        bankRef: { ref: tx.ref, iban, text: tx.counterparty || "" },
      };
      if (kind === "expense") entry.source = "month";
      return entry;
    });
}

/**
 * Was die Bücher schon über dieses Konto wissen — für den Dialogkopf.
 * @returns {{ lastImportedDate: string, otherBookNames: string[] }}
 *   `lastImportedDate`: jüngstes Datum einer importierten Buchung im Buch `bookId` ("" = noch nie);
 *   `otherBookNames`: andere Bücher, in die aus diesem Konto schon importiert wurde.
 */
export function getAccountImportStatus(books, bookId, iban) {
  const target = normalizeIban(iban);
  let lastImportedDate = "";
  const otherBookNames = [];
  for (const book of books || []) {
    const dates = (book?.entries || [])
      .filter((e) => e?.bankRef && normalizeIban(e.bankRef.iban) === target)
      .map((e) => e.date || "");
    if (dates.length === 0) continue;
    if (book.id === bookId) {
      lastImportedDate = dates.reduce((max, d) => (d > max ? d : max), "");
    } else {
      otherBookNames.push(book.name);
    }
  }
  return { lastImportedDate, otherBookNames };
}

/**
 * Zuletzt zugewiesene Kategorien für „Zuletzt verwendet“ im Picker.
 * Zuerst die Zuweisungen aus dem laufenden Dialog (`picks`, neueste zuerst),
 * dann die jüngsten Buchungen derselben Art im Buch. Ohne Doppelte, nur noch
 * existierende Kategorien (gelöschte Unterkategorie → Eintrag fällt weg).
 *
 * @param {object} book
 * @param {"expense"|"income"} kind
 * @param {{ categoryId: string, subcategoryId: string|null }[]} [picks]
 * @param {number} [limit]
 * @returns {{ categoryId: string, subcategoryId: string|null }[]}
 */
export function recentCategories(book, kind, picks = [], limit = 5) {
  const categories = kind === "income" ? book?.incomeCategories : book?.expenseCategories;
  const result = [];
  const seen = new Set();
  function add(categoryId, subcategoryId) {
    if (!categoryId || result.length >= limit) return;
    const valid = validCategory(categories, categoryId, subcategoryId);
    if (!valid || (subcategoryId && valid.subcategoryId !== subcategoryId)) return;
    const key = `${valid.categoryId}|${valid.subcategoryId || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(valid);
  }
  for (const p of picks) add(p.categoryId, p.subcategoryId);
  const entries = book?.entries || [];
  // Die Liste wächst durch Anhängen: weiter hinten = später erfasst.
  for (let i = entries.length - 1; i >= 0 && result.length < limit; i--) {
    const e = entries[i];
    if (e?.kind === kind) add(e.categoryId, e.subcategoryId);
  }
  return result;
}
