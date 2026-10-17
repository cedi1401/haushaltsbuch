import { describe, it, expect } from 'vitest';
import { calcGoalProgress } from '../goalUtils.js';

const entry = (kind, amount, over = {}) => ({
  kind, amount, date: '2026-05-01', potId: 'p1', transferCategoryId: 'urlaub', ...over,
});

describe('calcGoalProgress', () => {
  const goal = { potId: 'p1', transferCategoryId: 'urlaub', targetAmount: 1000 };

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

  it('zählt alle Buchungen des Zwecks, ein Startpunkt wirkt nicht mehr (Schema 7)', () => {
    const entries = [entry('transfer', 300, { date: '2026-01-01' }), entry('transfer', 100)];
    const legacy = { ...goal, startMode: 'custom', startDate: '2026-03-01', startAmount: 50 };
    expect(calcGoalProgress(legacy, entries).current).toBe(400);
  });
});
