import { describe, it, expect } from 'vitest';
import { searchEntries, searchHighlightPattern } from '../entrySearch.js';

const expenseCategories = [
  {
    id: 'cat_food',
    name: 'Lebensmittel',
    subcategories: [{ id: 'sub_coop', name: 'Coop' }],
  },
  { id: 'cat_home', name: 'Wohnen', subcategories: [] },
];
const incomeCategories = [{ id: 'cat_salary', name: 'Lohn', subcategories: [] }];
const transferCategories = [{ id: 'tc_car', name: 'Autoreparatur', potId: 'pot_1' }];
const categories = { expenseCategories, incomeCategories, transferCategories };

const entries = [
  { id: 'e1', kind: 'expense', amount: 45.9, note: 'Wocheneinkauf', categoryId: 'cat_food', subcategoryId: 'sub_coop' },
  { id: 'e2', kind: 'expense', amount: 1200, note: 'Miete Hauptstraße', categoryId: 'cat_home' },
  { id: 'e3', kind: 'income', amount: 5400, note: '', categoryId: 'cat_salary' },
  { id: 'e4', kind: 'transfer', amount: 200, note: 'Rate Oktober', potId: 'pot_1', transferCategoryId: 'tc_car' },
  { id: 'e5', kind: 'expense', amount: 45, note: 'Migros', category: 'Altkategorie' },
];

const ids = (list) => list.map((e) => e.id);

describe('searchEntries', () => {
  it('returns the same list for an empty or blank query', () => {
    expect(searchEntries(entries, '', categories)).toBe(entries);
    expect(searchEntries(entries, '   ', categories)).toBe(entries);
  });

  it('matches the note case-insensitively', () => {
    expect(ids(searchEntries(entries, 'migros', categories))).toEqual(['e5']);
  });

  it('matches ß when typing ss', () => {
    expect(ids(searchEntries(entries, 'hauptstrasse', categories))).toEqual(['e2']);
  });

  it('matches parent and subcategory names', () => {
    expect(ids(searchEntries(entries, 'lebensmittel', categories))).toEqual(['e1']);
    expect(ids(searchEntries(entries, 'coop', categories))).toEqual(['e1']);
    expect(ids(searchEntries(entries, 'lohn', categories))).toEqual(['e3']);
  });

  it('matches the savings position of transfers', () => {
    expect(ids(searchEntries(entries, 'auto', categories))).toEqual(['e4']);
  });

  it('falls back to the legacy category field', () => {
    expect(ids(searchEntries(entries, 'altkategorie', categories))).toEqual(['e5']);
  });

  it('matches whole amounts by their integer part', () => {
    expect(ids(searchEntries(entries, '45', categories))).toEqual(['e1', 'e5']);
    expect(ids(searchEntries(entries, '200', categories))).toEqual(['e4']);
  });

  it('matches decimal amounts by prefix, with comma or dot', () => {
    expect(ids(searchEntries(entries, '45.9', categories))).toEqual(['e1']);
    expect(ids(searchEntries(entries, '45,90', categories))).toEqual(['e1']);
    expect(ids(searchEntries(entries, '45.00', categories))).toEqual(['e5']);
  });

  it('accepts thousands separators and a sign', () => {
    expect(ids(searchEntries(entries, "1'200", categories))).toEqual(['e2']);
    expect(ids(searchEntries(entries, '-1200', categories))).toEqual(['e2']);
  });

  it('requires all words to match', () => {
    expect(ids(searchEntries(entries, 'coop 45', categories))).toEqual(['e1']);
    expect(ids(searchEntries(entries, 'migros 46', categories))).toEqual([]);
  });

  it('lets a number also match the note', () => {
    const withNumberInNote = [{ id: 'x', kind: 'expense', amount: 10, note: 'Rechnung 4711' }];
    expect(ids(searchEntries(withNumberInNote, '4711', categories))).toEqual(['x']);
  });
});

describe('searchHighlightPattern', () => {
  it('returns null for an empty query', () => {
    expect(searchHighlightPattern('  ')).toBeNull();
  });

  it('splits text around every word, case-insensitively and with ß for ss', () => {
    const pattern = searchHighlightPattern('miete STRASSE');
    expect('Miete Hauptstraße'.split(pattern)).toEqual(['', 'Miete', ' Haupt', 'straße', '']);
  });

  it('escapes regex characters', () => {
    expect('a (b) c'.split(searchHighlightPattern('(b)'))).toEqual(['a ', '(b)', ' c']);
  });
});
