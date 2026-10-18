import { describe, it, expect } from 'vitest';
import {
  merchantKey,
  suggestNote,
  buildImportRows,
  buildEntriesFromRows,
  getAccountImportStatus,
  recentCategories,
  ROW_HINTS,
} from '../bankImportUtils.js';

// Erfundene Daten: Test-IBANs, erfundene Händler.
const IBAN = 'CH9300762011623852957';
const OTHER_IBAN = 'CH5604835012345678009';

const EXPENSE_CATEGORIES = [
  {
    id: 'cat_lebensmittel',
    name: 'Lebensmittel',
    subcategories: [{ id: 'sub_supermarkt', name: 'Supermarkt', parentId: 'cat_lebensmittel' }],
  },
  { id: 'cat_freizeit', name: 'Freizeit', subcategories: [] },
];
const INCOME_CATEGORIES = [
  {
    id: 'cat_einnahmen',
    name: 'Einnahmen',
    subcategories: [{ id: 'sub_erstattungen', name: 'Erstattungen und Rückzahlungen', parentId: 'cat_einnahmen' }],
  },
];

function bookWith(entries = [], overrides = {}) {
  return {
    id: 'b1',
    name: 'Haushalt',
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    entries,
    ...overrides,
  };
}

function tx(overrides = {}) {
  return {
    ref: 'REF1',
    date: '2026-10-01',
    bookingDate: '2026-10-01',
    direction: 'debit',
    amount: 12.5,
    currency: 'CHF',
    original: null,
    reversal: false,
    status: 'BOOK',
    type: 'card',
    counterparty: 'Laden Muster 1234',
    message: '',
    ...overrides,
  };
}

function statementOf(transactions, iban = IBAN) {
  return { account: { iban, currency: 'CHF' }, transactions };
}

function imported(overrides = {}) {
  return {
    id: 'e_imp',
    kind: 'expense',
    source: 'month',
    amount: 9,
    date: '2026-09-01',
    note: '',
    categoryId: 'cat_lebensmittel',
    subcategoryId: 'sub_supermarkt',
    bankRef: { ref: 'OLD1', iban: IBAN, text: 'Laden Muster 9999' },
    ...overrides,
  };
}

describe('merchantKey', () => {
  it('drops digits so different branches share a key', () => {
    expect(merchantKey('Coop Pronto 3443')).toBe('coop pronto');
    expect(merchantKey('Coop Pronto 6259')).toBe('coop pronto');
  });

  it('treats ß and ss alike and ignores case', () => {
    expect(merchantKey('Bäckerei Großmann')).toBe(merchantKey('BÄCKEREI GROSSMANN'));
  });

  it('turns punctuation into spaces and collapses them', () => {
    expect(merchantKey('  Kiosk*Am-Bahnhof  ')).toBe('kiosk am bahnhof');
  });

  it('keeps letters after leading digits', () => {
    expect(merchantKey('1PASSWORD')).toBe('password');
  });

  it('returns an empty key for empty or digit-only text', () => {
    expect(merchantKey('')).toBe('');
    expect(merchantKey(null)).toBe('');
    expect(merchantKey('0400 1234')).toBe('');
  });
});

describe('suggestNote', () => {
  it('uses the merchant for card payments', () => {
    expect(suggestNote(tx())).toBe('Laden Muster 1234');
  });

  it('joins recipient and message for transfers', () => {
    expect(suggestNote(tx({ type: 'transfer', counterparty: 'Erika Beispiel', message: 'Miete Oktober' }))).toBe(
      'Erika Beispiel · Miete Oktober'
    );
  });

  it('appends the foreign amount', () => {
    expect(suggestNote(tx({ counterparty: 'Streaming Inc', original: { amount: 51.76, currency: 'USD' } }))).toBe(
      'Streaming Inc (USD 51.76)'
    );
    expect(suggestNote(tx({ counterparty: '', original: { amount: 5, currency: 'EUR' } }))).toBe('(EUR 5.00)');
  });
});

