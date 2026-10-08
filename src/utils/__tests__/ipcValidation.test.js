import { describe, it, expect } from 'vitest';
import {
  validateBook,
  SETTING_SCHEMA,
  isValidSetting,
  isValidSymbol,
  isValidSymbolList,
  isValidSearchQuery,
  isValidHistoryOptions,
  MAX_SYMBOL_BATCH,
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

describe('isValidSymbol', () => {
  it.each(['AAPL', 'VWRL.SW', '4GLD.DE', 'GC=F', 'USDCHF=X', '^GSPC', 'BRK-B'])(
    'accepts %s',
    (symbol) => {
      expect(isValidSymbol(symbol)).toBe(true);
    }
  );

  it.each([
    ['empty string', ''],
    ['slash (path traversal)', '../etc'],
    ['query injection', 'AAPL&foo=1'],
    ['whitespace', 'AA PL'],
    ['too long', 'A'.repeat(21)],
    ['non-string', 123],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isValidSymbol(value)).toBe(false);
  });
});

describe('isValidSymbolList', () => {
  it('accepts a list of valid symbols', () => {
    expect(isValidSymbolList(['AAPL', 'VWRL.SW', 'GC=F', 'USDCHF=X'])).toBe(true);
  });

  it('accepts a single symbol', () => {
    expect(isValidSymbolList(['SI=F'])).toBe(true);
  });

  it('rejects an empty list', () => {
    expect(isValidSymbolList([])).toBe(false);
  });

  it('rejects a list above the batch limit', () => {
    expect(isValidSymbolList(Array(MAX_SYMBOL_BATCH).fill('AAPL'))).toBe(true);
    expect(isValidSymbolList(Array(MAX_SYMBOL_BATCH + 1).fill('AAPL'))).toBe(false);
  });

  it('rejects the whole list when one symbol is invalid', () => {
    expect(isValidSymbolList(['AAPL', 'DROP TABLE'])).toBe(false);
    expect(isValidSymbolList(['AAPL', ''])).toBe(false);
    expect(isValidSymbolList(['AAPL', null])).toBe(false);
  });

  it('rejects non-arrays', () => {
    expect(isValidSymbolList('AAPL')).toBe(false);
    expect(isValidSymbolList(null)).toBe(false);
    expect(isValidSymbolList(undefined)).toBe(false);
    expect(isValidSymbolList({ 0: 'AAPL', length: 1 })).toBe(false);
  });
});

describe('isValidSearchQuery', () => {
  it('accepts normal text', () => {
    expect(isValidSearchQuery('vanguard ftse')).toBe(true);
  });

  it('rejects blank-only input', () => {
    expect(isValidSearchQuery('   ')).toBe(false);
  });

  it('rejects overly long input', () => {
    expect(isValidSearchQuery('x'.repeat(65))).toBe(false);
  });

  it('rejects non-string', () => {
    expect(isValidSearchQuery(null)).toBe(false);
  });
});

describe('isValidHistoryOptions', () => {
  it('accepts omitted options', () => {
    expect(isValidHistoryOptions(undefined)).toBe(true);
    expect(isValidHistoryOptions(null)).toBe(true);
  });

  it('accepts whitelisted interval and range', () => {
    expect(isValidHistoryOptions({ interval: '1mo', range: '1y' })).toBe(true);
  });

  it('accepts a partial object', () => {
    expect(isValidHistoryOptions({ range: 'max' })).toBe(true);
  });

  it('rejects unknown interval', () => {
    expect(isValidHistoryOptions({ interval: '3s' })).toBe(false);
  });

  it('rejects unknown range', () => {
    expect(isValidHistoryOptions({ range: '100y' })).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isValidHistoryOptions('1mo')).toBe(false);
  });
});
