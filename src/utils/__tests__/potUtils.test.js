import { describe, it, expect } from 'vitest';
import { potPurposeBalance, potPurposeBalances } from '../potUtils.js';

const transfer = (potId, category, amount, extra = {}) => ({
  kind: 'transfer', date: '2026-01-15', potId, category, amount, ...extra,
});
const withdrawal = (potId, category, amount) => ({
  kind: 'withdrawal', date: '2026-02-15', potId, category, amount,
});

describe('potPurposeBalance', () => {
  it('zieht Entnahmen desselben Zwecks von den Transfers ab', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100),
      transfer('pot-a', 'Versicherung', 100),
      withdrawal('pot-a', 'Versicherung', 50),
    ];
    expect(potPurposeBalance(entries, 'pot-a', 'Versicherung')).toBe(150);
  });

  it('ignoriert andere Zwecke im selben Topf', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100),
      transfer('pot-a', 'Steuern', 900),
      withdrawal('pot-a', 'Steuern', 400),
    ];
    expect(potPurposeBalance(entries, 'pot-a', 'Versicherung')).toBe(100);
  });

  it('ignoriert denselben Zweck in einem anderen Topf', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100),
      transfer('pot-b', 'Versicherung', 700),
      withdrawal('pot-b', 'Versicherung', 200),
    ];
    expect(potPurposeBalance(entries, 'pot-a', 'Versicherung')).toBe(100);
  });

  it('zählt manuell erfasste Transfers ohne recurringId voll mit', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100, { recurringId: 'rec-1' }),
      transfer('pot-a', 'Versicherung', 60),
    ];
    expect(potPurposeBalance(entries, 'pot-a', 'Versicherung')).toBe(160);
  });

  it('wird bei Überentnahme negativ', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100),
      withdrawal('pot-a', 'Versicherung', 250),
    ];
    expect(potPurposeBalance(entries, 'pot-a', 'Versicherung')).toBe(-150);
  });

  it('ignoriert Einträge, die weder Transfer noch Entnahme sind', () => {
    const entries = [
      { kind: 'expense', date: '2026-01-10', potId: 'pot-a', category: 'Versicherung', amount: 500 },
      transfer('pot-a', 'Versicherung', 100),
    ];
    expect(potPurposeBalance(entries, 'pot-a', 'Versicherung')).toBe(100);
  });

  it('liefert 0 ohne passende Buchungen', () => {
    expect(potPurposeBalance([], 'pot-a', 'Versicherung')).toBe(0);
    expect(potPurposeBalance(undefined, 'pot-a', 'Versicherung')).toBe(0);
  });
});

describe('potPurposeBalances', () => {
  it('liefert alle Zwecke eines Topfes in einem Durchlauf', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100),
      transfer('pot-a', 'Steuern', 900),
      withdrawal('pot-a', 'Steuern', 400),
      transfer('pot-b', 'Versicherung', 700),
    ];
    const map = potPurposeBalances(entries, 'pot-a');
    expect(map.get('Versicherung')).toBe(100);
    expect(map.get('Steuern')).toBe(500);
    expect(map.size).toBe(2);
  });

  it('stimmt je Zweck mit potPurposeBalance überein', () => {
    const entries = [
      transfer('pot-a', 'Versicherung', 100),
      withdrawal('pot-a', 'Versicherung', 250),
      transfer('pot-a', 'Steuern', 900),
    ];
    const map = potPurposeBalances(entries, 'pot-a');
    for (const purpose of ['Versicherung', 'Steuern']) {
      expect(map.get(purpose)).toBe(potPurposeBalance(entries, 'pot-a', purpose));
    }
  });

  it('bucht Einträge ohne Zweck unter dem leeren Schlüssel', () => {
    const entries = [
      transfer('pot-a', undefined, 40),
      transfer('pot-a', 'Sonstiges', 10),
    ];
    const map = potPurposeBalances(entries, 'pot-a');
    expect(map.get('')).toBe(40);
    expect(map.get('Sonstiges')).toBe(10);
  });
});
