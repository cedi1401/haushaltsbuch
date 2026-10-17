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
  validTransferCategoryId,
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
});
