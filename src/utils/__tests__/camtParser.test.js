// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseCamt, cleanCounterpartyText, CamtParseError } from '../camtParser.js';

// Erfundene Daten: Test-IBANs, erfundene Namen und Händler.
const IBAN = 'CH9300762011623852957';

function bkTxCd(family, subFamily) {
  return `<BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${family}</Cd><SubFmlyCd>${subFamily}</SubFmlyCd></Fmly></Domn></BkTxCd>`;
}

function ntry({
  amount,
  dir = 'DBIT',
  status = 'BOOK',
  reversal = false,
  booking = '2026-10-01',
  value = booking,
  ref = 'REF1',
  code = bkTxCd('CCRD', 'POSD'),
  txDetails,
  addtlNtryInf = '',
}) {
  return `<Ntry>
    <Amt Ccy="CHF">${amount}</Amt><CdtDbtInd>${dir}</CdtDbtInd><RvslInd>${reversal}</RvslInd>
    <Sts>${status}</Sts><BookgDt><Dt>${booking}</Dt></BookgDt><ValDt><Dt>${value}</Dt></ValDt>
    <AcctSvcrRef>${ref}</AcctSvcrRef>${code}
    ${txDetails === undefined ? '' : `<NtryDtls>${txDetails}</NtryDtls>`}
    ${addtlNtryInf ? `<AddtlNtryInf>${addtlNtryInf}</AddtlNtryInf>` : ''}
  </Ntry>`;
}

function tx({ ref, amount, ccy = 'CHF', dir = 'DBIT', parties = '', ustrd = '', addtl = '', amtDtls = '' }) {
  return `<TxDtls>
    <Refs>${ref ? `<AcctSvcrRef>${ref}</AcctSvcrRef>` : ''}<EndToEndId>NOTPROVIDED</EndToEndId></Refs>
    ${amount != null ? `<Amt Ccy="${ccy}">${amount}</Amt>` : ''}<CdtDbtInd>${dir}</CdtDbtInd>
    ${amtDtls}
    ${parties ? `<RltdPties>${parties}</RltdPties>` : ''}
    ${ustrd ? `<RmtInf><Ustrd>${ustrd}</Ustrd></RmtInf>` : ''}
    ${addtl ? `<AddtlTxInf>${addtl}</AddtlTxInf>` : ''}
  </TxDtls>`;
}

