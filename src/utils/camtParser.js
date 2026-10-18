// src/utils/camtParser.js
//
// Liest einen Kontoauszug im Format camt.053 (ISO 20022) für den Bankimport (F1).
// camt.052 und camt.054 haben denselben `Ntry`-Aufbau und laufen mit.
// Rein: XML-Text rein, Objekt raus — nichts wird gespeichert.
//
// Elemente werden über `localName` gesucht, damit die Namespaces der Versionen
// .001.02 bis .001.08 keine Rolle spielen.

/** Fehler mit deutscher Meldung für den Import-Dialog; `code` für Tests und Logik. */
export class CamtParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CamtParseError";
    this.code = code;
  }
}

// Nachrichtentyp → Container der einzelnen Auszüge.
const MESSAGE_TYPES = {
  BkToCstmrStmt: { format: "camt.053", container: "Stmt" },
  BkToCstmrAcctRpt: { format: "camt.052", container: "Rpt" },
  BkToCstmrDbtCdtNtfctn: { format: "camt.054", container: "Ntfctn" },
};

// ── DOM-Helfer ───────────────────────────────────────────────────────────────

function childrenNamed(el, name) {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === name);
}

function child(el, name) {
  return childrenNamed(el, name)[0] ?? null;
}

/** Folgt einem Pfad direkter Kinder: path(ntry, "ValDt", "Dt"). */
function path(el, ...names) {
  let cur = el;
  for (const n of names) {
    cur = child(cur, n);
    if (!cur) return null;
  }
  return cur;
}

function text(el) {
  const t = el?.textContent?.trim() ?? "";
  return t === "NOTPROVIDED" ? "" : t;
}

