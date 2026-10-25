import { describe, it, expect } from 'vitest';
import { parseBankCsv, tokenizeCsv, isBankCsv, FX_PAIR_MAX_DAYS } from '../bankCsvParser.js';
import { CamtParseError } from '../camtParser.js';

// Erfundene Daten: nur die Kopfzeile entspricht dem echten Yuh-Export.
const HEADER =
  'DATE;ACTIVITY TYPE;ACTIVITY NAME;DEBIT;DEBIT CURRENCY;CREDIT;CREDIT CURRENCY;CARD NUMBER;LOCALITY;RECIPIENT;SENDER;FEES/COMMISSION;BUY/SELL;QUANTITY;ASSET;PRICE PER UNIT';

const q = (s) => (s ? `"""${s}"""` : '');

function row({
  date = '01/10/2026',
  type,
  name = '',
  debit = '',
  debitCcy = '',
  credit = '',
  creditCcy = '',
  recipient = '',
  sender = '',
  fee = '',
  buySell = '',
  quantity = '',
  asset = '',
}) {
  return [
    date, type, q(name), debit, debitCcy, credit, creditCcy, debit && type.startsWith('CARD') ? '**** 1234' : '',
    '', q(recipient), q(sender), fee, buySell, quantity, asset, '',
  ].join(';');
}

const card = (o) => row({ type: 'CARD_TRANSACTION_OUT', debitCcy: 'CHF', recipient: o.name, ...o });
const fx = (o) => row({ type: 'BANK_AUTO_ORDER_EXECUTED', debitCcy: 'CHF', fee: '0.10', ...o });

function csv(rows, { bom = true, eol = '\n' } = {}) {
  return `${bom ? '\uFEFF' : ''}${[HEADER, ...rows].join(eol)}${eol}`;
}

