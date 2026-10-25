// src/utils/bankCsvParser.js
//
// Liest den CSV-Export „Aktivitäten“ von Yuh für den Bankimport (F1, Nachtrag
// CSV). Liefert dieselbe Form wie `parseCamt`, damit Vorschläge und Dialog
// beide Formate gleich behandeln. Rein: Text rein, Objekt raus.
//
// Die Datei hat weder IBAN noch Bankreferenz noch Saldo. Das Konto bekommt
// deshalb einen festen Schlüssel, jede Buchung eine Ersatz-Referenz.

import { CamtParseError } from "./camtParser.js";

const ACCOUNT_CURRENCY = "CHF";

// Ein Wechsel darf so viele Tage nach der Kartenzahlung liegen.
export const FX_PAIR_MAX_DAYS = 5;

// Spalten, an denen das Profil erkannt wird (Kopfzeile, Groß-/Kleinschreibung egal).
const YUH_COLUMNS = {
  date: "DATE",
  type: "ACTIVITY TYPE",
  name: "ACTIVITY NAME",
  debit: "DEBIT",
  debitCurrency: "DEBIT CURRENCY",
  credit: "CREDIT",
  creditCurrency: "CREDIT CURRENCY",
  recipient: "RECIPIENT",
  sender: "SENDER",
  buySell: "BUY/SELL",
  asset: "ASSET",
};

const YUH_ACCOUNT = { iban: "CSV:YUH", currency: ACCOUNT_CURRENCY, ownerName: "", bankName: "Yuh" };

