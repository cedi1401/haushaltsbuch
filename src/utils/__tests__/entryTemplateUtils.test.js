import { describe, it, expect } from 'vitest';
import {
  normalizeEntryTemplate,
  makeEntryTemplate,
  templateToDraftPatch,
  getTemplateIssues,
} from '../entryTemplateUtils.js';

const CTX = {
  expenseCategories: [
    {
      id: 'cat_wohnen',
      name: 'Wohnen',
      color: '#0078d4',
      subcategories: [{ id: 'sub_miete', name: 'Miete' }],
    },
  ],
  incomeCategories: [{ id: 'cat_einnahmen', name: 'Einnahmen', subcategories: [] }],
  transferCategories: ['Steuern', 'Ferien'],
  pots: [{ id: 'pot_a', name: 'Rücklagen' }, { id: 'pot_b', name: 'Urlaub' }],
};

// ─── normalizeEntryTemplate ────────────────────────────────────────────────

describe('normalizeEntryTemplate', () => {
  it('returns null without a usable name', () => {
    expect(normalizeEntryTemplate(null)).toBe(null);
    expect(normalizeEntryTemplate({})).toBe(null);
    expect(normalizeEntryTemplate({ name: '   ' })).toBe(null);
    expect(normalizeEntryTemplate('kaputt')).toBe(null);
  });

  it('trims the name and caps it at 50 characters', () => {
    const result = normalizeEntryTemplate({ name: `  ${'x'.repeat(60)}  ` });
    expect(result.name).toHaveLength(50);
  });

  it('falls back to kind "expense" for unknown kinds', () => {
    expect(normalizeEntryTemplate({ name: 'A', kind: 'quatsch' }).kind).toBe('expense');
  });

  it('nulls out an unusable amount', () => {
    expect(normalizeEntryTemplate({ name: 'A', amount: 0 }).amount).toBe(null);
    expect(normalizeEntryTemplate({ name: 'A', amount: -5 }).amount).toBe(null);
    expect(normalizeEntryTemplate({ name: 'A', amount: 'abc' }).amount).toBe(null);
    expect(normalizeEntryTemplate({ name: 'A' }).amount).toBe(null);
    expect(normalizeEntryTemplate({ name: 'A', amount: 12.9 }).amount).toBe(12.9);
  });

  it('drops category fields that do not belong to the kind', () => {
    const transfer = normalizeEntryTemplate({
      name: 'A', kind: 'transfer', categoryId: 'cat_wohnen', category: 'Steuern', potId: 'pot_a',
    });
    expect(transfer.categoryId).toBe(null);
    expect(transfer.category).toBe('Steuern');
    expect(transfer.potId).toBe('pot_a');

    const expense = normalizeEntryTemplate({
      name: 'A', kind: 'expense', categoryId: 'cat_wohnen', category: 'Steuern', potId: 'pot_a',
    });
    expect(expense.categoryId).toBe('cat_wohnen');
    expect(expense.category).toBe('');
    expect(expense.potId).toBe('');
  });

  it('generates an id when one is missing', () => {
    expect(normalizeEntryTemplate({ name: 'A' }).id).toMatch(/^tpl_/);
  });
});

// ─── makeEntryTemplate ─────────────────────────────────────────────────────

describe('makeEntryTemplate', () => {
  it('creates a template with a fresh id and usageCount 0', () => {
    const tpl = makeEntryTemplate({ name: 'Wocheneinkauf', kind: 'expense' });
    expect(tpl.id).toMatch(/^tpl_/);
    expect(tpl.usageCount).toBe(0);
    expect(tpl.name).toBe('Wocheneinkauf');
  });
});

// ─── templateToDraftPatch ──────────────────────────────────────────────────

describe('templateToDraftPatch', () => {
  it('resolves an intact expense template', () => {
    const patch = templateToDraftPatch(
      { kind: 'expense', categoryId: 'cat_wohnen', subcategoryId: 'sub_miete', note: 'Migros', amount: 42 },
      CTX
    );
    expect(patch).toEqual({
      kind: 'expense',
      note: 'Migros',
      amount: '42',
      categoryId: 'cat_wohnen',
      subcategoryId: 'sub_miete',
    });
  });

  it('nulls categoryId when the category was deleted', () => {
    const patch = templateToDraftPatch(
      { kind: 'expense', categoryId: 'cat_weg', subcategoryId: 'sub_miete', amount: null },
      CTX
    );
    expect(patch.categoryId).toBe(null);
    expect(patch.subcategoryId).toBe(null);
  });

  it('nulls a subcategory that no longer sits under the category', () => {
    const patch = templateToDraftPatch(
      { kind: 'expense', categoryId: 'cat_wohnen', subcategoryId: 'sub_weg' },
      CTX
    );
    expect(patch.categoryId).toBe('cat_wohnen');
    expect(patch.subcategoryId).toBe(null);
  });

  it('falls back to the first transfer category for an unknown purpose', () => {
    const patch = templateToDraftPatch(
      { kind: 'transfer', category: 'Gelöscht', potId: 'pot_b' },
      CTX
    );
    expect(patch.category).toBe('Steuern');
    expect(patch.potId).toBe('pot_b');
  });

  it('falls back to the first pot when the pot was deleted', () => {
    const patch = templateToDraftPatch(
      { kind: 'transfer', category: 'Ferien', potId: 'pot_weg' },
      CTX
    );
    expect(patch.potId).toBe('pot_a');
  });

  it('prefers the current draft pot over the first pot as fallback', () => {
    const patch = templateToDraftPatch(
      { kind: 'transfer', category: 'Ferien', potId: 'pot_weg' },
      { ...CTX, fallbackPotId: 'pot_b' }
    );
    expect(patch.potId).toBe('pot_b');
  });

  it('leaves the draft amount untouched when amount is null', () => {
    const patch = templateToDraftPatch({ kind: 'expense', categoryId: 'cat_wohnen', amount: null }, CTX);
    expect(patch).not.toHaveProperty('amount');
  });

  it('always overwrites the note, even with an empty string', () => {
    const patch = templateToDraftPatch({ kind: 'expense', note: '' }, CTX);
    expect(patch.note).toBe('');
  });

  it('returns an empty patch for a missing template', () => {
    expect(templateToDraftPatch(null, CTX)).toEqual({});
  });
});

// ─── getTemplateIssues ─────────────────────────────────────────────────────

describe('getTemplateIssues', () => {
  it('reports nothing for an intact template', () => {
    expect(getTemplateIssues({ kind: 'expense', categoryId: 'cat_wohnen', subcategoryId: 'sub_miete' }, CTX))
      .toEqual([]);
    expect(getTemplateIssues({ kind: 'transfer', category: 'Steuern', potId: 'pot_a' }, CTX))
      .toEqual([]);
  });

  it('reports a deleted category', () => {
    const issues = getTemplateIssues({ kind: 'expense', categoryId: 'cat_weg' }, CTX);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Kategorie');
  });

  it('reports a deleted subcategory', () => {
    const issues = getTemplateIssues({ kind: 'expense', categoryId: 'cat_wohnen', subcategoryId: 'sub_weg' }, CTX);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Unterkategorie');
  });

  it('reports a deleted transfer purpose and a deleted pot', () => {
    const issues = getTemplateIssues({ kind: 'transfer', category: 'Weg', potId: 'pot_weg' }, CTX);
    expect(issues).toHaveLength(2);
  });

  it('reports missing pots', () => {
    const issues = getTemplateIssues({ kind: 'transfer', category: 'Steuern', potId: 'pot_a' }, { ...CTX, pots: [] });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Töpfe');
  });
});
