// Schreibende Operationen auf book.investments — reine Funktionen:
// rein die alte Struktur, raus eine neue. Kein React, kein Speicherzugriff.
//
// Jede Operation läuft am Ende durch normalizeInvestments(). Das hält die
// Invarianten an einer Stelle (Sortierung nach Datum, Einheit passend zur
// Asset-Art, keine verwaisten Transaktionen), statt sie in jeder Aktion
// einzeln nachzubauen.

import {
  emptyInvestments,
  makeAsset,
  makeDepot,
  makeInvestmentTransaction,
  normalizeInvestments,
} from "./investmentModel.js";

function base(investments) {
  return investments && typeof investments === "object" && !Array.isArray(investments)
    ? { ...emptyInvestments(), ...investments }
    : emptyInvestments();
}

/** Depot anlegen. @returns {{investments: object, depot: object}|null} null bei leerem Namen */
export function addDepot(investments, fields) {
  const depot = makeDepot(fields);
  if (!depot) return null;
  const inv = base(investments);
  return {
    investments: normalizeInvestments({ ...inv, depots: [...inv.depots, depot] }),
    depot,
  };
}

/** Depot umbenennen oder Notiz ändern. */
export function updateDepot(investments, depotId, patch) {
  const inv = base(investments);
  return normalizeInvestments({
    ...inv,
    depots: inv.depots.map((d) => (d.id === depotId ? { ...d, ...patch, id: d.id } : d)),
  });
}

/**
 * Depot löschen — samt seiner Transaktionen. Assets bleiben stehen: sie sind
 * Stammdaten und können in anderen Depots weiterverwendet werden.
 */
export function removeDepot(investments, depotId) {
  const inv = base(investments);
  return normalizeInvestments({
    ...inv,
    depots: inv.depots.filter((d) => d.id !== depotId),
    transactions: inv.transactions.filter((t) => t.depotId !== depotId),
  });
}

/** Sucht einen Stammsatz über sein Symbol (case-insensitiv). */
export function findAssetBySymbol(investments, symbol) {
  const wanted = String(symbol || "").trim().toUpperCase();
  if (!wanted) return null;
  return base(investments).assets.find((a) => a.symbol === wanted) || null;
}

/**
 * Stammsatz anlegen. Existiert das Symbol bereits, kommt der vorhandene Satz
 * zurück — zwei Stammsätze für dasselbe Symbol würden die Bestände aufspalten.
 * @returns {{investments: object, asset: object, created: boolean}|null}
 */
export function addAsset(investments, fields) {
  const inv = base(investments);
  const existing = findAssetBySymbol(inv, fields?.symbol);
  if (existing) return { investments: inv, asset: existing, created: false };

  const asset = makeAsset(fields);
  if (!asset) return null;
  return {
    investments: normalizeInvestments({ ...inv, assets: [...inv.assets, asset] }),
    asset,
    created: true,
  };
}

/** Stammdaten eines Assets ändern (Name, Klasse, Handelswährung). */
export function updateAsset(investments, assetId, patch) {
  const inv = base(investments);
  return normalizeInvestments({
    ...inv,
    assets: inv.assets.map((a) => (a.id === assetId ? { ...a, ...patch, id: a.id } : a)),
  });
}

/** Stammsatz löschen — samt aller Transaktionen, die darauf zeigen. */
export function removeAsset(investments, assetId) {
  const inv = base(investments);
  return normalizeInvestments({
    ...inv,
    assets: inv.assets.filter((a) => a.id !== assetId),
    transactions: inv.transactions.filter((t) => t.assetId !== assetId),
  });
}

/** Transaktion erfassen. @returns {{investments: object, transaction: object}|null} */
export function addTransaction(investments, fields) {
  const tx = makeInvestmentTransaction(fields);
  if (!tx) return null;
  const inv = base(investments);
  return {
    investments: normalizeInvestments({ ...inv, transactions: [...inv.transactions, tx] }),
    transaction: tx,
  };
}

/**
 * Transaktion ändern. Gibt die alte Struktur unverändert zurück, wenn die
 * Änderung unbrauchbar wäre (z.B. Menge 0) — lieber nichts ändern als eine
 * Zeile stillschweigend verlieren.
 */
export function updateTransaction(investments, txId, patch) {
  const inv = base(investments);
  const current = inv.transactions.find((t) => t.id === txId);
  if (!current) return inv;

  const next = makeInvestmentTransaction({ ...current, ...patch, id: current.id });
  if (!next) return inv;

  return normalizeInvestments({
    ...inv,
    transactions: inv.transactions.map((t) => (t.id === txId ? next : t)),
  });
}

/** Transaktion löschen. */
export function removeTransaction(investments, txId) {
  const inv = base(investments);
  return normalizeInvestments({
    ...inv,
    transactions: inv.transactions.filter((t) => t.id !== txId),
  });
}

/** Wie viele Transaktionen hängen an einem Depot? Für Löschwarnungen. */
export function countDepotTransactions(investments, depotId) {
  return base(investments).transactions.filter((t) => t.depotId === depotId).length;
}

/** Wie viele Transaktionen hängen an einem Stammsatz? Für Löschwarnungen. */
export function countAssetTransactions(investments, assetId) {
  return base(investments).transactions.filter((t) => t.assetId === assetId).length;
}
