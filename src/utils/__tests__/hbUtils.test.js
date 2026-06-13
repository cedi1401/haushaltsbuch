import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  bookNeedsMigration,
  normalizeCategory,
  normalizeEntry,
  normalizeBook,
  normalizeBooks,
  makeDefaultBook,
  DEFAULT_POTS,
} from '../hbUtils.js';

// ─── bookNeedsMigration ────────────────────────────────────────────────────

describe('bookNeedsMigration', () => {
  it('returns true for null', () => {
    expect(bookNeedsMigration(null)).toBe(true);
  });

  it('returns true when schemaVersion is missing', () => {
    expect(bookNeedsMigration({})).toBe(true);
  });

  it('returns true when schemaVersion is below current', () => {
    expect(bookNeedsMigration({ schemaVersion: 1 })).toBe(true);
  });

  it('returns false when schemaVersion equals current', () => {
    expect(bookNeedsMigration({ schemaVersion: CURRENT_SCHEMA_VERSION })).toBe(false);
  });

  it('returns false when schemaVersion is above current', () => {
    expect(bookNeedsMigration({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toBe(false);
  });
});

// ─── normalizeCategory ────────────────────────────────────────────────────

describe('normalizeCategory', () => {
  it('converts a plain string to an object', () => {
    expect(normalizeCategory('Freizeit')).toEqual({ name: 'Freizeit', budget: null });
  });

  it('trims whitespace from string', () => {
    expect(normalizeCategory('  Miete  ')).toEqual({ name: 'Miete', budget: null });
  });

  it('falls back to "Allgemein" for empty string', () => {
    expect(normalizeCategory('')).toEqual({ name: 'Allgemein', budget: null });
  });

  it('normalizes an object category and preserves valid budget', () => {
    expect(normalizeCategory({ name: 'Essen', budget: 200 })).toEqual({ name: 'Essen', budget: 200 });
  });

  it('sets budget to null when budget is 0 or negative', () => {
    expect(normalizeCategory({ name: 'Essen', budget: 0 })).toEqual({ name: 'Essen', budget: null });
    expect(normalizeCategory({ name: 'Essen', budget: -5 })).toEqual({ name: 'Essen', budget: null });
  });

  it('returns fallback for invalid input', () => {
    expect(normalizeCategory(null)).toEqual({ name: 'Allgemein', budget: null });
    expect(normalizeCategory(undefined)).toEqual({ name: 'Allgemein', budget: null });
  });
});

// ─── normalizeEntry ───────────────────────────────────────────────────────

describe('normalizeEntry', () => {
  it('returns null/undefined unchanged', () => {
    expect(normalizeEntry(null)).toBe(null);
    expect(normalizeEntry(undefined)).toBe(undefined);
  });

  it('returns an already-migrated entry (has kind) unchanged', () => {
    const entry = { id: '1', kind: 'expense', source: 'month', amount: 50 };
    expect(normalizeEntry(entry)).toEqual(entry);
  });

  it('migrates type:income → kind:income', () => {
    const result = normalizeEntry({ id: '1', type: 'income', amount: 100 });
    expect(result.kind).toBe('income');
    expect(result.type).toBeUndefined();
  });

  it('migrates type:expense → kind:expense with source:month', () => {
    const result = normalizeEntry({ id: '1', type: 'expense', amount: 50 });
    expect(result.kind).toBe('expense');
    expect(result.source).toBe('month');
    expect(result.type).toBeUndefined();
  });

  it('migrates type:withdrawal → kind:withdrawal', () => {
    const result = normalizeEntry({ id: '1', type: 'withdrawal', amount: 30 });
    expect(result.kind).toBe('withdrawal');
    expect(result.type).toBeUndefined();
  });

  it('migrates type:transfer → kind:transfer', () => {
    const result = normalizeEntry({ id: '1', type: 'transfer', amount: 200 });
    expect(result.kind).toBe('transfer');
    expect(result.type).toBeUndefined();
  });

  it('falls back to expense/month for unknown type', () => {
    const result = normalizeEntry({ id: '1', type: 'unknown', amount: 10 });
    expect(result.kind).toBe('expense');
    expect(result.source).toBe('month');
  });

  it('preserves all other entry fields', () => {
    const result = normalizeEntry({ id: 'e1', type: 'income', amount: 3000, note: 'Gehalt', date: '2024-01-01' });
    expect(result.id).toBe('e1');
    expect(result.amount).toBe(3000);
    expect(result.note).toBe('Gehalt');
    expect(result.date).toBe('2024-01-01');
  });
});

// ─── normalizeBook ────────────────────────────────────────────────────────

describe('normalizeBook', () => {
  it('returns null for null input', () => {
    expect(normalizeBook(null)).toBe(null);
  });

  it('sets schemaVersion to CURRENT_SCHEMA_VERSION', () => {
    const result = normalizeBook({});
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('adds DEFAULT_POTS when pots is missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.pots).toEqual(DEFAULT_POTS);
  });

  it('preserves existing custom pots', () => {
    const customPots = [{ id: 'vacation', name: 'Urlaub' }];
    const result = normalizeBook({ id: 'b1', pots: customPots });
    expect(result.pots).toEqual(customPots);
  });

  it('removes initialBalance from pots during migration', () => {
    const pots = [{ id: 'reserve', name: 'Rücklagen', initialBalance: 500 }];
    const result = normalizeBook({ id: 'b1', pots });
    expect(result.pots[0].initialBalance).toBeUndefined();
    expect(result.pots[0].id).toBe('reserve');
  });

  it('initializes transferCategories as an empty array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.transferCategories).toEqual([]);
  });

  it('removes "Allgemein" from transferCategories', () => {
    const result = normalizeBook({ id: 'b1', transferCategories: ['Allgemein', 'Steuern'] });
    expect(result.transferCategories).not.toContain('Allgemein');
    expect(result.transferCategories).toContain('Steuern');
  });

  it('leaves transferCategories empty when filtering removes all entries', () => {
    const result = normalizeBook({ id: 'b1', transferCategories: ['Allgemein'] });
    expect(result.transferCategories).toEqual([]);
  });

  it('adds goals array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.goals).toEqual([]);
  });

  it('adds recurringExpenses array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.recurringExpenses).toEqual([]);
  });

  it('adds fixedCostGroups array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.fixedCostGroups).toEqual([]);
  });

  it('defaults baseCurrency to CHF when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.baseCurrency).toBe('CHF');
  });

  it('preserves existing baseCurrency', () => {
    const result = normalizeBook({ id: 'b1', baseCurrency: 'EUR' });
    expect(result.baseCurrency).toBe('EUR');
  });

  it('clamps monthStartDay to 1–28', () => {
    expect(normalizeBook({ id: 'b1', monthStartDay: 0 }).monthStartDay).toBe(1);
    expect(normalizeBook({ id: 'b1', monthStartDay: 29 }).monthStartDay).toBe(28);
    expect(normalizeBook({ id: 'b1', monthStartDay: 15 }).monthStartDay).toBe(15);
  });

  it('adds groupId:null to recurringExpenses that lack it', () => {
    const book = { id: 'b1', recurringExpenses: [{ id: 'r1', name: 'Miete', amount: 1200 }] };
    const result = normalizeBook(book);
    expect(result.recurringExpenses[0].groupId).toBe(null);
  });

  it('preserves existing groupId on recurringExpenses', () => {
    const book = { id: 'b1', recurringExpenses: [{ id: 'r1', groupId: 'g1', name: 'Miete' }] };
    const result = normalizeBook(book);
    expect(result.recurringExpenses[0].groupId).toBe('g1');
  });

  describe('old flat categories → hierarchical migration', () => {
    it('builds expenseCategories from old flat categories array', () => {
      const book = {
        id: 'b1',
        categories: [{ name: 'Miete', budget: null }],
        entries: [],
      };
      const result = normalizeBook(book);
      expect(Array.isArray(result.expenseCategories)).toBe(true);
      expect(result.expenseCategories.length).toBeGreaterThan(0);
      expect(result.categories).toBeUndefined();
    });

    it('creates default incomeCategories when migrating from old format', () => {
      const book = { id: 'b1', categories: [], entries: [] };
      const result = normalizeBook(book);
      expect(Array.isArray(result.incomeCategories)).toBe(true);
      expect(result.incomeCategories.length).toBeGreaterThan(0);
    });

    it('maps legacy expense category name to correct categoryId', () => {
      const book = {
        id: 'b1',
        categories: [],
        entries: [{ id: 'e1', type: 'expense', amount: 100, category: 'Miete' }],
      };
      const result = normalizeBook(book);
      expect(result.entries[0].categoryId).toBe('cat_wohnen');
      expect(result.entries[0].subcategoryId).toBe('sub_miete_wohngeld');
    });

    it('maps unknown legacy category name to cat_unkategorisiert', () => {
      const book = {
        id: 'b1',
        categories: [],
        entries: [{ id: 'e1', type: 'expense', amount: 50, category: 'Haustiere' }],
      };
      const result = normalizeBook(book);
      expect(result.entries[0].categoryId).toBe('cat_unkategorisiert');
    });

    it('assigns cat_einnahmen to income entries', () => {
      const book = {
        id: 'b1',
        categories: [],
        entries: [{ id: 'e1', type: 'income', amount: 3000 }],
      };
      const result = normalizeBook(book);
      expect(result.entries[0].kind).toBe('income');
      expect(result.entries[0].categoryId).toBe('cat_einnahmen');
    });

    it('sets null category on transfer entries', () => {
      const book = {
        id: 'b1',
        categories: [],
        entries: [{ id: 'e1', kind: 'transfer', amount: 200, potId: 'reserve' }],
      };
      const result = normalizeBook(book);
      expect(result.entries[0].categoryId).toBeNull();
      expect(result.entries[0].subcategoryId).toBeNull();
    });
  });

  describe('REMOVED_SUB_MAP migration', () => {
    it('remaps a removed subcategoryId to its replacement', () => {
      const book = {
        id: 'b1',
        expenseCategories: [],
        incomeCategories: [],
        entries: [{
          id: 'e1',
          kind: 'expense',
          source: 'month',
          amount: 50,
          categoryId: 'cat_shopping',
          subcategoryId: 'sub_elektronik_software',
        }],
      };
      const result = normalizeBook(book);
      expect(result.entries[0].categoryId).toBe('cat_shopping');
      expect(result.entries[0].subcategoryId).toBeNull();
    });

    it('remaps renamed subcategoryId via REMOVED_SUB_MAP', () => {
      const book = {
        id: 'b1',
        expenseCategories: [],
        incomeCategories: [],
        entries: [{
          id: 'e1',
          kind: 'expense',
          source: 'month',
          amount: 30,
          categoryId: 'cat_lebenshaltung',
          subcategoryId: 'sub_lebensmittel_getraenke',
        }],
      };
      const result = normalizeBook(book);
      expect(result.entries[0].subcategoryId).toBe('sub_lebensmittel_zuhause');
    });
  });

  describe('already-migrated book (has expenseCategories)', () => {
    it('does not delete categories field (already absent)', () => {
      const book = makeDefaultBook();
      const result = normalizeBook(book);
      expect(result.expenseCategories).toBeDefined();
      expect(result.categories).toBeUndefined();
    });

    it('merges new default categories without overwriting existing ones', () => {
      const book = makeDefaultBook();
      // Remove one default category to simulate an older version
      book.expenseCategories = book.expenseCategories.filter(c => c.id !== 'cat_bank');
      const result = normalizeBook(book);
      expect(result.expenseCategories.some(c => c.id === 'cat_bank')).toBe(true);
    });

    it('sets schemaVersion on already-migrated book', () => {
      const book = makeDefaultBook();
      book.schemaVersion = undefined;
      const result = normalizeBook(book);
      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });
  });
});

// ─── normalizeBooks ───────────────────────────────────────────────────────

describe('normalizeBooks', () => {
  it('returns non-array input unchanged', () => {
    expect(normalizeBooks(null)).toBe(null);
    expect(normalizeBooks(undefined)).toBe(undefined);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeBooks([])).toEqual([]);
  });

  it('normalizes all books in the array', () => {
    const books = [
      { id: 'b1', categories: [], entries: [] },
      { id: 'b2', categories: [], entries: [] },
    ];
    const result = normalizeBooks(books);
    expect(result).toHaveLength(2);
    expect(result[0].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result[1].schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
