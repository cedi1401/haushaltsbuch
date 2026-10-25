// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseStatement } from '../statementParser.js';
import { CamtParseError } from '../camtParser.js';

// Erfundene Daten.
const YUH_HEADER =
  'DATE;ACTIVITY TYPE;ACTIVITY NAME;DEBIT;DEBIT CURRENCY;CREDIT;CREDIT CURRENCY;CARD NUMBER;LOCALITY;RECIPIENT;SENDER;FEES/COMMISSION;BUY/SELL;QUANTITY;ASSET;PRICE PER UNIT';
const YUH_CSV = `\uFEFF${YUH_HEADER}\n01/10/2026;CARD_TRANSACTION_OUT;"""Kiosk Beispiel""";-2.50;CHF;;;**** 1234;;"""Kiosk Beispiel""";;0.0;;;;\n`;

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt><Stmt>
    <Acct><Id><IBAN>CH9300762011623852957</IBAN></Id><Ccy>CHF</Ccy></Acct>
    <Ntry>
      <Amt Ccy="CHF">2.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
      <BookgDt><Dt>2026-10-01</Dt></BookgDt><ValDt><Dt>2026-10-01</Dt></ValDt>
      <AcctSvcrRef>REF1</AcctSvcrRef>
      <AddtlNtryInf>Debitkarte Einkauf Kiosk Beispiel</AddtlNtryInf>
    </Ntry>
  </Stmt></BkToCstmrStmt>
</Document>`;

const codeOf = (input) => {
  try {
    parseStatement(input);
  } catch (err) {
    expect(err).toBeInstanceOf(CamtParseError);
    expect(err.message).toBeTruthy();
    return err.code;
  }
  return null;
};

describe('parseStatement', () => {
  it('routes XML to the camt parser', () => {
    const result = parseStatement(CAMT);
    expect(result.format).toBe('camt.053');
    expect(result.transactions).toHaveLength(1);
  });

  it('routes the Yuh CSV to the CSV parser', () => {
    const result = parseStatement(YUH_CSV);
    expect(result.format).toBe('csv');
    expect(result.account.iban).toBe('CSV:YUH');
    expect(result.transactions[0].counterparty).toBe('Kiosk Beispiel');
  });

  it('rejects empty input', () => {
    expect(codeOf('')).toBe('empty');
    expect(codeOf('\uFEFF  ')).toBe('empty');
  });

  it('rejects JSON such as a backup file', () => {
    expect(codeOf('{"format":"haushaltsbuch-backup","version":2,"books":[]}')).toBe('not-statement');
  });

  it('rejects an unknown CSV layout', () => {
    expect(codeOf('Datum;Betrag;Text\n01.10.2026;9.50;Kaffee')).toBe('not-csv-profile');
  });

  it('rejects anything else', () => {
    expect(codeOf('Hallo Welt')).toBe('not-statement');
  });

  it('passes camt errors through', () => {
    expect(codeOf('<html><body/></html>')).toBe('not-camt');
  });
});
