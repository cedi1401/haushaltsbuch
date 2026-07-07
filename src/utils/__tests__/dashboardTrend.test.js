import { describe, it, expect } from 'vitest';
import { calcMonthlyTotals } from '../dashboardTrend.js';

const savingsPotIds = new Set(['savings']);

describe('calcMonthlyTotals', () => {
  it('returns an empty array for no entries', () => {
    expect(calcMonthlyTotals([], savingsPotIds)).toEqual([]);
    expect(calcMonthlyTotals(null, savingsPotIds)).toEqual([]);
  });

  it('aggregates income, expense, reserve and savings per month', () => {
    const entries = [
      { kind: 'income', amount: 3000, date: '2026-01-10' },
      { kind: 'expense', source: 'month', amount: 800, date: '2026-01-12' },
      { kind: 'transfer', potId: 'reserve', amount: 200, date: '2026-01-15' },
      { kind: 'transfer', potId: 'savings', amount: 500, date: '2026-01-20' },
    ];
    const [jan] = calcMonthlyTotals(entries, savingsPotIds);
    expect(jan).toEqual({
      month: '2026-01',
      income: 3000,
      expense: 800,
      reserve: 200,
      savings: 500,
      free: 3000 - 800 - 200 - 500,
    });
  });

  it('ignores withdrawals and pot-sourced expenses (mirrors app scalars)', () => {
    const entries = [
      { kind: 'income', amount: 1000, date: '2026-02-01' },
      { kind: 'withdrawal', potId: 'savings', amount: 400, date: '2026-02-05' },
      { kind: 'expense', source: 'pot', amount: 300, date: '2026-02-06' },
    ];
    const [feb] = calcMonthlyTotals(entries, savingsPotIds);
    expect(feb.expense).toBe(0);
    expect(feb.savings).toBe(0);
    expect(feb.free).toBe(1000);
  });

  it('sorts months ascending', () => {
    const entries = [
      { kind: 'income', amount: 1, date: '2026-03-01' },
      { kind: 'income', amount: 1, date: '2026-01-01' },
      { kind: 'income', amount: 1, date: '2026-02-01' },
    ];
    expect(calcMonthlyTotals(entries, savingsPotIds).map((r) => r.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });
});
