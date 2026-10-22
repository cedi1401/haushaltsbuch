import { describe, it, expect } from 'vitest';
import {
  addTransferCategory,
  applySavingsFields,
  deleteTransferCategory,
  renameTransferCategory,
  findTransferCategoryByName,
  getActiveTransferCategories,
  getTransferCategoryName,
  getTransferCategoryOptions,
  makeIsSavingsTransfer,
  makeIsSavingsExpense,
  makeIsSavingsEntry,
  makeIsSpendingExpense,
  validTransferCategoryId,
  purposeForPot,
} from '../transferCategoryUtils.js';

const LIST = [
  { id: 'tcat_steuern', name: 'Steuern' },
  { id: 'tcat_auto', name: 'Auto', deleted: true },
  { id: 'tcat_ferien', name: 'Ferien' },
];

describe('transferCategoryUtils', () => {
  it('liefert nur aktive Zwecke für die Auswahl', () => {
    expect(getActiveTransferCategories(LIST).map((c) => c.id)).toEqual(['tcat_steuern', 'tcat_ferien']);
  });

  it('kennt den Namen auch gelöschter Zwecke', () => {
    expect(getTransferCategoryName(LIST, 'tcat_auto')).toBe('Auto');
    expect(getTransferCategoryName(LIST, 'tcat_weg')).toBe('');
    expect(getTransferCategoryName(LIST, null)).toBe('');
  });

  it('sucht Namen ohne Groß-/Kleinschreibung, gelöschte nur auf Wunsch', () => {
    expect(findTransferCategoryByName(LIST, ' steuern ')?.id).toBe('tcat_steuern');
    expect(findTransferCategoryByName(LIST, 'auto')).toBe(null);
    expect(findTransferCategoryByName(LIST, 'auto', { includeDeleted: true })?.id).toBe('tcat_auto');
    expect(findTransferCategoryByName(LIST, 'Steuern', { excludeId: 'tcat_steuern' })).toBe(null);
  });

  it('reaktiviert beim Anlegen einen gleichnamigen gelöschten Zweck', () => {
    const { list, category } = addTransferCategory(LIST, 'auto');
    expect(category).toEqual({ id: 'tcat_auto', name: 'auto' });
    expect(list).toHaveLength(3);
    expect(getActiveTransferCategories(list)).toHaveLength(3);
  });

  it('hängt einen neuen Zweck mit frischer ID an', () => {
    const { list, category } = addTransferCategory(LIST, 'Velo');
    expect(category.id).toMatch(/^tcat_/);
    expect(list.at(-1)).toEqual(category);
  });

  it('benennt per ID um und löscht weich', () => {
    expect(renameTransferCategory(LIST, 'tcat_steuern', ' Abgaben ')[0]).toEqual({ id: 'tcat_steuern', name: 'Abgaben' });
    const deleted = deleteTransferCategory(LIST, 'tcat_ferien');
    expect(deleted).toHaveLength(3);
    expect(deleted[2]).toEqual({ id: 'tcat_ferien', name: 'Ferien', deleted: true });
  });

  it('fällt bei ungültiger ID auf den ersten Zweck zurück', () => {
    const active = getActiveTransferCategories(LIST);
    expect(validTransferCategoryId(active, 'tcat_ferien')).toBe('tcat_ferien');
    expect(validTransferCategoryId(active, 'tcat_auto')).toBe('tcat_steuern');
    expect(validTransferCategoryId([], 'tcat_auto')).toBe('');
  });

  it('zeigt einen gewählten gelöschten Zweck als eigene Option', () => {
    expect(getTransferCategoryOptions(LIST, 'tcat_steuern').map((o) => o.label)).toEqual(['Steuern', 'Ferien']);
    expect(getTransferCategoryOptions(LIST, 'tcat_auto').map((o) => o.label)).toEqual(['Steuern', 'Ferien', 'Auto (gelöscht)']);
    expect(getTransferCategoryOptions(LIST, 'tcat_auto', [LIST[0]]).map((o) => o.id)).toEqual(['tcat_steuern', 'tcat_auto']);
  });
});

describe('purposeForPot', () => {
  const list = [
    { id: 'tcat_a1', name: 'A1', potId: 'pot_a' },
    { id: 'tcat_a2', name: 'A2', potId: 'pot_a' },
    { id: 'tcat_b1', name: 'B1', potId: 'pot_b' },
  ];

  it('behält eine Sparposition des Topfs', () => {
    expect(purposeForPot(list, 'pot_a', 'tcat_a2')).toBe('tcat_a2');
    expect(purposeForPot(list, 'pot_a', 'tcat_a2', { suggest: true })).toBe('tcat_a2');
  });

  it('lässt „Ohne Sparposition“ stehen, schlägt mit suggest die erste vor', () => {
    expect(purposeForPot(list, 'pot_a', '')).toBe('');
    expect(purposeForPot(list, 'pot_a', '', { suggest: true })).toBe('tcat_a1');
  });

  it('ersetzt eine Sparposition aus einem anderen Topf', () => {
    expect(purposeForPot(list, 'pot_b', 'tcat_a1')).toBe('tcat_b1');
    expect(purposeForPot(list, 'pot_c', 'tcat_a1')).toBe('');
  });
});

