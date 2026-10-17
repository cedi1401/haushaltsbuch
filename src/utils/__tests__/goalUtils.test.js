import { describe, it, expect } from 'vitest';
import { calcGoalProgress } from '../goalUtils.js';

const entry = (kind, amount, over = {}) => ({
  kind, amount, date: '2026-05-01', potId: 'p1', transferCategoryId: 'urlaub', ...over,
});

describe('calcGoalProgress', () => {
  const goal = { potId: 'p1', transferCategoryId: 'urlaub', targetAmount: 1000, startMode: 'zero' };

  it('rechnet ein Ziel mit Zweck netto: Entnahmen auf den Zweck zählen ab', () => {
    const entries = [entry('transfer', 600), entry('withdrawal', 200)];
    expect(calcGoalProgress(goal, entries)).toMatchObject({ current: 400, percent: 40, remaining: 600 });
  });

  it('ignoriert Buchungen anderer Zwecke und Töpfe', () => {
    const entries = [
      entry('transfer', 300),
      entry('withdrawal', 100, { transferCategoryId: 'steuern' }),
      entry('withdrawal', 50, { potId: 'p2' }),
      entry('transfer', 500, { transferCategoryId: null }),
    ];
    expect(calcGoalProgress(goal, entries).current).toBe(300);
  });

  it('rechnet ein Ziel ohne Zweck über den ganzen Topf', () => {
    const entries = [
      entry('transfer', 300),
      entry('transfer', 200, { transferCategoryId: null }),
      entry('withdrawal', 100, { transferCategoryId: 'steuern' }),
    ];
    expect(calcGoalProgress({ ...goal, transferCategoryId: null }, entries).current).toBe(400);
  });

  it('zählt ab Startdatum und addiert den Anfangsbetrag', () => {
    const entries = [entry('transfer', 300, { date: '2026-01-01' }), entry('transfer', 100)];
    expect(calcGoalProgress({ ...goal, startMode: 'date', startDate: '2026-03-01' }, entries).current).toBe(100);
    expect(calcGoalProgress({ ...goal, startMode: 'custom', startAmount: 50, createdAt: '2026-03-01' }, entries).current).toBe(150);
  });
});