function camt(entries, {
  version = '001.04',
  message = 'BkToCstmrStmt',
  container = 'Stmt',
  camtType = '053',
  opening = '100.00',
  closing = null,
  iban = IBAN,
  extraStatements = '',
} = {}) {
  const balances = [
    opening != null && `<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">${opening}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-09-30</Dt></Dt></Bal>`,
    closing != null && `<Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="CHF">${closing}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-17</Dt></Dt></Bal>`,
  ].filter(Boolean).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.${camtType}.${version}">
  <${message}>
    <GrpHdr><MsgId>1</MsgId></GrpHdr>
    <${container}>
      <Id>1</Id>
      <FrToDt><FrDtTm>2026-10-01T00:00:00</FrDtTm><ToDtTm>2026-10-17T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>${iban}</IBAN></Id><Ccy>CHF</Ccy>
        <Ownr><Nm>Erika Muster</Nm><PstlAdr><AdrLine>Teststrasse 1</AdrLine></PstlAdr></Ownr>
        <Svcr><FinInstnId><BICFI>TESTCH22</BICFI><Nm>Testbank Genossenschaft</Nm></FinInstnId></Svcr>
      </Acct>
      ${balances}
      ${entries.join('\n')}
    </${container}>
    ${extraStatements}
  </${message}>
</Document>`;
}

const ownerParty = '<Cdtr><Nm>Erika Muster</Nm><PstlAdr><AdrLine>Teststrasse 1</AdrLine></PstlAdr></Cdtr>';

const cardEntry = ntry({
  amount: '9.5',
  booking: '2026-10-01',
  value: '2026-09-30',
  ref: 'ZV1/100',
  txDetails: tx({
    ref: 'ZV1/100/1',
    amount: '9.5',
    parties: `<Dbtr><Nm>NOTPROVIDED</Nm></Dbtr>${ownerParty}`,
    ustrd: '30.09.2026 07:47 Beispiel Kiosk 1234 Kartennummer: 123456******0000 ',
    addtl: 'Debitkarte Einkauf 30.09.2026 07:47 Beispiel Kiosk 1234 Kartennummer: 123456******0000',
  }),
  addtlNtryInf: 'Debitkarte Einkauf 30.09.2026 07:47 Beispiel Kiosk 1234 Kartennummer: 123456******0000',
});

const twintEntry = ntry({
  amount: '.2',
  ref: 'ZV2/200',
  code: bkTxCd('ICDT', 'OTHR'),
  txDetails: tx({
    ref: 'ZV2/200/1',
    amount: '.2',
    parties: '<Cdtr><Nm>Testbank Genossenschaft</Nm></Cdtr>',
    addtl: 'Belastung TWINT Parkplatz-TWINT 0400001234567890',
  }),
});

const transferEntry = ntry({
  amount: '1000',
  ref: 'ZV3/300',
  code: bkTxCd('ICDT', 'OTHR'),
  txDetails: tx({
    ref: 'ZV3/300/1',
    amount: '1000',
    parties: '<Dbtr><Nm>Erika Muster</Nm></Dbtr><Cdtr><Nm>Max Beispiel</Nm></Cdtr><CdtrAcct><Id><IBAN>CH5604835012345678009</IBAN></Id></CdtrAcct>',
    ustrd: 'Rückzahlung Darlehen',
    addtl: 'Vergütung',
  }),
});

const standingOrderEntry = ntry({
  amount: '5.7',
  ref: 'ZV4/400',
  code: bkTxCd('ICDT', 'STDO'),
  txDetails: tx({
    ref: 'ZV4/400/1',
    amount: '5.7',
    parties: '<Dbtr><Nm>Erika Muster</Nm></Dbtr><Cdtr><Nm>Hans Probe</Nm></Cdtr>',
    ustrd: 'Streaming-Abo',
    addtl: 'Dauerauftrag',
  }),
});

const incomingEntry = ntry({
  amount: '500',
  dir: 'CRDT',
  ref: 'ZV5/500',
  code: bkTxCd('RCDT', 'OTHR'),
  txDetails: tx({
    ref: 'ZV5/500/1',
    amount: '500',
    dir: 'CRDT',
    parties: `<Dbtr><Nm>Muster Erika</Nm></Dbtr><DbtrAcct><Id><IBAN>CH4431999123000889012</IBAN></Id></DbtrAcct>${ownerParty}`,
    addtl: 'Vergütung',
  }),
});

const foreignEntry = ntry({
  amount: '44.4',
  ref: 'ZV6/600',
  txDetails: tx({
    ref: 'ZV6/600/1',
    amount: '44.4',
    amtDtls: '<AmtDtls><InstdAmt><Amt Ccy="USD">51.76</Amt></InstdAmt><CntrValAmt><Amt Ccy="CHF">43.85</Amt></CntrValAmt></AmtDtls>',
    addtl: 'Debitkarte Einkauf 08.10.2026 01:37 EXAMPLESOFT Kartennummer: 123456******0000',
  }),
});

const one = (xml) => parseCamt(xml).transactions[0];

describe('parseCamt — Kopfdaten', () => {
  it('reads format, version, account, period and balances', () => {
    const result = parseCamt(camt([cardEntry], { opening: '100.00', closing: '90.50' }));
    expect(result.format).toBe('camt.053');
    expect(result.version).toBe('001.04');
    expect(result.account).toEqual({
      iban: IBAN,
      currency: 'CHF',
      ownerName: 'Erika Muster',
      bankName: 'Testbank Genossenschaft',
    });
    expect(result.period).toEqual({ from: '2026-10-01', to: '2026-10-17' });
    expect(result.balances).toEqual({ opening: 100, closing: 90.5 });
    expect(result.warnings).toEqual([]);
  });

  it('handles version .001.08 with nested party names and status codes', () => {
    const entry = ntry({
      amount: '20',
      code: bkTxCd('ICDT', 'OTHR'),
      txDetails: tx({
        ref: 'R8/1',
        amount: '20',
        parties: '<Cdtr><Pty><Nm>Max Beispiel</Nm></Pty></Cdtr>',
        ustrd: 'Geschenk',
      }),
    }).replace('<Sts>BOOK</Sts>', '<Sts><Cd>BOOK</Cd></Sts>');
    const result = parseCamt(camt([entry], { version: '001.08' }));
    expect(result.version).toBe('001.08');
    expect(result.transactions[0]).toMatchObject({
      status: 'BOOK',
      type: 'transfer',
      counterparty: 'Max Beispiel',
      message: 'Geschenk',
    });
  });

  it('reads camt.054 notifications with the same entry layout', () => {
    const result = parseCamt(
      camt([cardEntry], { message: 'BkToCstmrDbtCdtNtfctn', container: 'Ntfctn', camtType: '054', opening: null })
    );
    expect(result.format).toBe('camt.054');
    expect(result.transactions).toHaveLength(1);
    expect(result.balances).toEqual({ opening: null, closing: null });
  });

  it('reads camt.052 reports', () => {
    const result = parseCamt(camt([cardEntry], { message: 'BkToCstmrAcctRpt', container: 'Rpt', camtType: '052' }));
    expect(result.format).toBe('camt.052');
    expect(result.transactions).toHaveLength(1);
  });

  it('accepts a byte order mark and documents without namespace', () => {
    const xml = '\uFEFF' + camt([cardEntry]).replace(/ xmlns="[^"]*"/, '');
    const result = parseCamt(xml);
    expect(result.version).toBe('');
    expect(result.transactions).toHaveLength(1);
  });
});

describe('parseCamt — Arten und Text', () => {
  it('reads a debit card purchase with value date and cleaned merchant', () => {
    expect(one(camt([cardEntry]))).toEqual({
      ref: 'ZV1/100/1',
      date: '2026-09-30',
      bookingDate: '2026-10-01',
      direction: 'debit',
      amount: 9.5,
      currency: 'CHF',
      original: null,
      reversal: false,
      status: 'BOOK',
      type: 'card',
      counterparty: 'Beispiel Kiosk 1234',
      message: '',
    });
  });

  it('reads TWINT and strips the reference number', () => {
    expect(one(camt([twintEntry]))).toMatchObject({
      type: 'twint',
      amount: 0.2,
      counterparty: 'Parkplatz-TWINT',
      message: '',
    });
  });

  it('reads a transfer with creditor name and message', () => {
    expect(one(camt([transferEntry]))).toMatchObject({
      type: 'transfer',
      direction: 'debit',
      amount: 1000,
      counterparty: 'Max Beispiel',
      message: 'Rückzahlung Darlehen',
    });
  });

  it('reads a standing order', () => {
    expect(one(camt([standingOrderEntry]))).toMatchObject({
      type: 'standing-order',
      counterparty: 'Hans Probe',
      message: 'Streaming-Abo',
    });
  });

  it('reads an incoming payment with the debtor as counterparty', () => {
    expect(one(camt([incomingEntry]))).toMatchObject({
      type: 'incoming',
      direction: 'credit',
      amount: 500,
      counterparty: 'Muster Erika',
      message: '',
    });
  });

  it('keeps the account amount for foreign currency and reports the original', () => {
    expect(one(camt([foreignEntry]))).toMatchObject({
      type: 'card',
      amount: 44.4,
      currency: 'CHF',
      original: { amount: 51.76, currency: 'USD' },
      counterparty: 'EXAMPLESOFT',
    });
  });

  it('classifies a card refund as credit card transaction', () => {
    const refund = ntry({
      amount: '15',
      dir: 'CRDT',
      txDetails: tx({
        ref: 'RF/1',
        amount: '15',
        dir: 'CRDT',
        addtl: 'Debitkarte Gutschrift 05.10.2026 12:00 Beispiel Sport AG Kartennummer: 123456******0000',
      }),
    });
    expect(one(camt([refund]))).toMatchObject({
      type: 'card',
      direction: 'credit',
      counterparty: 'Beispiel Sport AG',
    });
  });

  it('falls back to the text when a transfer has no party name', () => {
    const entry = ntry({
      amount: '30',
      code: bkTxCd('ICDT', 'OTHR'),
      txDetails: tx({ ref: 'N/1', amount: '30', ustrd: 'Spende Verein' }),
    });
    expect(one(camt([entry]))).toMatchObject({ type: 'transfer', counterparty: 'Spende Verein', message: '' });
  });

  it('uses Ustrd, then AddtlTxInf, then AddtlNtryInf for other types', () => {
    const code = bkTxCd('ACMT', 'OTHR');
    const withUstrd = ntry({ amount: '1', code, txDetails: tx({ ref: 'O/1', amount: '1', ustrd: 'Kontogebühr', addtl: 'Spesen' }) });
    const withAddtl = ntry({ amount: '1', code, txDetails: tx({ ref: 'O/2', amount: '1', addtl: 'Spesen' }) });
    const withEntryInfo = ntry({ amount: '1', code, txDetails: tx({ ref: 'O/3', amount: '1' }), addtlNtryInf: 'Jahresgebühr' });
    expect(one(camt([withUstrd]))).toMatchObject({ type: 'other', counterparty: 'Kontogebühr' });
    expect(one(camt([withAddtl]))).toMatchObject({ counterparty: 'Spesen' });
    expect(one(camt([withEntryInfo]))).toMatchObject({ counterparty: 'Jahresgebühr' });
  });

  it('recognises TWINT and cards by text when the bank code is missing', () => {
    const twint = ntry({ amount: '5', code: '', txDetails: tx({ ref: 'T/1', amount: '5', addtl: 'Belastung TWINT Beispiel Café 0400009999999999' }) });
    const card = ntry({ amount: '5', code: '', addtlNtryInf: 'Debitkarte Einkauf 01.10.2026 10:00 Bäckerei Probe Kartennummer: 1' });
    expect(one(camt([twint]))).toMatchObject({ type: 'twint', counterparty: 'Beispiel Café' });
    expect(one(camt([card]))).toMatchObject({ type: 'card', counterparty: 'Bäckerei Probe', ref: 'REF1' });
  });
});

describe('parseCamt — Sonderfälle', () => {
  it('splits a batch entry into one transaction per TxDtls', () => {
    const batch = ntry({
      amount: '30',
      ref: 'B/1',
      code: bkTxCd('ICDT', 'OTHR'),
      txDetails:
        tx({ amount: '10', parties: '<Cdtr><Nm>Empfänger A</Nm></Cdtr>' }) +
        tx({ ref: 'B/1/2', amount: '20', parties: '<Cdtr><Nm>Empfänger B</Nm></Cdtr>' }),
    });
    const result = parseCamt(camt([batch], { opening: '100', closing: '70' }));
    expect(result.transactions.map((t) => [t.ref, t.amount, t.counterparty])).toEqual([
      ['B/1#1', 10, 'Empfänger A'],
      ['B/1/2', 20, 'Empfänger B'],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('marks reversals', () => {
    const storno = ntry({ amount: '9.5', dir: 'CRDT', reversal: true, txDetails: tx({ ref: 'S/1', amount: '9.5', dir: 'CRDT', addtl: 'Debitkarte Einkauf 01.10.2026 10:00 Beispiel Kiosk' }) });
    expect(one(camt([storno]))).toMatchObject({ reversal: true, direction: 'credit' });
  });

  it('skips pending entries with a warning', () => {
    const pending = ntry({ amount: '50', status: 'PDNG', ref: 'P/1', txDetails: tx({ ref: 'P/1/1', amount: '50' }) });
    const result = parseCamt(camt([cardEntry, pending], { opening: '100', closing: '90.5' }));
    expect(result.transactions.map((t) => t.ref)).toEqual(['ZV1/100/1']);
    expect(result.warnings.map((w) => w.code)).toEqual(['pending-skipped']);
  });

  it('uses the entry without TxDtls and synthesises a ref when none exists', () => {
    const bare = ntry({ amount: '12', ref: '', addtlNtryInf: 'Debitkarte Einkauf 02.10.2026 09:00 Beispiel Laden' });
    const bare2 = ntry({ amount: '13', ref: '', addtlNtryInf: 'Debitkarte Einkauf 02.10.2026 09:00 Anderer Laden' });
    const result = parseCamt(camt([bare, bare2], { opening: null }));
    expect(result.transactions[0]).toMatchObject({ amount: 12, counterparty: 'Beispiel Laden', date: '2026-10-01' });
    expect(result.transactions[0].ref).toBe('~2026-10-01|debit|12|Beispiel Laden');
    expect(result.warnings.map((w) => w.code)).toEqual(['missing-ref']);
  });

  it('falls back to the booking date when no value date is given', () => {
    const entry = ntry({ amount: '1', txDetails: tx({ ref: 'D/1', amount: '1', addtl: 'Debitkarte Einkauf X' }) })
      .replace(/<ValDt>.*?<\/ValDt>/, '');
    expect(one(camt([entry]))).toMatchObject({ date: '2026-10-01', bookingDate: '2026-10-01' });
  });

  it('warns when the entries do not add up to the closing balance', () => {
    const result = parseCamt(camt([cardEntry], { opening: '100', closing: '80' }));
    expect(result.warnings.map((w) => w.code)).toEqual(['balance-mismatch']);
  });

  it('checks the balance across debits and credits', () => {
    const result = parseCamt(camt([cardEntry, incomingEntry, transferEntry], { opening: '1000', closing: '490.50' }));
    expect(result.warnings).toEqual([]);
  });

  it('derives the period from booking dates when FrToDt is missing', () => {
    const later = ntry({ amount: '1', booking: '2026-10-09', ref: 'L', addtlNtryInf: 'Debitkarte Einkauf X' });
    const xml = camt([later, cardEntry], { opening: null }).replace(/<FrToDt>.*?<\/FrToDt>/, '');
    expect(parseCamt(xml).period).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });

  it('merges several statements of the same account', () => {
    const second = `<Stmt><Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CHF</Ccy></Acct>${twintEntry}</Stmt>`;
    const result = parseCamt(camt([cardEntry], { opening: null, extraStatements: second }));
    expect(result.transactions.map((t) => t.type)).toEqual(['card', 'twint']);
  });
});

describe('parseCamt — Fehler', () => {
  const codeOf = (input) => {
    try {
      parseCamt(input);
    } catch (err) {
      expect(err).toBeInstanceOf(CamtParseError);
      expect(err.message).toBeTruthy();
      return err.code;
    }
    return null;
  };

  it('rejects empty input', () => {
    expect(codeOf('')).toBe('empty');
    expect(codeOf(null)).toBe('empty');
  });

  it('rejects JSON such as a backup file', () => {
    expect(codeOf('{"format":"haushaltsbuch-backup","version":2,"books":[]}')).toBe('not-xml');
  });

  it('rejects broken XML', () => {
    expect(codeOf('<Document><BkToCstmrStmt>')).toBe('not-xml');
    expect(codeOf('Datum;Betrag\n01.10.2026;9.50')).toBe('not-xml');
  });

  it('rejects XML that is not a camt document', () => {
    expect(codeOf('<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"><CstmrCdtTrfInitn/></Document>')).toBe('not-camt');
    expect(codeOf('<html><body/></html>')).toBe('not-camt');
  });

  it('rejects a statement without entries', () => {
    expect(codeOf(camt([]))).toBe('no-entries');
  });

  it('rejects files with several accounts', () => {
    const other = '<Stmt><Acct><Id><IBAN>CH5604835012345678009</IBAN></Id><Ccy>CHF</Ccy></Acct></Stmt>';
    expect(codeOf(camt([cardEntry], { extraStatements: other }))).toBe('multiple-accounts');
  });
});

describe('cleanCounterpartyText', () => {
  it.each([
    ['Debitkarte Einkauf 30.09.2026 07:47 Beispiel Kiosk 1234 Kartennummer: 123456******0000', 'Beispiel Kiosk 1234'],
    ['30.09.2026 07:47 Beispiel Kiosk 1234 Kartennummer: 123456******0000 ', 'Beispiel Kiosk 1234'],
    ['Belastung TWINT Essen Liefern 0400001234567890', 'Essen Liefern'],
    ['Gutschrift TWINT Max Beispiel 0400001234567890', 'Max Beispiel'],
    ['  Spende   Verein ', 'Spende Verein'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (raw, expected) => {
    expect(cleanCounterpartyText(raw)).toBe(expected);
  });
});
