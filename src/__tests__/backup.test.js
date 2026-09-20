import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  SUPPORTED_BACKUP_VERSIONS,
  validateBackupObject,
} from '../backup.js';
import { normalizeBook } from '../utils/hbUtils.js';

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

// Der eigentliche Zweck der Versionsanhebung: ein Backup aus einem Build ohne
// Investments muss sich weiterhin importieren lassen, ohne Daten zu verlieren.
describe('importing an old version 1 backup', () => {
  it('fills in an empty investments structure', () => {
    const old = backupOf({ version: 1, books: [{ id: 'b1', name: 'Altes Buch' }] });
    expect(validateBackupObject(old)).toBe(true);

    const book = normalizeBook(old.books[0]);
    expect(book.investments).toEqual({
      depots: [],
      assets: [],
      transactions: [],
      snapshots: [],
    });
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