describe('buildImportRows: preselection', () => {
  const rowFor = (overrides) => buildImportRows(statementOf([tx(overrides)]), bookWith())[0];

  it('selects card and TWINT debits', () => {
    expect(rowFor({ type: 'card' }).selected).toBe(true);
    expect(rowFor({ type: 'twint' }).selected).toBe(true);
  });

  it('leaves transfers, standing orders, incoming and other types unselected', () => {
    for (const type of ['transfer', 'standing-order', 'incoming', 'other']) {
      expect(rowFor({ type }).selected).toBe(false);
    }
  });

  it('leaves a card refund unselected as income', () => {
    const row = rowFor({ type: 'card', direction: 'credit' });
    expect(row.kind).toBe('income');
    expect(row.selected).toBe(false);
  });

  it('leaves reversals unselected and flags them', () => {
    const row = rowFor({ reversal: true });
    expect(row.selected).toBe(false);
    expect(row.hints).toContain(ROW_HINTS.reversal);
  });

  it('locks rows without an amount', () => {
    const row = rowFor({ amount: null });
    expect(row.locked).toBe(true);
    expect(row.selected).toBe(false);
    expect(row.hints).toContain(ROW_HINTS.missingAmount);
  });

  it('maps direction to kind and keeps the transaction', () => {
    const row = rowFor({ direction: 'debit' });
    expect(row.kind).toBe('expense');
    expect(row.id).toBe('REF1');
    expect(row.transaction.counterparty).toBe('Laden Muster 1234');
    expect(row.note).toBe('Laden Muster 1234');
  });
});

describe('buildImportRows: already imported', () => {
  it('locks a row whose bank reference and account are already in the book', () => {
    const book = bookWith([imported({ bankRef: { ref: 'REF1', iban: IBAN, text: 'Laden Muster 1234' } })]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.locked).toBe(true);
    expect(row.selected).toBe(false);
    expect(row.hints[0]).toBe(ROW_HINTS.alreadyImported);
  });

  it('ignores whitespace and case in the stored IBAN', () => {
    const spaced = 'ch93 0076 2011 6238 5295 7';
    const book = bookWith([imported({ bankRef: { ref: 'REF1', iban: spaced, text: 'x' } })]);
    expect(buildImportRows(statementOf([tx()]), book)[0].locked).toBe(true);
  });

  it('does not match the same reference from another account', () => {
    const book = bookWith([imported({ bankRef: { ref: 'REF1', iban: OTHER_IBAN, text: 'x' } })]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.locked).toBe(false);
    expect(row.selected).toBe(true);
  });

  it('treats a deleted import as new again', () => {
    const [row] = buildImportRows(statementOf([tx()]), bookWith([]));
    expect(row.locked).toBe(false);
  });
});

describe('buildImportRows: similar entries', () => {
  const manual = (overrides = {}) => ({
    id: 'e_manual',
    kind: 'expense',
    source: 'month',
    amount: 12.5,
    date: '2026-10-03',
    note: 'Einkauf',
    categoryId: 'cat_lebensmittel',
    subcategoryId: null,
    ...overrides,
  });

  it('hints at a manual entry with same amount and kind within 3 days and unselects the row', () => {
    const [row] = buildImportRows(statementOf([tx()]), bookWith([manual()]));
    expect(row.selected).toBe(false);
    expect(row.locked).toBe(false);
    expect(row.hints).toContain(ROW_HINTS.similar);
    expect(row.similar).toEqual({ id: 'e_manual', date: '2026-10-03', note: 'Einkauf', amount: 12.5 });
  });

  it('ignores entries more than 3 days away', () => {
    const [row] = buildImportRows(statementOf([tx()]), bookWith([manual({ date: '2026-10-05' })]));
    expect(row.similar).toBeNull();
    expect(row.selected).toBe(true);
  });

  it('also matches entries before the bank date and across month ends', () => {
    const [row] = buildImportRows(statementOf([tx()]), bookWith([manual({ date: '2026-09-28' })]));
    expect(row.similar?.id).toBe('e_manual');
  });

  it('requires the same kind', () => {
    const [row] = buildImportRows(statementOf([tx()]), bookWith([manual({ kind: 'income' })]));
    expect(row.similar).toBeNull();
  });

  it('ignores transfers and withdrawals', () => {
    const book = bookWith([manual({ kind: 'transfer' }), manual({ id: 'e2', kind: 'withdrawal' })]);
    expect(buildImportRows(statementOf([tx()]), book)[0].similar).toBeNull();
  });

  it('requires the same amount to the cent', () => {
    const [row] = buildImportRows(statementOf([tx()]), bookWith([manual({ amount: 12.55 })]));
    expect(row.similar).toBeNull();
  });

  it('does not count imported entries as similar', () => {
    const book = bookWith([imported({ amount: 12.5, date: '2026-10-01', bankRef: { ref: 'OTHER', iban: IBAN, text: 'x' } })]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.similar).toBeNull();
    expect(row.selected).toBe(true);
  });

  it('uses each manual entry for at most one row, closest date first', () => {
    const statement = statementOf([
      tx({ ref: 'A', date: '2026-10-01' }),
      tx({ ref: 'B', date: '2026-10-03' }),
    ]);
    const rows = buildImportRows(statement, bookWith([manual({ date: '2026-10-03' })]));
    expect(rows[0].similar).toBeNull();
    expect(rows[0].selected).toBe(true);
    expect(rows[1].similar?.id).toBe('e_manual');
    expect(rows[1].selected).toBe(false);
  });

  it('does not attach hints to already imported rows', () => {
    const book = bookWith([
      manual(),
      imported({ bankRef: { ref: 'REF1', iban: IBAN, text: 'x' } }),
    ]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.similar).toBeNull();
    expect(row.hints).not.toContain(ROW_HINTS.similar);
  });

  it('works for income as well', () => {
    const book = bookWith([manual({ kind: 'income', categoryId: 'cat_einnahmen', amount: 100 })]);
    const [row] = buildImportRows(statementOf([tx({ direction: 'credit', type: 'incoming', amount: 100 })]), book);
    expect(row.similar?.id).toBe('e_manual');
  });
});

