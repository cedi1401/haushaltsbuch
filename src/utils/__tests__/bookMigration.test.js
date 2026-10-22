import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  bookNeedsMigration,
  normalizeCategory,
  normalizeEntry,
  normalizeBook,
  normalizeBooks,
  normalizeCategoryBudgets,
  migrateFixedCostKinds,
} from '../bookMigration.js';
import { makeDefaultBook, DEFAULT_POTS } from '../bookDefaults.js';

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

// ─── bankRef (Bankimport) ─────────────────────────────────────────────────

describe('bankRef on imported entries', () => {
  const bankRef = { ref: 'ZV20261001/000001/1', iban: 'CH9300762011623852957', text: 'Laden Muster 1234' };
  const importedEntry = {
    id: 'e_imp',
    kind: 'expense',
    source: 'month',
    amount: 12.5,
    date: '2026-10-01',
    note: 'Laden Muster 1234',
    categoryId: 'cat_lebensmittel',
    subcategoryId: null,
    category: 'Lebensmittel',
    bankRef,
  };

  it('normalizeEntry keeps bankRef', () => {
    expect(normalizeEntry(importedEntry).bankRef).toEqual(bankRef);
  });

  it('normalizeBook keeps bankRef on current and old schema versions', () => {
    for (const schemaVersion of [CURRENT_SCHEMA_VERSION, 6, undefined]) {
      const book = { ...makeDefaultBook('Test'), schemaVersion, entries: [importedEntry] };
      const result = normalizeBook(book);
      expect(result.entries[0].bankRef).toEqual(bankRef);
    }
  });

  it('keeps bankRef on an uncategorised expense and on income', () => {
    const book = {
      ...makeDefaultBook('Test'),
      entries: [
        { ...importedEntry, id: 'a', categoryId: null, category: '' },
        { ...importedEntry, id: 'b', kind: 'income', source: undefined, categoryId: 'cat_einnahmen' },
      ],
    };
    const result = normalizeBook(book);
    expect(result.entries.map((e) => e.bankRef)).toEqual([bankRef, bankRef]);
  });

  it('is idempotent with bankRef', () => {
    const once = normalizeBook({ ...makeDefaultBook('Test'), entries: [importedEntry] });
    expect(normalizeBook(once).entries).toEqual(once.entries);
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

  // Die Investment-Funktion ist entfernt; Altdaten bleiben trotzdem erhalten.
  it('leaves an existing investments field untouched', () => {
    const investments = { depots: [{ id: 'dep_1', name: 'Swissquote' }], assets: [], transactions: [], snapshots: [] };
    const result = normalizeBook({ id: 'b1', investments });
    expect(result.investments).toEqual(investments);
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
    expect(result.transferCategories.map((c) => c.name)).toEqual(['Steuern']);
  });

  it('migrates transfer purposes to ids', () => {
    const result = normalizeBook({
      id: 'b1',
      schemaVersion: 5,
      transferCategories: ['Steuern'],
      entries: [{ id: 'e1', kind: 'transfer', potId: 'p1', category: 'Steuern', amount: 10, categoryId: null }],
    });
    const [steuern] = result.transferCategories;
    expect(steuern).toMatchObject({ id: expect.stringMatching(/^tcat_/), name: 'Steuern' });
    expect(result.entries[0].transferCategoryId).toBe(steuern.id);
    expect(result.entries[0]).not.toHaveProperty('category');
  });

  it('leaves transferCategories empty when filtering removes all entries', () => {
    const result = normalizeBook({ id: 'b1', transferCategories: ['Allgemein'] });
    expect(result.transferCategories).toEqual([]);
  });

  it('drops goals (schema 7: goals are purposes)', () => {
    expect(normalizeBook({ id: 'b1' })).not.toHaveProperty('goals');
    expect(normalizeBook({ id: 'b1', schemaVersion: 7, goals: [] })).not.toHaveProperty('goals');
  });

  it('adds recurringExpenses array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.recurringExpenses).toEqual([]);
  });

  it('adds fixedCostGroups array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.fixedCostGroups).toEqual([]);
  });

  it('adds entryTemplates array when missing', () => {
    const result = normalizeBook({ id: 'b1' });
    expect(result.entryTemplates).toEqual([]);
  });

  it('replaces a non-array entryTemplates value with an empty array', () => {
    const result = normalizeBook({ id: 'b1', entryTemplates: 'kaputt' });
    expect(result.entryTemplates).toEqual([]);
  });

  it('drops malformed entryTemplates and normalizes the rest', () => {
    const result = normalizeBook({
      id: 'b1',
      entryTemplates: [
        null,
        { id: 'tpl_1', name: '  Wocheneinkauf  ', kind: 'expense', categoryId: 'cat_x' },
        { id: 'tpl_2', name: '   ' },
        'kaputt',
      ],
    });
    expect(result.entryTemplates).toHaveLength(1);
    expect(result.entryTemplates[0].id).toBe('tpl_1');
    expect(result.entryTemplates[0].name).toBe('Wocheneinkauf');
    expect(result.entryTemplates[0].amount).toBe(null);
    expect(result.entryTemplates[0].usageCount).toBe(0);
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

  it('defaults turnus and faelligkeit to null when missing', () => {
    const book = { id: 'b1', recurringExpenses: [{ id: 'r1', name: 'Miete', amount: 1200 }] };
    const result = normalizeBook(book);
    expect(result.recurringExpenses[0].turnus).toBe(null);
    expect(result.recurringExpenses[0].faelligkeit).toBe(null);
  });

  // Transfer-Positionen gehen in Schema 7 in Zwecke auf (savingsPurposeMigration).
  it('turns a transfer with turnus and faelligkeit into a reserve purpose', () => {
    const book = {
      id: 'b1',
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Autoversicherung', amount: 1200, turnus: 12, faelligkeit: '2027-03-15' },
      ],
    };
    const result = normalizeBook(book);
    expect(result.recurringExpenses).toEqual([]);
    expect(result.transferCategories[0]).toMatchObject({
      name: 'Autoversicherung', rule: 'reserve', amount: 1200, turnus: 12, faelligkeit: '2027-03-15',
    });
  });

  it('does not derive a turnus for an existing transfer without one', () => {
    const book = {
      id: 'b1',
      recurringExpenses: [{ id: 'r1', kind: 'transfer', name: 'Sparen', amount: 200 }],
    };
    const [purpose] = normalizeBook(book).transferCategories;
    expect(purpose).toMatchObject({ name: 'Sparen', rule: 'free', monthlyRate: 200 });
    expect(purpose).not.toHaveProperty('turnus');
  });

  it('drops a turnus without faelligkeit (no cycle anchor)', () => {
    const book = {
      id: 'b1',
      recurringExpenses: [{ id: 'r1', kind: 'transfer', name: 'Sparen', amount: 200, turnus: 6 }],
    };
    const [purpose] = normalizeBook(book).transferCategories;
    expect(purpose).toMatchObject({ rule: 'free', monthlyRate: 200 });
    expect(purpose).not.toHaveProperty('turnus');
  });

  it('drops turnus and faelligkeit on an expense', () => {
    const book = {
      id: 'b1',
      recurringExpenses: [
        { id: 'r1', kind: 'expense', name: 'Miete', amount: 1200, turnus: 12, faelligkeit: '2027-03-15' },
      ],
    };
    const result = normalizeBook(book);
    expect(result.recurringExpenses[0].turnus).toBe(null);
    expect(result.recurringExpenses[0].faelligkeit).toBe(null);
  });

  describe('recurringId migration (schema 3 → 4)', () => {
    const recurring = [
      { id: 'r_miete', kind: 'expense', name: 'Miete', amount: 1200 },
      { id: 'r_versicherung', kind: 'transfer', name: 'Versicherung', amount: 600 },
    ];
    const bookAt = (version, entries) => ({
      id: 'b1',
      schemaVersion: version,
      recurringExpenses: recurring,
      entries,
    });

    it('stamps an entry whose note matches a recurring expense name', () => {
      const result = normalizeBook(bookAt(3, [
        { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 1200, note: 'Miete', categoryId: null },
      ]));
      expect(result.entries[0].recurringId).toBe('r_miete');
    });

    it('stamps transfers as well — schema 7 then moves them to the purpose', () => {
      const result = normalizeBook(bookAt(3, [
        { id: 'e1', kind: 'transfer', date: '2026-01-05', amount: 50, note: 'Versicherung', categoryId: null },
      ]));
      const purpose = result.transferCategories.find((c) => c.name === 'Versicherung');
      expect(result.entries[0].transferCategoryId).toBe(purpose.id);
      expect(result.entries[0]).not.toHaveProperty('recurringId');
    });

    it('leaves an entry with a different note unstamped', () => {
      const result = normalizeBook(bookAt(3, [
        { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 40, note: 'Miete Garage', categoryId: null },
      ]));
      expect(result.entries[0].recurringId).toBeUndefined();
    });

    it('never stamps a withdrawal, even with a matching note', () => {
      const result = normalizeBook(bookAt(3, [
        { id: 'e1', kind: 'withdrawal', date: '2026-01-05', amount: 600, note: 'Versicherung', potId: 'reserve', categoryId: null },
      ]));
      expect(result.entries[0].recurringId).toBeUndefined();
    });

    it('does not stamp new entries once the book is already at schema 4 (C1)', () => {
      const result = normalizeBook(bookAt(4, [
        { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 1200, note: 'Miete', categoryId: null },
      ]));
      expect(result.entries[0].recurringId).toBeUndefined();
    });

    it('keeps an already stamped recurringId (idempotent for backup imports)', () => {
      const result = normalizeBook(bookAt(3, [
        { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 1200, note: 'Miete', recurringId: 'r_fremd', categoryId: null },
      ]));
      expect(result.entries[0].recurringId).toBe('r_fremd');
    });

    it('is stable across a second normalizeBook run', () => {
      const once = normalizeBook(bookAt(3, [
        { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 1200, note: 'Miete', categoryId: null },
        { id: 'e2', kind: 'expense', source: 'month', date: '2026-01-06', amount: 40, note: 'Kiosk', categoryId: null },
      ]));
      const twice = normalizeBook(once);
      expect(twice.entries.map((e) => e.recurringId)).toEqual(once.entries.map((e) => e.recurringId));
      expect(twice.entries[1].recurringId).toBeUndefined();
    });

    it('assigns the first of two identically named positions (D7)', () => {
      const book = {
        id: 'b1',
        schemaVersion: 3,
        recurringExpenses: [
          { id: 'r_erste', kind: 'expense', name: 'Strom', amount: 80 },
          { id: 'r_zweite', kind: 'expense', name: 'Strom', amount: 90 },
        ],
        entries: [
          { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 80, note: 'Strom', categoryId: null },
        ],
      };
      expect(normalizeBook(book).entries[0].recurringId).toBe('r_erste');
    });

    it('leaves entries untouched when the book has no recurring expenses', () => {
      const entries = [
        { id: 'e1', kind: 'expense', source: 'month', date: '2026-01-05', amount: 40, note: 'Kiosk', categoryId: null },
      ];
      const result = normalizeBook({ id: 'b1', schemaVersion: 3, recurringExpenses: [], entries });
      expect(result.entries[0].recurringId).toBeUndefined();
    });

    it('bumps schemaVersion to the current version', () => {
      expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
      expect(normalizeBook({ id: 'b1', schemaVersion: 3 }).schemaVersion).toBe(
        CURRENT_SCHEMA_VERSION
      );
    });
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
          subcategoryId: 'sub_bueromaterial',
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

  describe('countsAsSavings', () => {
    const flagged = (book) =>
      book.expenseCategories.filter((c) => c.countsAsSavings).map((c) => c.id);

    it('marks only "Sparen und Anlegen" in a new book', () => {
      expect(flagged(normalizeBook(makeDefaultBook()))).toEqual(['cat_sparen']);
    });

    it('adds the flag to existing books that lack it', () => {
      const book = makeDefaultBook();
      book.expenseCategories = book.expenseCategories.map(({ countsAsSavings: _drop, ...c }) => c);
      expect(flagged(normalizeBook(book))).toEqual(['cat_sparen']);
    });

    it('resets the flag on default categories but keeps it on custom ones', () => {
      const book = makeDefaultBook();
      book.expenseCategories = [
        ...book.expenseCategories.map((c) =>
          c.id === 'cat_wohnen' ? { ...c, countsAsSavings: true } : c
        ),
        { id: 'cat_custom', name: 'Eigene', isDefault: false, countsAsSavings: true, subcategories: [] },
      ];
      expect(flagged(normalizeBook(book)).sort()).toEqual(['cat_custom', 'cat_sparen']);
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

// ─── Fixkosten: Spaltenzuordnung ──────────────────────────────────────────

describe('migrateFixedCostKinds', () => {
  const items = [
    { id: 'r1', kind: 'expense', groupId: 'g_exp' },
    { id: 'r2', kind: 'expense', groupId: 'g_exp' },
    { id: 'r3', kind: 'transfer', groupId: 'g_exp' },
    { id: 'r4', kind: 'transfer', groupId: 'g_tra' },
    { id: 'r5', kind: 'transfer', groupId: 'g_tra' },
    { id: 'r6', kind: 'expense', groupId: 'g_tie' },
    { id: 'r7', kind: 'transfer', groupId: 'g_tie' },
    { id: 'r8', kind: 'transfer', groupId: null },
  ];
  const groups = [
    { id: 'g_exp', name: 'Wohnen' },
    { id: 'g_tra', name: 'Rücklagen' },
    { id: 'g_tie', name: 'Gemischt' },
    { id: 'g_empty', name: 'Leer' },
  ];

  it('assigns the kind of the majority of contained items', () => {
    const result = migrateFixedCostKinds(groups, items);
    const byId = new Map(result.groups.map((g) => [g.id, g.kind]));
    expect(byId.get('g_exp')).toBe('expense');
    expect(byId.get('g_tra')).toBe('transfer');
  });

  it('falls back to expense on a tie and for empty groups', () => {
    const result = migrateFixedCostKinds(groups, items);
    const byId = new Map(result.groups.map((g) => [g.id, g.kind]));
    expect(byId.get('g_tie')).toBe('expense');
    expect(byId.get('g_empty')).toBe('expense');
  });

  it('detaches items whose kind does not match their group', () => {
    const result = migrateFixedCostKinds(groups, items);
    const byId = new Map(result.items.map((r) => [r.id, r.groupId]));
    expect(byId.get('r3')).toBe(null); // transfer in an expense group
    expect(byId.get('r7')).toBe(null); // transfer in a tie group → expense
    expect(byId.get('r1')).toBe('g_exp');
    expect(byId.get('r4')).toBe('g_tra');
  });

  it('leaves items pointing at a non-existent group untouched', () => {
    const result = migrateFixedCostKinds([], [{ id: 'r1', kind: 'expense', groupId: 'gone' }]);
    expect(result.items[0].groupId).toBe('gone');
  });

  it('keeps an explicit kind on already migrated groups', () => {
    const result = migrateFixedCostKinds(
      [{ id: 'g1', kind: 'transfer' }],
      [{ id: 'r1', kind: 'transfer', groupId: 'g1' }]
    );
    expect(result.groups[0].kind).toBe('transfer');
  });

  it('is idempotent and returns the original arrays when nothing changes', () => {
    const first = migrateFixedCostKinds(groups, items);
    const second = migrateFixedCostKinds(first.groups, first.items);
    expect(second.groups).toBe(first.groups);
    expect(second.items).toBe(first.items);
  });

  it('normalizeBook applies the migration and is idempotent', () => {
    const book = { id: 'b1', name: 'Test', fixedCostGroups: groups, recurringExpenses: items };
    const once = normalizeBook(book);
    const twice = normalizeBook(once);
    expect(once.fixedCostGroups.map((g) => g.kind)).toEqual(['expense', 'transfer', 'expense', 'expense']);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

// ─── normalizeCategoryBudgets ──────────────────────────────────────────────

describe('normalizeCategoryBudgets', () => {
  const subs = (...budgets) => budgets.map((budget, i) => ({ id: `sub-${i}`, name: `Sub ${i}`, budget }));

  it('aus reinen Unterkategorie-Budgets wird deren Summe als Budget der Oberkategorie', () => {
    const [cat] = normalizeCategoryBudgets([{ id: 'c', name: 'C', budget: null, subcategories: subs(50, 80.5, null) }]);
    expect(cat.budget).toBe(130.5);
    expect(cat.subcategories.map((s) => s.budget)).toEqual([50, 80.5, null]);
  });

  it('hebt ein zu kleines Budget der Oberkategorie auf die Summe an', () => {
    const [cat] = normalizeCategoryBudgets([{ id: 'c', name: 'C', budget: 100, subcategories: subs(80, 70) }]);
    expect(cat.budget).toBe(150);
  });

  it('lässt gültige Kategorien unangetastet und gibt dann dieselbe Liste zurück', () => {
    const list = [
      { id: 'a', name: 'A', budget: 200, subcategories: subs(80, 70) },
      { id: 'b', name: 'B', budget: 150, subcategories: subs(80, 70) },
      { id: 'c', name: 'C', budget: 300, subcategories: [] },
      { id: 'd', name: 'D', budget: null, subcategories: subs(null, 0) },
      { id: 'e', name: 'E' },
    ];
    expect(normalizeCategoryBudgets(list)).toBe(list);
  });

  it('rundet die Summe auf zwei Stellen', () => {
    const [cat] = normalizeCategoryBudgets([{ id: 'c', name: 'C', subcategories: subs(0.1, 0.2) }]);
    expect(cat.budget).toBe(0.3);
  });

  it('ohne Liste: Eingabe unverändert', () => {
    expect(normalizeCategoryBudgets(undefined)).toBeUndefined();
    expect(normalizeCategoryBudgets(null)).toBeNull();
  });

  it('normalizeBook wendet die Regel auf bestehende Bücher an', () => {
    const book = makeDefaultBook('Test');
    const target = book.expenseCategories.find((c) => (c.subcategories || []).length >= 2);
    target.budget = null;
    target.subcategories[0].budget = 120;
    target.subcategories[1].budget = 30;
    const result = normalizeBook(book).expenseCategories.find((c) => c.id === target.id);
    expect(result.budget).toBe(150);
    expect(result.subcategories.slice(0, 2).map((s) => s.budget)).toEqual([120, 30]);
  });
});
