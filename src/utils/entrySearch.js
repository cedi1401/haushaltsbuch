// src/utils/entrySearch.js
//
// Suche in den Buchungen (App-Review F4): Notiz, Betrag und Kategorie.

import { findCategoryById } from "./hbUtils.js";
import { getTransferCategoryName } from "./transferCategoryUtils.js";

/**
 * Kleinbuchstaben, „ß“ als „ss“ — mit Schweizer Tastatur tippt man „ss“,
 * gespeichert sein kann beides.
 */
function normalizeText(text) {
  return String(text ?? "").toLocaleLowerCase("de").replace(/ß/g, "ss");
}

/**
 * Liest ein Suchwort als Betrag: „45“, „45.90“, „45,9“, „1'200“, „-45“.
 * @returns {{ whole: number } | { prefix: string } | null}
 *   `whole`: ganze Zahl, trifft jeden Betrag mit diesem Franken-/Euro-Anteil
 *   (45 trifft 45.00 und 45.90); `prefix`: mit Nachkommastellen, trifft den
 *   zweistelligen Betrag, der so beginnt (45.9 trifft 45.90).
 */
function parseAmountToken(token) {
  const cleaned = token.replace(/['’]/g, "").replace(",", ".").replace(/^[+\-−]/, "");
  if (/^\d+$/.test(cleaned)) return { whole: Number(cleaned) };
  if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    const [int, dec] = cleaned.split(".");
    return { prefix: `${Number(int)}.${dec}` };
  }
  return null;
}

function amountMatches(amount, query) {
  const abs = Math.abs(Number(amount) || 0);
  if ("whole" in query) return Math.trunc(abs) === query.whole;
  return abs.toFixed(2).startsWith(query.prefix);
}

/**
 * Durchsuchbarer Kategorietext einer Buchung: Ober- und Unterkategorie bei
 * Einnahmen/Ausgaben, die Sparposition bei Transfers/Entnahmen, sonst das
 * Legacy-Feld `category`.
 */
function categoryText(entry, expenseCategories, incomeCategories, transferCategories) {
  if (entry.kind === "expense" || entry.kind === "income") {
    const parent = findCategoryById(expenseCategories, incomeCategories, entry.categoryId);
    if (parent) {
      const sub = entry.subcategoryId
        ? (parent.subcategories || []).find((s) => s.id === entry.subcategoryId)
        : null;
      return sub ? `${parent.name} ${sub.name}` : parent.name;
    }
  } else if (entry.kind === "transfer" || entry.kind === "withdrawal") {
    return getTransferCategoryName(transferCategories, entry.transferCategoryId) || "";
  }
  return entry.category || "";
}

/**
 * Regulärer Ausdruck, der die Suchwörter im Anzeigetext findet (für die
 * Hervorhebung). „ss“ trifft auch „ß“, wie bei der Suche selbst.
 * @returns {RegExp|null} null bei leerer Anfrage
 */
export function searchHighlightPattern(query) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const parts = tokens
    .toSorted((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ss/g, "(?:ss|ß)"));
  return new RegExp(`(${parts.join("|")})`, "giu");
}

/**
 * Filtert Buchungen nach einer Suchanfrage. Mehrere Wörter müssen alle
 * vorkommen (UND); jedes Wort trifft, wenn es in Notiz oder Kategorie steht
 * oder — falls es eine Zahl ist — zum Betrag passt.
 *
 * @param {object[]} entries
 * @param {string} query
 * @param {{ expenseCategories?: object[], incomeCategories?: object[], transferCategories?: object[] }} categories
 * @returns {object[]} dieselbe Liste, wenn die Anfrage leer ist
 */
export function searchEntries(entries, query, { expenseCategories, incomeCategories, transferCategories } = {}) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return entries;

  const terms = tokens.map((token) => ({ token, amount: parseAmountToken(token) }));

  return (entries || []).filter((entry) => {
    const text = normalizeText(
      `${entry.note || ""} ${categoryText(entry, expenseCategories, incomeCategories, transferCategories)}`
    );
    return terms.every(
      ({ token, amount }) => text.includes(token) || (amount !== null && amountMatches(entry.amount, amount))
    );
  });
}