describe('applySavingsFields', () => {
  const base = { id: 'tcat_x', name: 'Alt', potId: 'pot_a', tags: ['t'], showInOverview: true };

  it('macht aus einer Rücklage eine Rückstellung und lässt die Rate fallen', () => {
    const free = { ...base, rule: 'free', monthlyRate: 50 };
    const r = applySavingsFields(free, {
      rule: 'reserve', name: ' Steuern ', potId: 'pot_a', amount: 1200, turnus: 12, faelligkeit: '2027-03-15',
    });
    expect(r).toMatchObject({ id: 'tcat_x', rule: 'reserve', name: 'Steuern', amount: 1200, turnus: 12, faelligkeit: '2027-03-15' });
    expect(r).not.toHaveProperty('monthlyRate');
    // Felder außerhalb des Dialogs bleiben erhalten
    expect(r.tags).toEqual(['t']);
    expect(r.showInOverview).toBe(true);
  });

  it('schreibt Tags und „Im Trend auflisten", wenn sie mitkommen', () => {
    const r = applySavingsFields({ ...base, rule: 'free' }, {
      rule: 'free', name: 'Alt', potId: 'pot_a', monthlyRate: 30, tags: ['neu'], showInOverview: false,
    });
    expect(r.tags).toEqual(['neu']);
    expect(r.showInOverview).toBe(false);
  });

  it('entfernt beim Wechsel zur Rücklage Turnus und Fälligkeit', () => {
    const reserve = { ...base, rule: 'reserve', amount: 600, turnus: 6, faelligkeit: '2027-01-01' };
    const r = applySavingsFields(reserve, { rule: 'free', name: 'Alt', potId: 'pot_a', monthlyRate: '' });
    expect(r.rule).toBe('free');
    expect(r.monthlyRate).toBeNull();
    expect(r).not.toHaveProperty('turnus');
    expect(r).not.toHaveProperty('faelligkeit');
    expect(r).not.toHaveProperty('amount');
  });

  it('setzt das Anlagedatum eines neuen Sparziels und behält es beim Bearbeiten', () => {
    const neu = applySavingsFields({ ...base, rule: 'free' }, {
      rule: 'goal', name: 'Velo', potId: 'pot_a', targetAmount: 2000, deadline: '', monthlyRate: 100,
    }, '2026-10-17');
    expect(neu).toMatchObject({ rule: 'goal', targetAmount: 2000, deadline: null, monthlyRate: 100, createdAt: '2026-10-17', completedAt: null });

    const done = { ...neu, completedAt: '2026-12-01', completedAmount: 2000 };
    const edited = applySavingsFields(done, { rule: 'goal', name: 'Velo', potId: 'pot_a', targetAmount: 2500 }, '2027-01-01');
    expect(edited.createdAt).toBe('2026-10-17');
    expect(edited.completedAt).toBe('2026-12-01');
    expect(edited.monthlyRate).toBeNull();
  });

  it('löscht die Ziel-Felder, wenn ein Sparziel zur Rücklage wird', () => {
    const goal = { ...base, rule: 'goal', targetAmount: 1000, deadline: '2027-01-01', createdAt: '2026-01-01', completedAt: null };
    const r = applySavingsFields(goal, { rule: 'free', name: 'Alt', potId: 'pot_b', monthlyRate: 20 });
    expect(r).toMatchObject({ rule: 'free', potId: 'pot_b', monthlyRate: 20 });
    expect(r).not.toHaveProperty('targetAmount');
    expect(r).not.toHaveProperty('createdAt');
  });

  it('übernimmt die Kategorie einer Rückstellung', () => {
    const r = applySavingsFields({ ...base, rule: 'free' }, {
      rule: 'reserve', name: 'Auto', potId: 'pot_a', amount: 1200, turnus: 12, faelligkeit: '2027-03-15',
      categoryId: 'cat_auto', subcategoryId: 'sub_vers',
    });
    expect(r).toMatchObject({ categoryId: 'cat_auto', subcategoryId: 'sub_vers' });

    const ohne = applySavingsFields(r, {
      rule: 'reserve', name: 'Auto', potId: 'pot_a', amount: 1200, turnus: 12, faelligkeit: '2027-03-15',
    });
    expect(ohne).toMatchObject({ categoryId: null, subcategoryId: null });
  });

  it('verwirft eine Unterkategorie ohne Oberkategorie', () => {
    const r = applySavingsFields({ ...base, rule: 'free' }, {
      rule: 'reserve', name: 'Auto', potId: 'pot_a', amount: 1200, turnus: 12, faelligkeit: '2027-03-15',
      categoryId: null, subcategoryId: 'sub_vers',
    });
    expect(r.subcategoryId).toBeNull();
  });

  it('entfernt die Kategorie beim Wechsel zur Rücklage oder zum Sparziel', () => {
    const reserve = {
      ...base, rule: 'reserve', amount: 600, turnus: 6, faelligkeit: '2027-01-01',
      categoryId: 'cat_auto', subcategoryId: 'sub_vers',
    };
    const free = applySavingsFields(reserve, { rule: 'free', name: 'Alt', potId: 'pot_a' });
    expect(free).not.toHaveProperty('categoryId');
    expect(free).not.toHaveProperty('subcategoryId');
    const goal = applySavingsFields(reserve, { rule: 'goal', name: 'Alt', potId: 'pot_a', targetAmount: 500 }, '2026-10-21');
    expect(goal).not.toHaveProperty('categoryId');
  });
});