describe('buildImportRows: category suggestion', () => {
  it('takes category and subcategory from the latest import of the same merchant', () => {
    const book = bookWith([
      imported({ id: 'old', categoryId: 'cat_freizeit', subcategoryId: null }),
      imported({ id: 'new', categoryId: 'cat_lebensmittel', subcategoryId: 'sub_supermarkt' }),
    ]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.categoryId).toBe('cat_lebensmittel');
    expect(row.subcategoryId).toBe('sub_supermarkt');
    expect(row.hints).toContain(ROW_HINTS.suggested);
    expect(row.hints).not.toContain(ROW_HINTS.missingCategory);
  });

  it('follows a later recategorisation in the app', () => {
    const book = bookWith([imported({ categoryId: 'cat_freizeit', subcategoryId: null })]);
    expect(buildImportRows(statementOf([tx()]), book)[0].categoryId).toBe('cat_freizeit');
  });

  it('skips imports whose category was deleted and falls back to an earlier one', () => {
    const book = bookWith([
      imported({ id: 'old', categoryId: 'cat_freizeit', subcategoryId: null }),
      imported({ id: 'new', categoryId: 'cat_geloescht', subcategoryId: null }),
    ]);
    expect(buildImportRows(statementOf([tx()]), book)[0].categoryId).toBe('cat_freizeit');
  });

  it('keeps the category but drops a deleted subcategory', () => {
    const book = bookWith([imported({ subcategoryId: 'sub_geloescht' })]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.categoryId).toBe('cat_lebensmittel');
    expect(row.subcategoryId).toBeNull();
  });

  it('ignores manual entries and other merchants', () => {
    const book = bookWith([
      { ...imported(), bankRef: undefined, note: 'Laden Muster 1234' },
      imported({ bankRef: { ref: 'X', iban: IBAN, text: 'Anderer Laden' } }),
    ]);
    const [row] = buildImportRows(statementOf([tx()]), book);
    expect(row.categoryId).toBeNull();
    expect(row.hints).toContain(ROW_HINTS.missingCategory);
    expect(row.hints).not.toContain(ROW_HINTS.suggested);
  });

  it('only suggests from imports of the same kind', () => {
    const book = bookWith([imported({ kind: 'transfer', categoryId: null })]);
    expect(buildImportRows(statementOf([tx()]), book)[0].categoryId).toBeNull();
  });

  it('suggests from imports of another account too', () => {
    const book = bookWith([imported({ bankRef: { ref: 'X', iban: OTHER_IBAN, text: 'Laden Muster 77' } })]);
    expect(buildImportRows(statementOf([tx()]), book)[0].categoryId).toBe('cat_lebensmittel');
  });

  it('does not suggest for empty merchant keys', () => {
    const book = bookWith([imported({ bankRef: { ref: 'X', iban: IBAN, text: '0400' } })]);
    expect(buildImportRows(statementOf([tx({ counterparty: '1234' })]), book)[0].categoryId).toBeNull();
  });

  it('defaults income to the standard income category', () => {
    const [row] = buildImportRows(statementOf([tx({ direction: 'credit', type: 'incoming' })]), bookWith());
    expect(row.categoryId).toBe('cat_einnahmen');
    expect(row.subcategoryId).toBeNull();
    expect(row.hints).not.toContain(ROW_HINTS.missingCategory);
  });

  it('suggests income subcategories from earlier income imports', () => {
    const book = bookWith([
      imported({ kind: 'income', source: undefined, categoryId: 'cat_einnahmen', subcategoryId: 'sub_erstattungen' }),
    ]);
    const [row] = buildImportRows(statementOf([tx({ direction: 'credit' })]), book);
    expect(row.subcategoryId).toBe('sub_erstattungen');
  });

  it('does not copy categories between rows of the same file', () => {
    const rows = buildImportRows(statementOf([tx({ ref: 'A' }), tx({ ref: 'B' })]), bookWith());
    expect(rows.every((r) => r.categoryId === null)).toBe(true);
  });
});

