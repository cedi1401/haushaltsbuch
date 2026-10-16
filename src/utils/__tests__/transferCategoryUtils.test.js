import { describe, it, expect } from 'vitest';
import {
  addTransferCategory,
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