function parseAmount(el) {
  if (!el) return null;
  const n = Number(text(el));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** `<Dt>` oder `<DtTm>` unterhalb von el → „JJJJ-MM-TT“. */
function parseDate(el) {
  if (!el) return "";
  const raw = text(child(el, "Dt")) || text(child(el, "DtTm"));
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
}

function direction(el) {
  const ind = text(child(el, "CdtDbtInd"));
  if (ind === "CRDT") return "credit";
  if (ind === "DBIT") return "debit";
  return null;
}

/** Name einer Partei — direkt (`Cdtr/Nm`) oder ab .001.08 unter `Pty`. */
function partyName(el) {
  if (!el) return "";
  return text(child(el, "Nm")) || text(path(el, "Pty", "Nm"));
}

// ── Textbereinigung ──────────────────────────────────────────────────────────

// Was vorne und hinten am Buchungstext weg muss, damit der Händler übrig bleibt.
// Eine andere Bank mit anderem Wortlaut → hier eine Zeile ergänzen.
const STRIP_PATTERNS = [
  // „Debitkarte Einkauf …“, „Debit Mastercard Gutschrift …“
  /^(?:Debitkarte|Debit Mastercard|Visa Debit|Maestro)(?:[\s-]+(?:Einkauf|Gutschrift|Rückvergütung|Bezug))?\s+/i,
  // „Belastung TWINT …“, „Gutschrift TWINT …“
  /^(?:Belastung|Gutschrift)\s+TWINT\s+/i,
  // Kaufdatum und -zeit am Anfang: „30.09.2026 07:47 “
  /^\d{2}\.\d{2}\.\d{2,4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s+/,
  // „Kartennummer: 535222******9428“ am Ende
  /\s*Kartennummer:?.*$/i,
  // Lange Referenznummer am Ende (TWINT)
  /\s+\d{10,}$/,
];

/** Bereinigt einen Buchungstext zum Händler- bzw. Empfängernamen. */
export function cleanCounterpartyText(raw) {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  for (const pattern of STRIP_PATTERNS) s = s.replace(pattern, "").trim();
  return s;
}

// ── Art der Buchung ──────────────────────────────────────────────────────────

function bankTxCode(el) {
  const domn = path(el, "BkTxCd", "Domn");
  return {
    domain: text(child(domn, "Cd")),
    family: text(path(domn, "Fmly", "Cd")),
    subFamily: text(path(domn, "Fmly", "SubFmlyCd")),
  };
}

function classify(code, rawText) {
  if (code.family === "CCRD" || code.family === "DCRD" || /Debitkarte|Kartennummer/i.test(rawText)) {
    return "card";
  }
  if (/\bTWINT\b/i.test(rawText)) return "twint";
  if (code.family === "ICDT") return code.subFamily === "STDO" ? "standing-order" : "transfer";
  if (code.family === "RCDT") return "incoming";
  return "other";
}

// ── Transaktion ──────────────────────────────────────────────────────────────

function remittance(tx) {
  return childrenNamed(path(tx, "RmtInf"), "Ustrd").map(text).filter(Boolean).join(" ");
}

function buildTransaction({ ntry, tx, ref, amount, accountCurrency }) {
  const dir = direction(tx) ?? direction(ntry);
  const code = tx && child(tx, "BkTxCd") ? bankTxCode(tx) : bankTxCode(ntry);
  const ustrd = remittance(tx);
  const addtlTx = text(child(tx, "AddtlTxInf"));
  const addtlNtry = text(child(ntry, "AddtlNtryInf"));
  const type = classify(code, [addtlTx, addtlNtry, ustrd].join(" "));

  let counterparty = "";
  let message = "";
  if (type === "card" || type === "twint") {
    counterparty = cleanCounterpartyText(addtlTx || addtlNtry || ustrd);
  } else {
    const parties = path(tx, "RltdPties");
    const name = dir === "credit" ? partyName(child(parties, "Dbtr")) : partyName(child(parties, "Cdtr"));
    if (name) {
      counterparty = name;
      message = ustrd;
    } else {
      counterparty = cleanCounterpartyText(ustrd || addtlTx || addtlNtry);
    }
  }
  if (message === counterparty) message = "";

  // Fremdwährung: Originalbetrag aus der Instruktion, gebucht wird der Kontobetrag.
  const instd = path(tx, "AmtDtls", "InstdAmt", "Amt");
  const instdCcy = instd?.getAttribute("Ccy") ?? "";
  const original =
    instd && instdCcy && instdCcy !== accountCurrency
      ? { amount: parseAmount(instd), currency: instdCcy }
      : null;

  return {
    ref,
    date: parseDate(child(ntry, "ValDt")) || parseDate(child(ntry, "BookgDt")),
    bookingDate: parseDate(child(ntry, "BookgDt")),
    direction: dir,
    amount,
    currency: accountCurrency,
    original,
    reversal: text(child(ntry, "RvslInd")) === "true",
    status: text(child(ntry, "Sts")),
    type,
    counterparty,
    message,
  };
}

/** Eine `Ntry` → eine Transaktion pro `TxDtls` (Sammelbuchungen einzeln). */
function parseEntry(ntry, accountCurrency, warnings) {
  const ntryRef = text(child(ntry, "AcctSvcrRef")) || text(child(ntry, "NtryRef"));
  const txs = childrenNamed(path(ntry, "NtryDtls"), "TxDtls").length
    ? childrenNamed(path(ntry, "NtryDtls"), "TxDtls")
    : [null];
  const ntryAmount = parseAmount(child(ntry, "Amt"));

  return txs.map((tx, i) => {
    let amount = ntryAmount;
    if (txs.length > 1) {
      // In Sammelbuchungen trägt jede TxDtls ihren eigenen Kontobetrag.
      const candidates = [child(tx, "Amt"), path(tx, "AmtDtls", "TxAmt", "Amt")];
      const own = candidates.find((el) => el && (el.getAttribute("Ccy") ?? accountCurrency) === accountCurrency);
      amount = parseAmount(own);
    }
    let ref = text(path(tx, "Refs", "AcctSvcrRef"));
    if (!ref && ntryRef) ref = txs.length > 1 ? `${ntryRef}#${i + 1}` : ntryRef;
    const transaction = buildTransaction({ ntry, tx, ref, amount, accountCurrency });
    if (!ref) {
      // Ohne Bankreferenz trotzdem stabil, damit „schon importiert“ greift.
      transaction.ref = `~${transaction.date}|${transaction.direction}|${amount}|${transaction.counterparty}`;
      warnings.push({
        code: "missing-ref",
        message: "Eine Buchung hat keine Bankreferenz; sie wird über Datum, Betrag und Text erkannt.",
      });
    }
    if (amount == null) {
      warnings.push({
        code: "missing-amount",
        message: `Für „${transaction.counterparty || transaction.ref}“ fehlt ein Betrag in Kontowährung.`,
      });
    }
    return transaction;
  });
}

// ── Saldo ────────────────────────────────────────────────────────────────────

function balance(stmt, codes) {
  for (const bal of childrenNamed(stmt, "Bal")) {
    const code = text(path(bal, "Tp", "CdOrPrtry", "Cd"));
    if (!codes.includes(code)) continue;
    const amount = parseAmount(child(bal, "Amt"));
    if (amount == null) continue;
    return direction(bal) === "debit" ? -amount : amount;
  }
  return null;
}

// ── Einstieg ─────────────────────────────────────────────────────────────────

/**
 * Liest einen camt-Kontoauszug.
 * @param {string} xmlText
 * @param {{ DOMParser?: typeof DOMParser }} [options] — für Umgebungen ohne globales `DOMParser`
 * @returns {{
 *   format: string, version: string,
 *   account: { iban: string, currency: string, ownerName: string, bankName: string },
 *   period: { from: string, to: string },
 *   balances: { opening: number|null, closing: number|null },
 *   transactions: object[],
 *   warnings: { code: string, message: string }[],
 * }}
 * @throws {CamtParseError}
 */
export function parseCamt(xmlText, { DOMParser: Parser = globalThis.DOMParser } = {}) {
  const source = String(xmlText ?? "").replace(/^\uFEFF/, "").trim();
  if (!source) throw new CamtParseError("empty", "Die Datei ist leer.");
  if (source.startsWith("{") || source.startsWith("[")) {
    throw new CamtParseError(
      "not-xml",
      "Das ist eine JSON-Datei (z. B. ein Backup), kein Kontoauszug. Bitte eine camt-Datei (.xml) wählen."
    );
  }

  const doc = new Parser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new CamtParseError("not-xml", "Die Datei ist kein gültiges XML. Bitte eine camt-Datei (.xml) wählen.");
  }

  const root = doc.documentElement;
  const message = root?.localName === "Document" ? Array.from(root.children).find((c) => MESSAGE_TYPES[c.localName]) : null;
  if (!message) {
    throw new CamtParseError(
      "not-camt",
      "Die Datei ist kein camt-Kontoauszug. Erwartet wird camt.053 (oder camt.052/.054) von der Bank."
    );
  }

  const { format, container } = MESSAGE_TYPES[message.localName];
  const nsMatch = /camt\.\d{3}\.(\d{3}\.\d{2})/.exec(root.namespaceURI ?? "");
  const version = nsMatch ? nsMatch[1] : "";

  const statements = childrenNamed(message, container);
  const ibans = new Set(statements.map((s) => text(path(s, "Acct", "Id", "IBAN"))));
  if (ibans.size > 1) {
    throw new CamtParseError(
      "multiple-accounts",
      "Die Datei enthält Auszüge mehrerer Konten. Bitte pro Konto eine eigene Datei exportieren."
    );
  }

  const first = statements[0];
  const last = statements[statements.length - 1];
  const acct = path(first, "Acct");
  const account = {
    iban: text(path(acct, "Id", "IBAN")) || text(path(acct, "Id", "Othr", "Id")),
    currency: text(child(acct, "Ccy")),
    ownerName: partyName(child(acct, "Ownr")),
    bankName: text(path(acct, "Svcr", "FinInstnId", "Nm")),
  };

  const warnings = [];
  const transactions = [];
  const entryDates = [];
  let pending = 0;
  let bookedNet = 0;
  let entryCount = 0;

  for (const stmt of statements) {
    for (const ntry of childrenNamed(stmt, "Ntry")) {
      entryCount++;
      const status = text(child(ntry, "Sts"));
      if (status === "PDNG" || status === "INFO") {
        pending++;
        continue;
      }
      if (!account.currency) account.currency = child(ntry, "Amt")?.getAttribute("Ccy") ?? "";
      const amount = parseAmount(child(ntry, "Amt")) ?? 0;
      bookedNet += direction(ntry) === "credit" ? amount : -amount;
      const booked = parseDate(child(ntry, "BookgDt"));
      if (booked) entryDates.push(booked);
      transactions.push(...parseEntry(ntry, account.currency, warnings));
    }
  }

  if (entryCount === 0) {
    throw new CamtParseError("no-entries", "Der Kontoauszug enthält keine Buchungen.");
  }
  if (pending > 0) {
    warnings.push({
      code: "pending-skipped",
      message:
        pending === 1
          ? "1 vorgemerkte Buchung wurde weggelassen; sie erscheint im nächsten Auszug."
          : `${pending} vorgemerkte Buchungen wurden weggelassen; sie erscheinen im nächsten Auszug.`,
    });
  }

  const opening = balance(first, ["OPBD", "PRCD", "OPAV"]);
  const closing = balance(last, ["CLBD", "CLAV"]);
  if (opening != null && closing != null && Math.abs(opening + bookedNet - closing) > 0.005) {
    warnings.push({
      code: "balance-mismatch",
      message: "Die Buchungen ergeben nicht den Schlusssaldo der Bank. Möglicherweise ist der Auszug unvollständig.",
    });
  }

  // Fehlende Referenzen nur einmal melden.
  const missingRef = warnings.findIndex((w) => w.code === "missing-ref");
  const dedupedWarnings = warnings.filter((w, i) => w.code !== "missing-ref" || i === missingRef);

  entryDates.sort();
  const period = {
    from: parseFromDtTm(path(first, "FrToDt", "FrDtTm")) || entryDates[0] || "",
    to: parseFromDtTm(path(last, "FrToDt", "ToDtTm")) || entryDates[entryDates.length - 1] || "",
  };

  return {
    format,
    version,
    account,
    period,
    balances: { opening, closing },
    transactions,
    warnings: dedupedWarnings,
  };
}

function parseFromDtTm(el) {
  const raw = text(el);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
}