describe('buildEntriesFromRows', () => {
  const book = bookWith();
  const account = { iban: IBAN };

  it('builds entries only from selected, unlocked rows', () => {
    const rows = buildImportRows(
      statementOf([tx({ ref: 'A' }), tx({ ref: 'B', type: 'transfer' }), tx({ ref: 'C', amount: null })]),
      book
    );
    rows[2].selected = true; // gesperrt, trotzdem angehakt
    const entries = buildEntriesFromRows(rows, account, book);
    expect(entries).toHaveLength(1);
    expect(entries[0].bankRef.ref).toBe('A');
  });

  it('creates a regular expense with bankRef and the edited category and note', () => {
    const [row] = buildImportRows(statementOf([tx()]), book);
    row.categoryId = 'cat_lebensmittel';
    row.subcategoryId = 'sub_supermarkt';
    row.note = '  Wocheneinkauf ';
    const [entry] = buildEntriesFromRows([row], account, book);
    expect(entry).toMatchObject({
      kind: 'expense',
      source: 'month',
      amount: 12.5,
      date: '2026-10-01',
      note: 'Wocheneinkauf',
      categoryId: 'cat_lebensmittel',
      subcategoryId: 'sub_supermarkt',
      category: 'Lebensmittel',
      bankRef: { ref: 'REF1', iban: IBAN, text: 'Laden Muster 1234' },
    });
    expect(entry.id).toMatch(/^entry_/);
  });

  it('stores only reference, IBAN and cleaned text in bankRef', () => {
    const [row] = buildImportRows(statementOf([tx({ message: 'Kartennummer: 1234' })]), book);
    const [entry] = buildEntriesFromRows([row], account, book);
    expect(Object.keys(entry.bankRef).sort()).toEqual(['iban', 'ref', 'text']);
  });

  it('creates an income without source when a credit row is checked', () => {
    const [row] = buildImportRows(statementOf([tx({ direction: 'credit', type: 'incoming' })]), book);
    row.selected = true;
    const [entry] = buildEntriesFromRows([row], account, book);
    expect(entry.kind).toBe('income');
    expect(entry).not.toHaveProperty('source');
    expect(entry.categoryId).toBe('cat_einnahmen');
    expect(entry.category).toBe('Einnahmen');
  });

  it('imports rows without a category as uncategorised expenses', () => {
    const [row] = buildImportRows(statementOf([tx()]), book);
    const [entry] = buildEntriesFromRows([row], account, book);
    expect(entry.categoryId).toBeNull();
    expect(entry.subcategoryId).toBeNull();
    expect(entry.category).toBe('');
  });

  it('drops a category that does not exist for the kind', () => {
    const [row] = buildImportRows(statementOf([tx()]), book);
    row.categoryId = 'cat_einnahmen';
    expect(buildEntriesFromRows([row], account, book)[0].categoryId).toBeNull();
  });

  it('stores the IBAN without spaces', () => {
    const [row] = buildImportRows(statementOf([tx()]), book);
    const [entry] = buildEntriesFromRows([row], { iban: 'CH93 0076 2011 6238 5295 7' }, book);
    expect(entry.bankRef.iban).toBe(IBAN);
  });

  it('round-trips: importing the same statement again locks every row', () => {
    const statement = statementOf([tx({ ref: 'A' }), tx({ ref: 'B', counterparty: 'Kiosk 2' })]);
    const entries = buildEntriesFromRows(buildImportRows(statement, book), statement.account, book);
    const again = buildImportRows(statement, bookWith(entries));
    expect(again.every((r) => r.locked && r.hints.includes(ROW_HINTS.alreadyImported))).toBe(true);
  });

  it('returns nothing for no rows', () => {
    expect(buildEntriesFromRows([], account, book)).toEqual([]);
    expect(buildEntriesFromRows(undefined, account, book)).toEqual([]);
  });
});