// Arten ohne eigene Geldbewegung in CHF — werden weggelassen.
const SKIPPED_TYPES = new Set(["REWARD_RECEIVED", "BANK_AUTO_ORDER_EXECUTED"]);
const FX_TYPE = "BANK_AUTO_ORDER_EXECUTED";

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Zerlegt CSV-Text in Zeilen und Felder (Quotes, `""` als Anführungszeichen, CRLF). */
export function tokenizeCsv(text, delimiter = ";") {
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// ── Felder ───────────────────────────────────────────────────────────────────

/** Yuh setzt Texte zusätzlich in Anführungszeichen: `"Händler"` → `Händler`. */
function cleanText(raw) {
  const s = String(raw ?? "").trim();
  const unwrapped = s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
  return unwrapped.replace(/\s+/g, " ").trim();
}

function parseNumber(raw) {
  const s = String(raw ?? "").replace(/['\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** „TT/MM/JJJJ“ → „JJJJ-MM-TT“; ungültig → "". */
function parseDate(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw ?? "").trim());
  if (!m) return "";
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? "" : iso;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toCents(n) {
  return Math.round(n * 100);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function classify(type) {
  if (type.startsWith("CARD_TRANSACTION")) return "card";
  if (type === "PAYMENT_TRANSACTION_OUT") return "transfer";
  if (type === "PAYMENT_TRANSACTION_IN") return "incoming";
  return "other";
}

function counterpartyOf(get, type) {
  const name = cleanText(get("name"));
  if (type === "PAYMENT_TRANSACTION_OUT") return cleanText(get("recipient")) || name;
  if (type === "PAYMENT_TRANSACTION_IN") return cleanText(get("sender")) || name;
  return name || cleanText(get("recipient"));
}

// ── Profil ───────────────────────────────────────────────────────────────────

/** Spaltenindex je Feld, oder null, wenn die Kopfzeile nicht zum Profil passt. */
function matchProfile(header) {
  const names = header.map((h) => cleanText(h).toUpperCase());
  const index = {};
  for (const [key, column] of Object.entries(YUH_COLUMNS)) {
    const i = names.indexOf(column);
    if (i < 0) return null;
    index[key] = i;
  }
  return index;
}

/** true, wenn der Text wie ein Yuh-Export beginnt (nur die Kopfzeile wird geprüft). */
export function isBankCsv(text) {
  const firstLine = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const header = tokenizeCsv(firstLine)[0];
  return !!header && matchProfile(header) != null;
}

// ── Fremdwährung ─────────────────────────────────────────────────────────────

/**
 * Ordnet Kartenzahlungen in Fremdwährung ihren Wechselzeilen zu: gleiche
 * Währung, gleicher Fremdbetrag, Wechsel 0–FX_PAIR_MAX_DAYS Tage danach. Jede
 * Wechselzeile höchstens einmal, nächstliegende Paare zuerst.
 * @returns {Map<object, number>} Transaktion → CHF-Betrag
 */
function pairForeignCards(cards, exchanges) {
  const pairs = [];
  cards.forEach((card, ci) => {
    exchanges.forEach((fx, fi) => {
      if (fx.currency !== card.original.currency) return;
      if (toCents(fx.foreignAmount) !== toCents(card.original.amount)) return;
      const diff = daysBetween(card.date, fx.date);
      if (diff >= 0 && diff <= FX_PAIR_MAX_DAYS) pairs.push({ ci, fi, diff });
    });
  });
  pairs.sort((a, b) => a.diff - b.diff || a.ci - b.ci || a.fi - b.fi);

  const result = new Map();
  const usedFx = new Set();
  for (const { ci, fi } of pairs) {
    if (result.has(cards[ci]) || usedFx.has(fi)) continue;
    result.set(cards[ci], exchanges[fi].amount);
    usedFx.add(fi);
  }
  return result;
}

// ── Einstieg ─────────────────────────────────────────────────────────────────

/**
 * Liest einen Yuh-CSV-Export.
 * @param {string} csvText
 * @returns {{
 *   format: "csv", version: string,
 *   account: { iban: string, currency: string, ownerName: string, bankName: string },
 *   period: { from: string, to: string },
 *   balances: { opening: null, closing: null },
 *   transactions: object[],
 *   warnings: { code: string, message: string }[],
 * }}
 * @throws {CamtParseError}
 */
export function parseBankCsv(csvText) {
  const rows = tokenizeCsv(csvText);
  if (rows.length === 0) throw new CamtParseError("empty", "Die Datei ist leer.");

  const index = matchProfile(rows[0]);
  if (!index) {
    throw new CamtParseError(
      "not-csv-profile",
      "Diese CSV-Datei hat kein bekanntes Format. Unterstützt wird der CSV-Export von Yuh."
    );
  }
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) throw new CamtParseError("no-entries", "Die Datei enthält keine Buchungen.");

  const transactions = [];
  const foreignCards = [];
  const exchanges = [];
  const dates = [];
  let skipped = 0;
  let invalidDate = 0;

  for (const fields of dataRows) {
    const get = (key) => fields[index[key]] ?? "";
    const type = cleanText(get("type")).toUpperCase();
    const date = parseDate(get("date"));
    if (date) dates.push(date);

    const debit = parseNumber(get("debit"));
    const credit = parseNumber(get("credit"));
    const debitCurrency = cleanText(get("debitCurrency")).toUpperCase();
    const creditCurrency = cleanText(get("creditCurrency")).toUpperCase();

    if (type === FX_TYPE) {
      if (date && debit && debitCurrency === ACCOUNT_CURRENCY && credit && creditCurrency) {
        exchanges.push({ date, amount: round2(Math.abs(debit)), foreignAmount: Math.abs(credit), currency: creditCurrency });
      }
      skipped++;
      continue;
    }
    if (SKIPPED_TYPES.has(type) || cleanText(get("buySell")) || cleanText(get("asset"))) {
      skipped++;
      continue;
    }

    let direction;
    let raw;
    let currency;
    if (debit) {
      direction = "debit";
      raw = Math.abs(debit);
      currency = debitCurrency;
    } else if (credit) {
      direction = "credit";
      raw = Math.abs(credit);
      currency = creditCurrency;
    } else {
      skipped++;
      continue;
    }

    const kind = classify(type);
    const foreign = currency !== ACCOUNT_CURRENCY;
    // Nur Kartenzahlungen in Fremdwährung lassen sich über den Wechsel in CHF umrechnen.
    if (foreign && !(kind === "card" && direction === "debit")) {
      skipped++;
      continue;
    }
    if (!date) {
      invalidDate++;
      continue;
    }

    const transaction = {
      ref: "",
      date,
      bookingDate: date,
      direction,
      amount: foreign ? null : round2(raw),
      currency: ACCOUNT_CURRENCY,
      original: foreign ? { amount: round2(raw), currency } : null,
      reversal: false,
      status: "BOOK",
      type: kind,
      counterparty: counterpartyOf(get, type),
      message: "",
      rawKey: `~${date}|${direction}|${raw.toFixed(2)}|${currency}`,
    };
    transactions.push(transaction);
    if (foreign) foreignCards.push(transaction);
  }

  const chfByCard = pairForeignCards(foreignCards, exchanges);
  let unpaired = 0;
  for (const card of foreignCards) {
    if (chfByCard.has(card)) card.amount = chfByCard.get(card);
    else unpaired++;
  }

  // Ersatz-Referenz aus den Rohwerten; gleiche Zeilen derselben Datei bekommen #2, #3 …
  const seen = new Map();
  for (const tx of transactions) {
    const base = `${tx.rawKey}|${tx.counterparty}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    tx.ref = n === 1 ? base : `${base}#${n}`;
    delete tx.rawKey;
  }

  const warnings = [];
  if (unpaired > 0) {
    warnings.push({
      code: "missing-amount",
      message:
        unpaired === 1
          ? "Für 1 Kartenzahlung in Fremdwährung fehlt der Währungswechsel; der Betrag in CHF ist unbekannt."
          : `Für ${unpaired} Kartenzahlungen in Fremdwährung fehlt der Währungswechsel; der Betrag in CHF ist unbekannt.`,
    });
  }
  if (skipped > 0) {
    warnings.push({
      code: "rows-skipped",
      message:
        skipped === 1
          ? "1 Zeile ohne Geldbewegung in CHF wurde weggelassen (Bonus, Währungswechsel, Handel)."
          : `${skipped} Zeilen ohne Geldbewegung in CHF wurden weggelassen (Bonus, Währungswechsel, Handel).`,
    });
  }
  if (invalidDate > 0) {
    warnings.push({
      code: "invalid-date",
      message:
        invalidDate === 1
          ? "1 Zeile ohne gültiges Datum wurde weggelassen."
          : `${invalidDate} Zeilen ohne gültiges Datum wurden weggelassen.`,
    });
  }

  if (transactions.length === 0) {
    throw new CamtParseError("no-entries", "Die Datei enthält keine Buchungen in CHF.");
  }

  dates.sort();
  return {
    format: "csv",
    version: "yuh",
    account: { ...YUH_ACCOUNT },
    period: { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" },
    balances: { opening: null, closing: null },
    transactions,
    warnings,
  };
}
