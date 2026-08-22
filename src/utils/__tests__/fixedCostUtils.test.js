import { describe, it, expect } from 'vitest';
import { turnusMonths, monthlyRate, annualAmount, isSinkingFund, cycleAnchor } from '../fixedCostUtils.js';

describe('turnusMonths', () => {
  it('liefert 1 ohne Turnus', () => {
    expect(turnusMonths({ kind: 'transfer', amount: 200 })).toBe(1);
    expect(turnusMonths({ kind: 'transfer', amount: 200, turnus: null })).toBe(1);
  });

  it('liefert den gesetzten Turnus', () => {
    expect(turnusMonths({ kind: 'transfer', turnus: 3 })).toBe(3);
    expect(turnusMonths({ kind: 'transfer', turnus: 12 })).toBe(12);
  });

  it('fängt unbrauchbare Werte auf 1 ab', () => {
    expect(turnusMonths({ turnus: 0 })).toBe(1);
    expect(turnusMonths({ turnus: -6 })).toBe(1);
    expect(turnusMonths({ turnus: 'jährlich' })).toBe(1);
    expect(turnusMonths(undefined)).toBe(1);
  });
});

describe('monthlyRate', () => {
  it('gibt bei einer Ausgabe den Betrag unverändert zurück', () => {
    expect(monthlyRate({ kind: 'expense', amount: 50 })).toBe(50);
  });

  it('ignoriert einen Turnus an einer Ausgabe', () => {
    expect(monthlyRate({ kind: 'expense', amount: 1200, turnus: 12 })).toBe(1200);
  });

  it('gibt bei einem Transfer ohne Turnus den Betrag unverändert zurück', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 200 })).toBe(200);
  });

  it('teilt den Zyklusbetrag auf die Monate auf', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 1200, turnus: 12 })).toBe(100);
    expect(monthlyRate({ kind: 'transfer', amount: 600, turnus: 6 })).toBe(100);
  });

  it('rundet auf zwei Nachkommastellen (D5: einzige Rundungsstelle)', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 1000, turnus: 12 })).toBe(83.33);
    expect(monthlyRate({ kind: 'transfer', amount: 100, turnus: 3 })).toBe(33.33);
  });

  it('akzeptiert einen Draft aus dem Dialog (plain object)', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 1200, turnus: 12 })).toBe(100);
  });

  it('liefert 0 bei fehlendem oder unbrauchbarem Betrag', () => {
    expect(monthlyRate({ kind: 'transfer', turnus: 12 })).toBe(0);
    expect(monthlyRate({ kind: 'transfer', amount: NaN, turnus: 12 })).toBe(0);
    expect(monthlyRate(undefined)).toBe(0);
  });
});

describe('annualAmount', () => {
  it('entspricht amount * 12 ohne Turnus', () => {
    expect(annualAmount({ kind: 'expense', amount: 50 })).toBe(600);
    expect(annualAmount({ kind: 'transfer', amount: 200 })).toBe(2400);
  });

  it('gibt bei einer Jahresrechnung den Zyklusbetrag zurück', () => {
    expect(annualAmount({ kind: 'transfer', amount: 1200, turnus: 12 })).toBe(1200);
  });

  it('zeigt bei krummen Raten die zwölf gerundeten Raten (D4: 999.96, nicht 1000)', () => {
    expect(annualAmount({ kind: 'transfer', amount: 1000, turnus: 12 })).toBeCloseTo(999.96, 2);
  });
});

describe('isSinkingFund', () => {
  it('ist wahr für einen Transfer mit Turnus', () => {
    expect(isSinkingFund({ kind: 'transfer', turnus: 12 })).toBe(true);
    expect(isSinkingFund({ kind: 'transfer', turnus: 1 })).toBe(true);
  });

  it('ist falsch für einen Transfer ohne Turnus (freies Sparen)', () => {
    expect(isSinkingFund({ kind: 'transfer', turnus: null })).toBe(false);
    expect(isSinkingFund({ kind: 'transfer' })).toBe(false);
  });

  it('ist falsch für eine Ausgabe, auch mit Turnus', () => {
    expect(isSinkingFund({ kind: 'expense', turnus: 12 })).toBe(false);
  });

  it('ist falsch ohne Item', () => {
    expect(isSinkingFund(undefined)).toBe(false);
  });
});