describe('getAccountImportStatus', () => {
  const books = [
    bookWith([
      imported({ date: '2026-09-15' }),
      imported({ date: '2026-10-02' }),
      imported({ date: '2026-12-01', bankRef: { ref: 'X', iban: OTHER_IBAN, text: 'x' } }),
      { id: 'm', kind: 'expense', amount: 1, date: '2026-12-31' },
    ]),
    { id: 'b2', name: 'Ferienkasse', entries: [imported()] },
    { id: 'b3', name: 'Leer', entries: [] },
  ];

  it('reports the latest imported date of this account in the active book', () => {
    expect(getAccountImportStatus(books, 'b1', IBAN).lastImportedDate).toBe('2026-10-02');
  });

  it('lists other books that already imported this account', () => {
    expect(getAccountImportStatus(books, 'b1', IBAN).otherBookNames).toEqual(['Ferienkasse']);
  });

  it('reports nothing for an unknown account', () => {
    expect(getAccountImportStatus(books, 'b1', 'CH0000000000000000000')).toEqual({
      lastImportedDate: '',
      otherBookNames: [],
    });
  });

  it('detects an account known only in another book', () => {
    const status = getAccountImportStatus(books, 'b3', IBAN);
    expect(status.lastImportedDate).toBe('');
    expect(status.otherBookNames).toEqual(['Haushalt', 'Ferienkasse']);
  });
});

describe('recentCategories', () => {
  const e = (id, kind, categoryId, subcategoryId = null) => ({ id, kind, categoryId, subcategoryId, amount: 1, date: '2026-10-01' });

  it('takes the newest entries of the same kind first, without duplicates', () => {
    const book = bookWith([
      e('a', 'expense', 'cat_freizeit'),
      e('b', 'expense', 'cat_lebensmittel', 'sub_supermarkt'),
      e('c', 'income', 'cat_einnahmen'),
      e('d', 'expense', 'cat_freizeit'),
    ]);
    expect(recentCategories(book, 'expense')).toEqual([
      { categoryId: 'cat_freizeit', subcategoryId: null },
      { categoryId: 'cat_lebensmittel', subcategoryId: 'sub_supermarkt' },
    ]);
    expect(recentCategories(book, 'income')).toEqual([{ categoryId: 'cat_einnahmen', subcategoryId: null }]);
  });

  it('puts picks from the dialog before the book entries', () => {
    const book = bookWith([e('a', 'expense', 'cat_freizeit')]);
    const picks = [{ categoryId: 'cat_lebensmittel', subcategoryId: 'sub_supermarkt' }];
    expect(recentCategories(book, 'expense', picks)).toEqual([
      { categoryId: 'cat_lebensmittel', subcategoryId: 'sub_supermarkt' },
      { categoryId: 'cat_freizeit', subcategoryId: null },
    ]);
  });

  it('skips deleted categories and subcategories and respects the limit', () => {
    const book = bookWith([
      e('a', 'expense', 'cat_freizeit'),
      e('b', 'expense', 'cat_lebensmittel'),
      e('c', 'expense', 'cat_lebensmittel', 'sub_geloescht'),
      e('d', 'expense', 'cat_geloescht'),
      e('f', 'expense', null),
    ]);
    expect(recentCategories(book, 'expense')).toEqual([
      { categoryId: 'cat_lebensmittel', subcategoryId: null },
      { categoryId: 'cat_freizeit', subcategoryId: null },
    ]);
    expect(recentCategories(book, 'expense', [], 1)).toHaveLength(1);
  });
});