describe('tokenizeCsv', () => {
  it('splits fields, handles quotes, escaped quotes and CRLF', () => {
    expect(tokenizeCsv('a;"b;c";"d""e"\r\n1;2;3')).toEqual([
      ['a', 'b;c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });

  it('drops a BOM and empty lines', () => {
    expect(tokenizeCsv('\uFEFFa;b\n\n;\n')).toEqual([['a', 'b']]);
  });
});

describe('isBankCsv', () => {
  it('recognises the Yuh header, with or without BOM', () => {
    expect(isBankCsv(csv([]))).toBe(true);
    expect(isBankCsv(csv([], { bom: false }))).toBe(true);
  });

  it('rejects other CSV files', () => {
    expect(isBankCsv('Datum;Betrag;Text\n01.10.2026;9.50;Kaffee')).toBe(false);
  });
});

describe('parseBankCsv — Kopfdaten', () => {
  it('returns the camt-compatible shape with a fixed account key', () => {
    const result = parseBankCsv(
      csv([
        card({ date: '03/10/2026', name: 'Bäckerei Muster', debit: '-4.80' }),
        card({ date: '28/09/2026', name: 'Kiosk Beispiel', debit: '-2.50' }),
      ])
    );
    expect(result.format).toBe('csv');
    expect(result.account).toEqual({ iban: 'CSV:YUH', currency: 'CHF', ownerName: '', bankName: 'Yuh' });
    expect(result.period).toEqual({ from: '2026-09-28', to: '2026-10-03' });
    expect(result.balances).toEqual({ opening: null, closing: null });
    expect(result.warnings).toEqual([]);
  });

  it('builds transactions like parseCamt', () => {
    const [tx] = parseBankCsv(csv([card({ date: '03/10/2026', name: 'Bäckerei Muster', debit: '-4.80' })])).transactions;
    expect(tx).toEqual({
      ref: '~2026-10-03|debit|4.80|CHF|Bäckerei Muster',
      date: '2026-10-03',
      bookingDate: '2026-10-03',
      direction: 'debit',
      amount: 4.8,
      currency: 'CHF',
      original: null,
      reversal: false,
      status: 'BOOK',
      type: 'card',
      counterparty: 'Bäckerei Muster',
      message: '',
    });
  });

  it('accepts CRLF line endings and no BOM', () => {
    const result = parseBankCsv(csv([card({ name: 'Kiosk Beispiel', debit: '-2.50' })], { bom: false, eol: '\r\n' }));
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].counterparty).toBe('Kiosk Beispiel');
  });
});

describe('parseBankCsv — Arten', () => {
  it('uses recipient and sender for transfers, not the activity sentence', () => {
    const result = parseBankCsv(
      csv([
        row({ type: 'PAYMENT_TRANSACTION_OUT', name: 'Überweisung an Erika Muster', debit: '-100.00', debitCcy: 'CHF', recipient: 'Erika Muster' }),
        row({ type: 'PAYMENT_TRANSACTION_IN', name: 'Überweisung von Max Beispiel', credit: '250.00', creditCcy: 'CHF', sender: 'Max Beispiel' }),
      ])
    );
    expect(result.transactions.map((t) => [t.type, t.direction, t.amount, t.counterparty])).toEqual([
      ['transfer', 'debit', 100, 'Erika Muster'],
      ['incoming', 'credit', 250, 'Max Beispiel'],
    ]);
  });

  it('treats card credits as card refunds and unknown types as other', () => {
    const result = parseBankCsv(
      csv([
        row({ type: 'CARD_TRANSACTION_IN', name: 'Sportladen Beispiel', credit: '19.90', creditCcy: 'CHF' }),
        row({ type: 'INTEREST_PAID', name: 'Zins', credit: '0.35', creditCcy: 'CHF' }),
      ])
    );
    expect(result.transactions.map((t) => [t.type, t.direction])).toEqual([
      ['card', 'credit'],
      ['other', 'credit'],
    ]);
  });

  it('skips rewards, exchanges, trades and rows without money, with one warning', () => {
    const result = parseBankCsv(
      csv([
        card({ name: 'Kiosk Beispiel', debit: '-2.50' }),
        row({ type: 'REWARD_RECEIVED', name: 'Bonus', quantity: '0.5', asset: 'SWQ' }),
        fx({ debit: '-10.00', credit: '11.00', creditCcy: 'USD' }),
        row({ type: 'INVESTMENT_ORDER', name: 'Fonds', debit: '-50.00', debitCcy: 'CHF', buySell: 'BUY', quantity: '1', asset: 'ETF' }),
        row({ type: 'SOMETHING', name: 'Leer' }),
      ])
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.warnings).toEqual([
      { code: 'rows-skipped', message: '4 Zeilen ohne Geldbewegung in CHF wurden weggelassen (Bonus, Währungswechsel, Handel).' },
    ]);
  });

  it('skips foreign-currency rows that are not card payments', () => {
    const result = parseBankCsv(
      csv([
        card({ name: 'Kiosk Beispiel', debit: '-2.50' }),
        row({ type: 'PAYMENT_TRANSACTION_OUT', name: 'Überweisung an Jane Doe', debit: '-30.00', debitCcy: 'EUR', recipient: 'Jane Doe' }),
      ])
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.warnings[0].code).toBe('rows-skipped');
  });

  it('skips rows with an invalid date and says so', () => {
    const result = parseBankCsv(
      csv([card({ name: 'Kiosk Beispiel', debit: '-2.50' }), card({ date: '31/02/2026', name: 'Kiosk Beispiel', debit: '-3.00' })])
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.warnings.map((w) => w.code)).toEqual(['invalid-date']);
  });
});

describe('parseBankCsv — Fremdwährung', () => {
  it('takes the CHF amount from the matching exchange and keeps the original', () => {
    const result = parseBankCsv(
      csv([
        card({ date: '01/10/2026', name: 'Software Inc.', debit: '-12.50', debitCcy: 'USD' }),
        fx({ date: '02/10/2026', debit: '-10.45', credit: '12.50', creditCcy: 'USD' }),
      ])
    );
    const [tx] = result.transactions;
    expect(tx.amount).toBe(10.45);
    expect(tx.currency).toBe('CHF');
    expect(tx.original).toEqual({ amount: 12.5, currency: 'USD' });
    expect(tx.ref).toBe('~2026-10-01|debit|12.50|USD|Software Inc.');
    expect(result.warnings.map((w) => w.code)).toEqual(['rows-skipped']);
  });

  it('pairs the closest exchange first and uses each exchange once', () => {
    const result = parseBankCsv(
      csv([
        card({ date: '01/10/2026', name: 'Shop A', debit: '-20.00', debitCcy: 'EUR' }),
        card({ date: '03/10/2026', name: 'Shop B', debit: '-20.00', debitCcy: 'EUR' }),
        fx({ date: '04/10/2026', debit: '-18.80', credit: '20.00', creditCcy: 'EUR' }),
        fx({ date: '02/10/2026', debit: '-18.70', credit: '20.00', creditCcy: 'EUR' }),
      ])
    );
    expect(result.transactions.map((t) => [t.counterparty, t.amount])).toEqual([
      ['Shop A', 18.7],
      ['Shop B', 18.8],
    ]);
  });

  it('does not pair across currencies, amounts, before the card or beyond the window', () => {
    const late = new Date(Date.UTC(2026, 9, 1 + FX_PAIR_MAX_DAYS + 1));
    const lateDate = `${String(late.getUTCDate()).padStart(2, '0')}/10/2026`;
    const result = parseBankCsv(
      csv([
        fx({ date: '30/09/2026', debit: '-9.00', credit: '10.00', creditCcy: 'USD' }),
        card({ date: '01/10/2026', name: 'Shop A', debit: '-10.00', debitCcy: 'USD' }),
        fx({ date: '02/10/2026', debit: '-9.10', credit: '10.00', creditCcy: 'EUR' }),
        fx({ date: '02/10/2026', debit: '-9.20', credit: '10.01', creditCcy: 'USD' }),
        fx({ date: lateDate, debit: '-9.30', credit: '10.00', creditCcy: 'USD' }),
      ])
    );
    const [tx] = result.transactions;
    expect(tx.amount).toBeNull();
    expect(tx.original).toEqual({ amount: 10, currency: 'USD' });
    expect(result.warnings[0]).toEqual({
      code: 'missing-amount',
      message: 'Für 1 Kartenzahlung in Fremdwährung fehlt der Währungswechsel; der Betrag in CHF ist unbekannt.',
    });
  });
});

describe('parseBankCsv — Ersatz-Referenz', () => {
  it('numbers identical rows within one file', () => {
    const coffee = card({ date: '05/10/2026', name: 'Café Beispiel', debit: '-4.50' });
    const refs = parseBankCsv(csv([coffee, coffee, coffee])).transactions.map((t) => t.ref);
    expect(refs).toEqual([
      '~2026-10-05|debit|4.50|CHF|Café Beispiel',
      '~2026-10-05|debit|4.50|CHF|Café Beispiel#2',
      '~2026-10-05|debit|4.50|CHF|Café Beispiel#3',
    ]);
  });

  it('stays the same when the file is exported again with more rows', () => {
    const a = card({ date: '05/10/2026', name: 'Café Beispiel', debit: '-4.50' });
    const b = card({ date: '06/10/2026', name: 'Kiosk Beispiel', debit: '-2.00' });
    const first = parseBankCsv(csv([a])).transactions[0].ref;
    const second = parseBankCsv(csv([a, b])).transactions[0].ref;
    expect(second).toBe(first);
  });
});

describe('parseBankCsv — Fehler', () => {
  const codeOf = (input) => {
    try {
      parseBankCsv(input);
    } catch (err) {
      expect(err).toBeInstanceOf(CamtParseError);
      expect(err.message).toBeTruthy();
      return err.code;
    }
    return null;
  };

  it('rejects empty input', () => {
    expect(codeOf('')).toBe('empty');
    expect(codeOf('\uFEFF\n')).toBe('empty');
  });

  it('rejects an unknown CSV layout', () => {
    expect(codeOf('Datum;Betrag;Text\n01.10.2026;9.50;Kaffee')).toBe('not-csv-profile');
  });

  it('rejects a header without rows or without CHF bookings', () => {
    expect(codeOf(csv([]))).toBe('no-entries');
    expect(codeOf(csv([row({ type: 'REWARD_RECEIVED', name: 'Bonus', quantity: '0.5', asset: 'SWQ' })]))).toBe('no-entries');
  });
});
