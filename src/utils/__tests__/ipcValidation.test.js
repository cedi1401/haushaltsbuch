import { describe, it, expect } from 'vitest';
import {
  validateBook,
  validateBookSync,
  SETTING_SCHEMA,
  isValidSetting,
} from '../../../electron/ipcValidation.js';

describe('validateBook', () => {
  it('accepts a valid book', () => {
    expect(validateBook({ id: 'b1', name: 'Haushalt', extra: 42 })).toBe(true);
  });

  it('rejects book with missing id', () => {
    expect(validateBook({ name: 'Test' })).toBe(false);
  });

  it('rejects book with empty id', () => {
    expect(validateBook({ id: '', name: 'Test' })).toBe(false);
  });

  it('rejects book with non-string id', () => {
    expect(validateBook({ id: 123, name: 'Test' })).toBe(false);
  });

  it('rejects book with missing name', () => {
    expect(validateBook({ id: 'b1' })).toBe(false);
  });

  it('rejects book with empty name', () => {
    expect(validateBook({ id: 'b1', name: '' })).toBe(false);
  });

  it('rejects null', () => {
    expect(validateBook(null)).toBe(false);
  });

  it('rejects a primitive', () => {
    expect(validateBook('book')).toBe(false);
  });
});

describe('SETTING_SCHEMA', () => {
  it('contains exactly the expected keys', () => {
    const keys = [...SETTING_SCHEMA.keys()].sort();
    expect(keys).toEqual(
      ['activeBookId', 'darkMode', 'month', 'monthStartDay', 'theme'].sort()
    );
  });
});

describe('isValidSetting', () => {
  it('accepts known key with valid string value', () => {
    expect(isValidSetting('theme', 'dark')).toBe(true);
  });

  it('accepts activeBookId as string', () => {
    expect(isValidSetting('activeBookId', 'uuid-1')).toBe(true);
  });

  it('accepts darkMode as string', () => {
    expect(isValidSetting('darkMode', 'true')).toBe(true);
  });

  it('accepts darkMode as boolean', () => {
    expect(isValidSetting('darkMode', false)).toBe(true);
  });

  it('accepts monthStartDay as string', () => {
    expect(isValidSetting('monthStartDay', '1')).toBe(true);
  });

  it('accepts monthStartDay as number', () => {
    expect(isValidSetting('monthStartDay', 15)).toBe(true);
  });

  it('rejects unknown key', () => {
    expect(isValidSetting('__proto__', 'x')).toBe(false);
  });

  it('rejects non-string key', () => {
    expect(isValidSetting(null, 'x')).toBe(false);
  });

  it('rejects theme with non-string value', () => {
    expect(isValidSetting('theme', 42)).toBe(false);
  });

  it.each(['table.columns.reserves', 'table.columns.fixed-fixed', 'table.columns.hb.investments.transactions'])(
    'accepts table column selection %s',
    (key) => {
      expect(isValidSetting(key, '["date","amount"]')).toBe(true);
    }
  );

  it('rejects table column selection with non-string value', () => {
    expect(isValidSetting('table.columns.reserves', ['date'])).toBe(false);
  });

  it('rejects table column key without table name', () => {
    expect(isValidSetting('table.columns.', '[]')).toBe(false);
  });

  it('rejects oversized table column selection', () => {
    expect(isValidSetting('table.columns.reserves', 'x'.repeat(4001))).toBe(false);
  });
});

describe('validateBookSync', () => {
  const book = (id) => ({ id, name: 'Buch ' + id });

  it('accepts upserts that are all listed in order', () => {
    expect(validateBookSync({ upserts: [book('b1')], order: ['b1', 'b2'] })).toBe(true);
  });

  it('accepts an order-only sync without upserts', () => {
    expect(validateBookSync({ upserts: [], order: ['b1'] })).toBe(true);
  });

  it('rejects an empty order (would delete every book)', () => {
    expect(validateBookSync({ upserts: [], order: [] })).toBe(false);
  });

  it('rejects duplicate ids in order', () => {
    expect(validateBookSync({ upserts: [], order: ['b1', 'b1'] })).toBe(false);
  });

  it('rejects non-string or empty ids in order', () => {
    expect(validateBookSync({ upserts: [], order: ['b1', 42] })).toBe(false);
    expect(validateBookSync({ upserts: [], order: [''] })).toBe(false);
  });

  it('rejects an upsert missing from order', () => {
    expect(validateBookSync({ upserts: [book('b3')], order: ['b1'] })).toBe(false);
  });

  it('rejects an invalid book in upserts', () => {
    expect(validateBookSync({ upserts: [{ id: 'b1', name: '' }], order: ['b1'] })).toBe(false);
  });

  it('rejects malformed payloads', () => {
    expect(validateBookSync(null)).toBe(false);
    expect(validateBookSync([book('b1')])).toBe(false);
    expect(validateBookSync({ order: ['b1'] })).toBe(false);
  });
});
