import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  SUPPORTED_BACKUP_VERSIONS,
  validateBackupObject,
} from '../backup.js';
import { normalizeBook } from '../utils/bookMigration.js';

function backupOf(overrides = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2026-09-20T10:00:00.000Z',
    books: [{ id: 'b1', name: 'Mein Haushaltsbuch' }],
    activeBookId: 'b1',
    monthFilter: '',
    ...overrides,
  };
}

describe('backup version constants', () => {
  it('exports version 2 as the current format', () => {
    expect(BACKUP_VERSION).toBe(2);
  });

  it('still lists version 1 as supported', () => {
    expect(SUPPORTED_BACKUP_VERSIONS).toContain(1);
    expect(SUPPORTED_BACKUP_VERSIONS).toContain(BACKUP_VERSION);
  });
});

describe('validateBackupObject', () => {
  it('accepts a current backup', () => {
    expect(validateBackupObject(backupOf())).toBe(true);
  });

  it('accepts an old version 1 backup', () => {
    expect(validateBackupObject(backupOf({ version: 1 }))).toBe(true);
  });

  it('rejects an unknown future version', () => {
    expect(validateBackupObject(backupOf({ version: 3 }))).toBe(false);
  });

  it('rejects a version given as a string', () => {
    expect(validateBackupObject(backupOf({ version: '2' }))).toBe(false);
  });

  it('rejects a foreign format marker', () => {
    expect(validateBackupObject(backupOf({ format: 'anderes-programm' }))).toBe(false);
  });

  it('rejects a missing or malformed books array', () => {
    expect(validateBackupObject(backupOf({ books: undefined }))).toBe(false);
    expect(validateBackupObject(backupOf({ books: {} }))).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(validateBackupObject(null)).toBe(false);
    expect(validateBackupObject(undefined)).toBe(false);
    expect(validateBackupObject([])).toBe(false);
    expect(validateBackupObject('backup')).toBe(false);
  });
});

// Ein Backup im Ursprungsformat muss sich weiterhin importieren lassen, ohne
// Daten zu verlieren.
describe('importing an old version 1 backup', () => {
  it('is accepted', () => {
    const old = backupOf({ version: 1, books: [{ id: 'b1', name: 'Altes Buch' }] });
    expect(validateBackupObject(old)).toBe(true);
  });

  it('keeps the existing book data untouched', () => {
    const entries = [
      { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 1200, note: 'Miete', categoryId: null },
    ];
    const book = normalizeBook({ id: 'b1', name: 'Altes Buch', entries, baseCurrency: 'EUR' });
    expect(book.name).toBe('Altes Buch');
    expect(book.baseCurrency).toBe('EUR');
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0].amount).toBe(1200);
  });
});

// Importierte Buchungen tragen `bankRef`; ohne das Feld würde ein
// zurückgespieltes Backup denselben Kontoauszug erneut als neu anbieten.
describe('backup round trip with bank-imported entries', () => {
  it('keeps bankRef through export, JSON and import', () => {
    const bankRef = { ref: 'ZV20261001/000001/1', iban: 'CH9300762011623852957', text: 'Laden Muster 1234' };
    const entry = {
      id: 'e1',
      kind: 'expense',
      source: 'month',
      amount: 12.5,
      date: '2026-10-01',
      note: '',
      categoryId: null,
      subcategoryId: null,
      category: '',
      bankRef,
    };
    const exported = backupOf({ books: [normalizeBook({ id: 'b1', name: 'Haushalt', entries: [entry] })] });
    const restored = JSON.parse(JSON.stringify(exported));

    expect(validateBackupObject(restored)).toBe(true);
    const book = normalizeBook(restored.books[0]);
    expect(book.entries[0].bankRef).toEqual(bankRef);
  });
});
