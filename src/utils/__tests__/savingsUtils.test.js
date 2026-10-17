import { describe, it, expect } from 'vitest';
import { buildSavingsModel, goalStatus, isVisibleRemainder } from '../savingsUtils.js';

const opts = { monthStartDay: 1, today: '2026-05-20' };

function transfer(date, amount, potId, purposeId) {
  return { id: `e-${date}-${amount}-${purposeId}`, kind: 'transfer', date, amount, potId, transferCategoryId: purposeId || null };
}
function withdrawal(date, amount, potId, purposeId) {
  return { id: `w-${date}-${amount}-${purposeId}`, kind: 'withdrawal', date, amount, potId, transferCategoryId: purposeId || null };
}

const POTS = [
  { id: 'pot_r', name: 'Rücklagen' },
  { id: 'pot_u', name: 'Urlaub' },
];
const STEUERN = { id: 'tc_steuern', name: 'Steuern', potId: 'pot_r', rule: 'reserve', amount: 1200, turnus: 12, faelligkeit: '2027-03-15' };
const NOT = { id: 'tc_not', name: 'Notgroschen', potId: 'pot_r', rule: 'free', monthlyRate: 150 };
const VELO = { id: 'tc_velo', name: 'Velo', potId: 'pot_u', rule: 'goal', targetAmount: 1000, deadline: null, createdAt: '2026-01-01' };
const ALT = { id: 'tc_alt', name: 'Altes Ziel', potId: 'pot_u', rule: 'goal', targetAmount: 300, completedAt: '2026-02-01', completedAmount: 300 };
const WEG = { id: 'tc_weg', name: 'Gelöscht', potId: 'pot_r', rule: 'free', deleted: true };

const ENTRIES = [
  transfer('2026-04-01', 100, 'pot_r', 'tc_steuern'),
  transfer('2026-04-01', 300, 'pot_r', 'tc_not'),
  transfer('2026-04-01', 40, 'pot_r', null),       // ohne Zweck
  transfer('2026-03-01', 25, 'pot_r', 'tc_weg'),   // gelöschter Zweck
  transfer('2026-04-01', 400, 'pot_u', 'tc_velo'),
  transfer('2026-01-10', 300, 'pot_u', 'tc_alt'),
  withdrawal('2026-02-15', 100, 'pot_u', 'tc_alt'),
];

const book = { pots: POTS, transferCategories: [STEUERN, NOT, VELO, ALT, WEG] };

describe('buildSavingsModel', () => {
  it('gliedert die aktiven Sparpositionen nach Topf, in Topf-Reihenfolge', () => {
    const { sections } = buildSavingsModel(book, ENTRIES, opts);
    expect(sections.map((s) => s.pot.id)).toEqual(['pot_r', 'pot_u']);
    expect(sections[0].rows.map((r) => r.id)).toEqual(['tc_steuern', 'tc_not']);
    expect(sections[1].rows).toEqual([]);
  });

  it('führt aktive Sparziele getrennt von der Tabelle', () => {
    const { sections, activeGoals } = buildSavingsModel(book, ENTRIES, opts);
    expect(sections[0].goalRows).toEqual([]);
    expect(sections[1].goalRows.map((r) => r.id)).toEqual(['tc_velo']);
    expect(sections[1].goalBalance).toBe(400);
    expect(activeGoals.map((r) => r.id)).toEqual(['tc_velo']);
  });

  it('leitet den Topf-Stand auf die Positionen über', () => {
    const { sections } = buildSavingsModel(book, ENTRIES, opts);
    const [r, u] = sections;
    expect(r.balance).toBe(465);
    // 465 − 100 − 300 = 65: 40 ohne Zweck + 25 auf dem gelöschten Zweck
    expect(r.unassigned).toBe(65);
    expect(r.archivedBalance).toBe(0);
    expect(u.balance).toBe(600);
    expect(u.archivedBalance).toBe(200);
    expect(u.unassigned).toBe(0);
  });

  it('bewertet jede Art nach ihrer Regel', () => {
    const { sections } = buildSavingsModel(book, ENTRIES, opts);
    const [steuern, not] = sections[0].rows;
    const velo = sections[1].goalRows[0];
    expect(steuern).toMatchObject({ rule: 'reserve', isSinkingFund: true, actual: 100, goalAmount: 1200, nextDate: '2027-03-15' });
    expect(steuern.monthlyRate).toBe(100);
    expect(not).toMatchObject({ rule: 'free', status: 'free', actual: 300, monthlyRate: 150, goalAmount: null, target: null });
    expect(velo).toMatchObject({ rule: 'goal', actual: 400, goalAmount: 1000, progress: 0.4, status: 'open', monthlyRate: null });
  });

  it('legt abgeschlossene Sparziele ins Archiv', () => {
    const { archivedGoals } = buildSavingsModel(book, ENTRIES, opts);
    expect(archivedGoals.map((g) => g.id)).toEqual(['tc_alt']);
    expect(archivedGoals[0].archive.savedAmount).toBe(300);
  });

  it('fasst die Kennzahlen zusammen', () => {
    const { kpis } = buildSavingsModel(book, ENTRIES, opts);
    expect(kpis.saved).toBe(800);
    expect(kpis.potCount).toBe(2);
    expect(kpis.rates).toBe(250);
    expect(kpis.goalRates).toBe(0);
  });

  it('zählt Rückstand und Fälligkeit als Handlungsbedarf', () => {
    const due = { ...STEUERN, faelligkeit: '2026-05-15' };
    const { kpis, sections } = buildSavingsModel({ ...book, transferCategories: [due] }, [], opts);
    expect(sections[0].rows[0].status).toBe('due');
    expect(kpis.due).toBe(1);
    expect(kpis.behind).toBe(0);
  });

  it('übergeht Zwecke ohne gültigen Topf und kommt ohne Daten aus', () => {
    const lost = { ...NOT, id: 'tc_lost', potId: 'pot_weg' };
    const { sections } = buildSavingsModel({ pots: POTS, transferCategories: [lost] }, [], opts);
    expect(sections.every((s) => s.rows.length === 0 && s.goalRows.length === 0)).toBe(true);
    expect(buildSavingsModel(undefined, undefined, opts).sections).toEqual([]);
  });
});

describe('goalStatus', () => {
  const p = (percent) => ({ percent });
  it('stuft nach Fortschritt und Deadline ein', () => {
    expect(goalStatus(p(100), {}, true)).toBe('reached');
    expect(goalStatus(p(50), {}, false)).toBe('open');
    expect(goalStatus(p(50), { deadlinePassed: true }, true)).toBe('missed');
    expect(goalStatus(p(50), { isAchievable: false }, true)).toBe('offTrack');
    expect(goalStatus(p(50), { isAchievable: true }, true)).toBe('onTrack');
  });
});

describe('isVisibleRemainder', () => {
  it('blendet Rundungsreste aus', () => {
    expect(isVisibleRemainder(0.004)).toBe(false);
    expect(isVisibleRemainder(-0.01)).toBe(true);
  });
});
