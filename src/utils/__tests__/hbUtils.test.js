import { describe, it, expect } from 'vitest';
import { fixedCostKind, getEntryCategoryName } from '../hbUtils.js';

// ─── Fixkosten: Spaltenzuordnung ──────────────────────────────────────────

describe('fixedCostKind', () => {
  it('maps "transfer" to transfer', () => {
    expect(fixedCostKind({ kind: 'transfer' })).toBe('transfer');
  });

  it('treats everything else as expense', () => {
    expect(fixedCostKind({ kind: 'expense' })).toBe('expense');
    expect(fixedCostKind({})).toBe('expense');
    expect(fixedCostKind(null)).toBe('expense');
  });
});

describe('getEntryCategoryName', () => {
  const expense = [{ id: 'cat_sparen', name: 'Sparen und Anlegen', subcategories: [{ id: 'sub_krypto', name: 'Krypto' }] }];
  const income = [{ id: 'cat_einnahmen', name: 'Einnahmen', subcategories: [] }];

  it('nimmt bei Ausgaben die Oberkategorie aus categoryId, auch ohne Legacy-Feld', () => {
    // Fixkosten-Buchungen setzen `category` nicht (O2 im App-Review)
    const entry = { kind: 'expense', categoryId: 'cat_sparen', subcategoryId: 'sub_krypto' };
    expect(getEntryCategoryName(entry, expense, income)).toBe('Sparen und Anlegen');
  });

  it('bevorzugt die ID vor einem veralteten Legacy-Namen', () => {
    const entry = { kind: 'income', categoryId: 'cat_einnahmen', category: 'Alt' };
    expect(getEntryCategoryName(entry, expense, income)).toBe('Einnahmen');
  });

  it('fällt auf das Legacy-Feld zurück, wenn die ID unbekannt ist', () => {
    const entry = { kind: 'expense', categoryId: 'cat_weg', category: 'Lebensmittel' };
    expect(getEntryCategoryName(entry, expense, income)).toBe('Lebensmittel');
  });

  it('zeigt bei Transfers und Entnahmen den Zweck', () => {
    expect(getEntryCategoryName({ kind: 'transfer', category: 'Steuern' }, expense, income)).toBe('Steuern');
    expect(getEntryCategoryName({ kind: 'withdrawal', category: '' }, expense, income)).toBe('');
  });
});