describe('makeIsSavingsTransfer', () => {
  const pots = [{ id: 'spar', isSavings: true }, { id: 'bar' }];
  const purposes = [
    { id: 'tcat_ferien', potId: 'spar', rule: 'free' },
    { id: 'tcat_auto', potId: 'spar', rule: 'goal' },
    { id: 'tcat_steuern', potId: 'spar', rule: 'reserve' },
    { id: 'tcat_kasse', potId: 'bar', rule: 'free' },
  ];
  const isSavings = makeIsSavingsTransfer(pots, purposes);
  const t = (potId, transferCategoryId) => ({ kind: 'transfer', potId, transferCategoryId });

  it('counts free and goal purposes in a savings pot', () => {
    expect(isSavings(t('spar', 'tcat_ferien'))).toBe(true);
    expect(isSavings(t('spar', 'tcat_auto'))).toBe(true);
  });

  it('excludes reserve purposes even in a savings pot', () => {
    expect(isSavings(t('spar', 'tcat_steuern'))).toBe(false);
  });

  it('lets transfers without purpose follow the pot', () => {
    expect(isSavings(t('spar', null))).toBe(true);
    expect(isSavings(t('bar', null))).toBe(false);
  });

  it('ignores purposes in non-savings pots and non-transfer entries', () => {
    expect(isSavings(t('bar', 'tcat_kasse'))).toBe(false);
    expect(isSavings({ kind: 'withdrawal', potId: 'spar' })).toBe(false);
  });
});

describe('savings expenses', () => {
  const categories = [
    { id: 'cat_sparen', countsAsSavings: true, subcategories: [{ id: 'sub_etf' }, { id: 'sub_eigen' }] },
    { id: 'cat_wohnen', subcategories: [] },
  ];
  const pots = [{ id: 'spar', isSavings: true }];
  const purposes = [{ id: 'tcat_steuern', potId: 'spar', rule: 'reserve' }];
  const x = (categoryId, subcategoryId = null, source = 'month') =>
    ({ kind: 'expense', source, categoryId, subcategoryId });

  it('counts month expenses in a savings category, incl. any subcategory', () => {
    const isSavingsExpense = makeIsSavingsExpense(categories);
    expect(isSavingsExpense(x('cat_sparen'))).toBe(true);
    expect(isSavingsExpense(x('cat_sparen', 'sub_etf'))).toBe(true);
    expect(isSavingsExpense(x('cat_sparen', 'sub_eigen'))).toBe(true);
    expect(isSavingsExpense(x('cat_wohnen'))).toBe(false);
  });

  it('never counts pot expenses or unknown categories', () => {
    const isSavingsExpense = makeIsSavingsExpense(categories);
    expect(isSavingsExpense(x('cat_sparen', 'sub_etf', 'pot'))).toBe(false);
    expect(isSavingsExpense(x('cat_geloescht'))).toBe(false);
    expect(isSavingsExpense({ kind: 'income', categoryId: 'cat_sparen' })).toBe(false);
  });

  it('splits month expenses into spending and savings without overlap', () => {
    const isSpending = makeIsSpendingExpense(categories);
    expect(isSpending(x('cat_wohnen'))).toBe(true);
    expect(isSpending(x('cat_sparen', 'sub_etf'))).toBe(false);
    expect(isSpending(x('cat_wohnen', null, 'pot'))).toBe(false);
  });

  it('combines savings transfers and savings expenses', () => {
    const isSavings = makeIsSavingsEntry(pots, purposes, categories);
    expect(isSavings({ kind: 'transfer', potId: 'spar', transferCategoryId: null })).toBe(true);
    expect(isSavings({ kind: 'transfer', potId: 'spar', transferCategoryId: 'tcat_steuern' })).toBe(false);
    expect(isSavings(x('cat_sparen', 'sub_etf'))).toBe(true);
    expect(isSavings(x('cat_wohnen'))).toBe(false);
  });
});