// ── Zyklusrechnung ───────────────────────────────────────────────────────

/** Rücklage: Steuern, jährlich, 600, nächste Rechnung am 15.03.2027. */
const STEUERN = {
  id: 'fc-steuern',
  kind: 'transfer',
  name: 'Steuern',
  amount: 600,
  turnus: 12,
  faelligkeit: '2027-03-15',
  potId: 'reserve',
  transferCategory: 'Steuern',
};

function withdrawal(date, amount, over = {}) {
  return { kind: 'withdrawal', date, amount, potId: 'reserve', category: 'Steuern', ...over };
}

function transfer(date, amount, over = {}) {
  return { kind: 'transfer', date, amount, potId: 'reserve', category: 'Steuern', ...over };
}

describe('cycleAnchor', () => {
  it('liefert null für eine Position ohne Turnus', () => {
    expect(cycleAnchor({ kind: 'transfer', potId: 'reserve' }, [])).toBeNull();
    expect(cycleAnchor({ kind: 'expense', amount: 50, turnus: 12 }, [])).toBeNull();
  });

  it('rechnet ohne Entnahme aus der Fälligkeit zurück (Mitteneinstieg)', () => {
    const anchor = cycleAnchor(STEUERN, []);
    expect(anchor).toEqual({
      cycleStart: '2026-03-15',
      nextDue: '2027-03-15',
      lastPayment: null,
      anchorSource: 'faelligkeit',
    });
  });

  it('verankert den Zyklus an der Entnahme, sobald es eine gibt', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 600)]);
    expect(anchor).toEqual({
      cycleStart: '2026-05-10',
      nextDue: '2027-05-10',
      lastPayment: '2026-05-10',
      anchorSource: 'withdrawal',
    });
  });

  it('kennt keinen Schwellenwert: jede Entnahme setzt den Zyklus zurück', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 5)]);
    expect(anchor.cycleStart).toBe('2026-05-10');
    expect(anchor.anchorSource).toBe('withdrawal');
  });

  it('nimmt bei mehreren Entnahmen die jüngste', () => {
    const anchor = cycleAnchor(STEUERN, [
      withdrawal('2024-05-10', 600),
      withdrawal('2026-05-10', 600),
      withdrawal('2025-05-10', 600),
    ]);
    expect(anchor.cycleStart).toBe('2026-05-10');
  });

  it('ignoriert einen anderen Zweck im selben Topf', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 600, { category: 'Versicherung' })]);
    expect(anchor.anchorSource).toBe('faelligkeit');
    expect(anchor.lastPayment).toBeNull();
  });

  it('ignoriert denselben Zweck in einem anderen Topf', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 600, { potId: 'surplus' })]);
    expect(anchor.anchorSource).toBe('faelligkeit');
  });

  it('ignoriert Einzahlungen — nur Entnahmen sind Zahlungen', () => {
    const anchor = cycleAnchor(STEUERN, [transfer('2026-05-10', 50)]);
    expect(anchor.anchorSource).toBe('faelligkeit');
  });

  it('klemmt den Tag am Monatsende', () => {
    const item = { ...STEUERN, turnus: 1, faelligkeit: '2027-03-31' };
    expect(cycleAnchor(item, []).cycleStart).toBe('2027-02-28');
  });

  it('liefert null, wenn weder Entnahme noch Fälligkeit einen Anker geben', () => {
    expect(cycleAnchor({ ...STEUERN, faelligkeit: null }, [])).toBeNull();
  });
});
