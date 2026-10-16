import { describe, it, expect } from 'vitest';
import { migrateTransferCategoryIds } from '../transferCategoryMigration.js';

const idOf = (result, name) => result.transferCategories.find((c) => c.name === name)?.id;

describe('migrateTransferCategoryIds', () => {
  it('wandelt die String-Liste in Objekte mit ID', () => {
    const result = migrateTransferCategoryIds({ transferCategories: ['Steuern', 'Ferien'] });
    expect(result.transferCategories).toEqual([
      { id: expect.stringMatching(/^tcat_/), name: 'Steuern' },
      { id: expect.stringMatching(/^tcat_/), name: 'Ferien' },
    ]);
    expect(idOf(result, 'Steuern')).not.toBe(idOf(result, 'Ferien'));
  });

  it('entfernt "Allgemein", leere Namen und Dubletten aus der String-Liste', () => {
    const result = migrateTransferCategoryIds({ transferCategories: ['Allgemein', ' ', 'Steuern', 'Steuern '] });
    expect(result.transferCategories.map((c) => c.name)).toEqual(['Steuern']);
  });

  it('stellt alle vier Referenzarten auf transferCategoryId um', () => {
    const result = migrateTransferCategoryIds({
      transferCategories: ['Steuern'],
      entries: [
        { id: 'e1', kind: 'transfer', potId: 'p1', category: 'Steuern' },
        { id: 'e2', kind: 'withdrawal', potId: 'p1', category: 'Steuern ' },
      ],
      recurringExpenses: [{ id: 'r1', kind: 'transfer', potId: 'p1', transferCategory: 'Steuern' }],
      goals: [{ id: 'g1', potId: 'p1', transferCategory: 'Steuern' }],
      entryTemplates: [{ id: 't1', name: 'T', kind: 'transfer', category: 'Steuern', potId: 'p1' }],
    });
    const id = idOf(result, 'Steuern');
    expect(result.entries.map((e) => e.transferCategoryId)).toEqual([id, id]);
    expect(result.recurringExpenses[0].transferCategoryId).toBe(id);
    expect(result.goals[0].transferCategoryId).toBe(id);
    expect(result.entryTemplates[0].transferCategoryId).toBe(id);
    expect(result.entries[0]).not.toHaveProperty('category');
    expect(result.recurringExpenses[0]).not.toHaveProperty('transferCategory');
    expect(result.goals[0]).not.toHaveProperty('transferCategory');
    expect(result.entryTemplates[0]).not.toHaveProperty('category');
  });

  it('legt referenzierte, aber gelöschte Zwecke als deleted an', () => {
    const result = migrateTransferCategoryIds({
      transferCategories: ['Steuern'],
      entries: [
        { id: 'e1', kind: 'withdrawal', potId: 'p1', category: 'Auto' },
        { id: 'e2', kind: 'transfer', potId: 'p1', category: 'Auto' },
      ],
      goals: [{ id: 'g1', potId: 'p1', transferCategory: 'Auto' }],
    });
    const auto = result.transferCategories.find((c) => c.name === 'Auto');
    expect(auto).toEqual({ id: expect.stringMatching(/^tcat_/), name: 'Auto', deleted: true });
    expect(result.transferCategories).toHaveLength(2);
    expect(result.entries.map((e) => e.transferCategoryId)).toEqual([auto.id, auto.id]);
    expect(result.goals[0].transferCategoryId).toBe(auto.id);
  });

  it('setzt leere Zwecke auf null (z.B. Monatsüberschuss, Sparziel ohne Zweck)', () => {
    const result = migrateTransferCategoryIds({
      transferCategories: [],
      entries: [{ id: 'e1', kind: 'transfer', potId: 'p1', category: '', isSurplusSweep: true }],
      goals: [{ id: 'g1', potId: 'p1', transferCategory: null }],
    });
    expect(result.entries[0].transferCategoryId).toBe(null);
    expect(result.goals[0].transferCategoryId).toBe(null);
    expect(result.transferCategories).toEqual([]);
  });

  it('lässt Einnahmen und Ausgaben samt Legacy-Feld category unangetastet', () => {
    const expense = { id: 'e1', kind: 'expense', category: 'Steuern', categoryId: 'cat_steuern' };
    const result = migrateTransferCategoryIds({ transferCategories: ['Steuern'], entries: [expense] });
    expect(result.entries[0]).toBe(expense);
  });

  it('gibt Ausgaben-Fixkosten und Kategorie-Vorlagen keinen Zweck', () => {
    const result = migrateTransferCategoryIds({
      transferCategories: ['Steuern'],
      recurringExpenses: [{ id: 'r1', kind: 'expense', transferCategory: 'Steuern' }],
      entryTemplates: [{ id: 't1', name: 'T', kind: 'expense', category: '' }],
    });
    expect(result.recurringExpenses[0].transferCategoryId).toBe(null);
    expect(result.entryTemplates[0].transferCategoryId).toBe(null);
    expect(result.transferCategories).toHaveLength(1);
  });

  it('ist idempotent', () => {
    const once = migrateTransferCategoryIds({
      transferCategories: ['Steuern'],
      entries: [
        { id: 'e1', kind: 'transfer', potId: 'p1', category: 'Steuern' },
        { id: 'e2', kind: 'withdrawal', potId: 'p1', category: 'Auto' },
      ],
      recurringExpenses: [{ id: 'r1', kind: 'transfer', transferCategory: 'Steuern' }],
      goals: [{ id: 'g1', transferCategory: '' }],
      entryTemplates: [{ id: 't1', name: 'T', kind: 'withdrawal', category: 'Auto' }],
    });
    const twice = migrateTransferCategoryIds(once);
    expect(twice).toEqual(once);
  });

  it('behält bestehende IDs und das deleted-Flag', () => {
    const list = [
      { id: 'tcat_a', name: 'Steuern' },
      { id: 'tcat_b', name: 'Auto', deleted: true },
    ];
    const result = migrateTransferCategoryIds({ transferCategories: list });
    expect(result.transferCategories).toEqual(list);
  });

  it('bevorzugt bei Namensgleichheit den aktiven Zweck', () => {
    const result = migrateTransferCategoryIds({
      transferCategories: [
        { id: 'tcat_alt', name: 'Auto', deleted: true },
        { id: 'tcat_neu', name: 'Auto' },
      ],
      entries: [{ id: 'e1', kind: 'transfer', potId: 'p1', category: 'Auto' }],
    });
    expect(result.entries[0].transferCategoryId).toBe('tcat_neu');
  });

  it('übernimmt eine bereits gesetzte ID und verwirft das Legacy-Feld', () => {
    const result = migrateTransferCategoryIds({
      transferCategories: [{ id: 'tcat_a', name: 'Steuern' }],
      entries: [{ id: 'e1', kind: 'transfer', transferCategoryId: 'tcat_a', category: 'Anderes' }],
    });
    expect(result.entries[0]).toEqual({ id: 'e1', kind: 'transfer', transferCategoryId: 'tcat_a' });
    expect(result.transferCategories).toHaveLength(1);
  });

  it('verträgt fehlende Felder und kaputte Einträge', () => {
    expect(migrateTransferCategoryIds({})).toEqual({ transferCategories: [] });
    expect(migrateTransferCategoryIds(null)).toEqual({ transferCategories: [] });
    const result = migrateTransferCategoryIds({ transferCategories: [42, null, { name: 7 }], entries: [null] });
    expect(result.transferCategories).toEqual([]);
    expect(result.entries).toEqual([null]);
  });
});
