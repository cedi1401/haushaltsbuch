import { describe, it, expect } from 'vitest';
import { migrateSavingsPurposes, normalizeSavingsPurposes } from '../savingsPurposeMigration.js';
import { normalizeBook } from '../bookMigration.js';
import {
  addTransferCategory,
  clearPurposeRate,
  getFixedCostItems,
  getPurposesForPot,
  purposeToFixedItem,
  purposeToGoal,
} from '../transferCategoryUtils.js';
import { potPurposeBalance } from '../potUtils.js';

const POTS = [
  { id: 'p_res', name: 'Rücklagen' },
  { id: 'p_ferien', name: 'Ferien' },
];

const transfer = (id, potId, purposeId, amount, extra = {}) => ({
  id, kind: 'transfer', date: '2026-05-01', amount, potId, transferCategoryId: purposeId, categoryId: null, ...extra,
});
const withdrawal = (id, potId, purposeId, amount) => ({
  id, kind: 'withdrawal', date: '2026-06-01', amount, potId, transferCategoryId: purposeId, categoryId: null,
});

const byName = (list, name) => list.find((c) => c.name === name);

describe('migrateSavingsPurposes — Positionen', () => {
  it('verschmilzt eine 1:1-Position mit ihrem Zweck (ID bleibt, Positionsname gewinnt)', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_steuern', name: 'Steuern' }],
      recurringExpenses: [
        { id: 'r_miete', kind: 'expense', name: 'Miete', amount: 1500 },
        {
          id: 'r_steuer', kind: 'transfer', name: 'Steuerrechnung', amount: 1200, turnus: 12,
          faelligkeit: '2027-03-31', potId: 'p_res', transferCategoryId: 'tc_steuern', groupId: 'g1', tags: ['Staat'],
        },
      ],
      entries: [transfer('e1', 'p_res', 'tc_steuern', 100, { recurringId: 'r_steuer' })],
    });

    expect(result.recurringExpenses.map((r) => r.id)).toEqual(['r_miete']);
    expect(result.transferCategories).toHaveLength(1);
    expect(result.transferCategories[0]).toMatchObject({
      id: 'tc_steuern', name: 'Steuerrechnung', potId: 'p_res', rule: 'reserve',
      amount: 1200, turnus: 12, faelligkeit: '2027-03-31', groupId: 'g1', tags: ['Staat'], showInOverview: true,
    });
    expect(result.entries[0].transferCategoryId).toBe('tc_steuern');
    expect(result.entries[0]).not.toHaveProperty('recurringId');
  });

  it('macht eine Position ohne Turnus zur Rücklage mit Monatsrate', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_not', name: 'Notgroschen' }],
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Notgroschen', amount: 150, potId: 'p_res', transferCategoryId: 'tc_not', showInOverview: false },
      ],
    });
    expect(result.transferCategories[0]).toMatchObject({ rule: 'free', monthlyRate: 150, showInOverview: false });
  });

  it('teilt einen geteilten Zweck auf: Monatsraten folgen ihrer Position, Entnahmen bleiben beim ersten', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_jahr', name: 'Jahresrechnungen' }],
      recurringExpenses: [
        { id: 'r_schorn', kind: 'transfer', name: 'Schornsteinfeger', amount: 240, turnus: 12, faelligkeit: '2026-11-15', potId: 'p_res', transferCategoryId: 'tc_jahr' },
        { id: 'r_heiz', kind: 'transfer', name: 'Heizungswartung', amount: 360, turnus: 12, faelligkeit: '2027-02-01', potId: 'p_res', transferCategoryId: 'tc_jahr' },
      ],
      entries: [
        transfer('e1', 'p_res', 'tc_jahr', 20, { recurringId: 'r_schorn' }),
        transfer('e2', 'p_res', 'tc_jahr', 30, { recurringId: 'r_heiz' }),
        transfer('e3', 'p_res', 'tc_jahr', 50),
        withdrawal('e4', 'p_res', 'tc_jahr', 240),
      ],
    });

    const schorn = byName(result.transferCategories, 'Schornsteinfeger');
    const heiz = byName(result.transferCategories, 'Heizungswartung');
    expect(schorn.id).toBe('tc_jahr');
    expect(heiz.id).not.toBe('tc_jahr');
    expect(heiz).toMatchObject({ potId: 'p_res', rule: 'reserve', amount: 360 });
    // Neuer Zweck direkt hinter seinem Ursprung
    expect(result.transferCategories.map((c) => c.name)).toEqual(['Schornsteinfeger', 'Heizungswartung']);

    const purposeOf = (id) => result.entries.find((e) => e.id === id).transferCategoryId;
    expect(purposeOf('e1')).toBe('tc_jahr');
    expect(purposeOf('e2')).toBe(heiz.id);
    expect(purposeOf('e3')).toBe('tc_jahr');
    expect(purposeOf('e4')).toBe('tc_jahr');
    // Kein Geld geht verloren: Summe der Zweck-Netto = vorher
    expect(potPurposeBalance(result.entries, 'p_res', 'tc_jahr') + potPurposeBalance(result.entries, 'p_res', heiz.id)).toBe(-140);
  });

  it('löst einen Zweck aus mehreren Töpfen in je einen Zweck pro Topf auf', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_urlaub', name: 'Urlaub' }],
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Urlaub', amount: 100, potId: 'p_ferien', transferCategoryId: 'tc_urlaub' },
      ],
      entries: [
        transfer('e1', 'p_ferien', 'tc_urlaub', 100),
        transfer('e2', 'p_res', 'tc_urlaub', 600),
        withdrawal('e3', 'p_res', 'tc_urlaub', 50),
      ],
    });

    const other = byName(result.transferCategories, 'Urlaub (Rücklagen)');
    expect(other).toMatchObject({ potId: 'p_res', rule: 'free', monthlyRate: null });
    expect(byName(result.transferCategories, 'Urlaub')).toMatchObject({ id: 'tc_urlaub', potId: 'p_ferien' });
    expect(result.entries.map((e) => e.transferCategoryId)).toEqual(['tc_urlaub', other.id, other.id]);
  });

  it('bindet unbenutzte Zwecke an den ersten Topf und gelöschte bleiben gelöscht', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_a', name: 'A' }, { id: 'tc_b', name: 'B', deleted: true }],
    });
    expect(result.transferCategories).toEqual([
      expect.objectContaining({ id: 'tc_a', potId: 'p_res', rule: 'free' }),
      expect.objectContaining({ id: 'tc_b', potId: 'p_res', deleted: true }),
    ]);
  });

  it('reaktiviert einen gelöschten Zweck, auf den eine Position zeigt', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_alt', name: 'Alt', deleted: true }],
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Neu', amount: 10, potId: 'p_res', transferCategoryId: 'tc_alt' },
      ],
    });
    expect(normalizeSavingsPurposes(result.transferCategories, POTS)[0]).not.toHaveProperty('deleted');
  });

  it('macht Namen unter aktiven Zwecken eindeutig', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_a', name: 'Ferien' }, { id: 'tc_b', name: 'Urlaub' }],
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Ferien', amount: 10, potId: 'p_res', transferCategoryId: 'tc_b' },
      ],
    });
    expect(result.transferCategories.map((c) => c.name)).toEqual(['Ferien', 'Ferien (2)']);
  });
});

describe('migrateSavingsPurposes — Sparziele', () => {
  const goal = (over) => ({
    id: 'g1', name: 'Velo', potId: 'p_res', transferCategoryId: 'tc_velo', targetAmount: 2000,
    deadline: '2027-06-30', createdAt: '2026-03-01', completedAt: null, completedAmount: null,
    startMode: 'zero', ...over,
  });

  it('macht den Zweck eines Ziels zum Ziel-Zweck', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_velo', name: 'Velo-Kasse' }],
      goals: [goal()],
      entries: [transfer('e1', 'p_res', 'tc_velo', 300)],
    });
    expect(result.transferCategories[0]).toMatchObject({
      id: 'tc_velo', name: 'Velo', rule: 'goal', targetAmount: 2000, deadline: '2027-06-30', createdAt: '2026-03-01',
    });
    expect(result.transferCategories[0]).not.toHaveProperty('startMode');
    expect(result).not.toHaveProperty('goals');
  });

  it('verschmilzt ein Ziel mit einer freien Rücklage auf demselben Zweck — die Rate bleibt', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_velo', name: 'Velo' }],
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Velo sparen', amount: 100, potId: 'p_res', transferCategoryId: 'tc_velo', groupId: 'g1' },
      ],
      goals: [goal()],
    });
    expect(result.transferCategories).toHaveLength(1);
    expect(result.transferCategories[0]).toMatchObject({ rule: 'goal', name: 'Velo', monthlyRate: 100, groupId: 'g1', targetAmount: 2000 });
  });

  it('gibt einem Ziel auf einer Rückstellung einen eigenen, leeren Zweck', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_velo', name: 'Velo' }],
      recurringExpenses: [
        { id: 'r1', kind: 'transfer', name: 'Velo-Service', amount: 120, turnus: 12, faelligkeit: '2027-04-01', potId: 'p_res', transferCategoryId: 'tc_velo' },
      ],
      goals: [goal({ name: 'Neues Velo' })],
      entries: [transfer('e1', 'p_res', 'tc_velo', 10)],
    });
    const goalPurpose = byName(result.transferCategories, 'Neues Velo');
    expect(goalPurpose).toMatchObject({ rule: 'goal', potId: 'p_res' });
    expect(goalPurpose.id).not.toBe('tc_velo');
    expect(result.entries[0].transferCategoryId).toBe('tc_velo');
  });

  it('macht ein Ziel auf den ganzen Topf zum Zweck und gibt ihm die Buchungen ohne Zweck', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_x', name: 'X' }],
      goals: [goal({ name: 'Notgroschen', transferCategoryId: null, potId: 'p_ferien' })],
      entries: [
        transfer('e1', 'p_ferien', null, 500),
        transfer('e2', 'p_res', null, 70),
        transfer('e3', 'p_ferien', 'tc_x', 30),
      ],
    });
    const not = byName(result.transferCategories, 'Notgroschen');
    expect(not).toMatchObject({ rule: 'goal', potId: 'p_ferien' });
    const purposeOf = (id) => result.entries.find((e) => e.id === id).transferCategoryId;
    expect(purposeOf('e1')).toBe(not.id);
    expect(purposeOf('e2')).toBe(null);
    expect(purposeOf('e3')).toBe('tc_x');
  });

  it('macht aus einem Anfangsbetrag eine echte Buchung am Anlagedatum', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_velo', name: 'Velo' }],
      goals: [goal({ startMode: 'custom', startAmount: 250 })],
    });
    expect(result.entries).toEqual([
      expect.objectContaining({
        kind: 'transfer', amount: 250, date: '2026-03-01', potId: 'p_res', transferCategoryId: 'tc_velo',
        note: 'Anfangsbetrag Velo',
      }),
    ]);
  });

  it('übernimmt Archiv-Felder abgeschlossener Ziele', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_velo', name: 'Velo' }],
      goals: [goal({ completedAt: '2026-09-01', completedAmount: 2100 })],
    });
    expect(result.transferCategories[0]).toMatchObject({ completedAt: '2026-09-01', completedAmount: 2100 });
  });
});

describe('migrateSavingsPurposes — Vorlagen', () => {
  it('hängt eine Vorlage an den neuen Zweck ihres Topfs', () => {
    const result = migrateSavingsPurposes({
      pots: POTS,
      transferCategories: [{ id: 'tc_u', name: 'Urlaub' }],
      entries: [transfer('e1', 'p_ferien', 'tc_u', 100)],
      entryTemplates: [{ id: 't1', name: 'Urlaub Rücklagen', kind: 'transfer', potId: 'p_res', transferCategoryId: 'tc_u' }],
    });
    const split = byName(result.transferCategories, 'Urlaub (Rücklagen)');
    expect(result.entryTemplates[0].transferCategoryId).toBe(split.id);
  });
});

describe('normalizeSavingsPurposes', () => {
  it('stuft eine unvollständige Rückstellung zur Rücklage herab', () => {
    const [p] = normalizeSavingsPurposes([{ id: 'a', name: 'A', potId: 'p_res', rule: 'reserve', amount: 300, turnus: 12 }], POTS);
    expect(p).toMatchObject({ rule: 'free', monthlyRate: 300 });
    expect(p).not.toHaveProperty('turnus');
  });

  it('löscht Zwecke eines gelöschten Topfs und bindet ungebundene an den ersten', () => {
    const list = normalizeSavingsPurposes([
      { id: 'a', name: 'A', potId: 'p_weg' },
      { id: 'b', name: 'B' },
    ], POTS);
    expect(list[0]).toMatchObject({ potId: 'p_weg', deleted: true });
    expect(list[1]).toMatchObject({ potId: 'p_res', rule: 'free' });
    expect(list[1]).not.toHaveProperty('deleted');
  });

  it('entfernt Felder fremder Regeln und ist idempotent', () => {
    const once = normalizeSavingsPurposes([
      { id: 'a', name: 'A', potId: 'p_res', rule: 'free', monthlyRate: 50, targetAmount: 99, turnus: 3 },
      { id: 'b', name: 'B', potId: 'p_res', rule: 'goal', targetAmount: 1000, startMode: 'custom' },
    ], POTS);
    expect(once[0]).not.toHaveProperty('targetAmount');
    expect(once[0]).not.toHaveProperty('turnus');
    expect(once[1]).not.toHaveProperty('startMode');
    expect(normalizeSavingsPurposes(once, POTS)).toEqual(once);
  });
});

describe('normalizeBook — Schema 7', () => {
  const legacy = {
    id: 'b1',
    schemaVersion: 6,
    pots: POTS,
    transferCategories: [{ id: 'tc_jahr', name: 'Jahresrechnungen' }],
    recurringExpenses: [
      { id: 'r1', kind: 'transfer', name: 'Schornsteinfeger', amount: 240, turnus: 12, faelligkeit: '2026-11-15', potId: 'p_res', transferCategoryId: 'tc_jahr' },
      { id: 'r2', kind: 'transfer', name: 'Heizung', amount: 360, turnus: 12, faelligkeit: '2027-02-01', potId: 'p_res', transferCategoryId: 'tc_jahr' },
    ],
    goals: [{ id: 'g1', name: 'Velo', potId: 'p_ferien', transferCategoryId: null, targetAmount: 1000 }],
    entries: [transfer('e1', 'p_res', 'tc_jahr', 20, { recurringId: 'r2' })],
  };

  it('migriert einmal und bleibt danach stabil', () => {
    const once = normalizeBook(legacy);
    expect(once.schemaVersion).toBe(7);
    expect(once).not.toHaveProperty('goals');
    expect(once.recurringExpenses).toEqual([]);
    expect(once.transferCategories.map((c) => [c.name, c.rule])).toEqual([
      ['Schornsteinfeger', 'reserve'],
      ['Heizung', 'reserve'],
      ['Velo', 'goal'],
    ]);
    const twice = normalizeBook(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe('Sparpositionen — Adapter', () => {
  const reserve = {
    id: 'tc_r', name: 'Steuern', potId: 'p_res', rule: 'reserve', amount: 1200, turnus: 12,
    faelligkeit: '2027-03-31', groupId: 'g1', tags: [], showInOverview: true,
  };
  const free = { id: 'tc_f', name: 'Polster', potId: 'p_res', rule: 'free', monthlyRate: 50, groupId: null, tags: [], showInOverview: false };
  const bare = { id: 'tc_b', name: 'Sonstiges', potId: 'p_ferien', rule: 'free', monthlyRate: null };
  const goalP = { id: 'tc_g', name: 'Velo', potId: 'p_ferien', rule: 'goal', targetAmount: 2000, monthlyRate: null, createdAt: '2026-01-01' };

  it('bildet Zwecke mit Rate als Transfer-Positionen ab', () => {
    const items = getFixedCostItems({
      recurringExpenses: [{ id: 'r_miete', kind: 'expense', amount: 1500 }],
      transferCategories: [reserve, free, bare, goalP, { ...free, id: 'tc_del', deleted: true }],
    });
    expect(items.map((i) => i.id)).toEqual(['r_miete', 'tc_r', 'tc_f']);
    expect(purposeToFixedItem(reserve)).toMatchObject({
      id: 'tc_r', kind: 'transfer', amount: 1200, turnus: 12, transferCategoryId: 'tc_r', potId: 'p_res',
    });
    expect(purposeToFixedItem(free)).toMatchObject({ amount: 50, turnus: null, faelligkeit: null });
  });

  it('bildet einen Ziel-Zweck als Sparziel ab', () => {
    expect(purposeToGoal(goalP)).toMatchObject({ id: 'tc_g', potId: 'p_ferien', transferCategoryId: 'tc_g', targetAmount: 2000 });
  });

  it('nimmt beim Löschen nur die Rate weg', () => {
    expect(clearPurposeRate(reserve)).toMatchObject({ id: 'tc_r', rule: 'free', monthlyRate: null });
    expect(clearPurposeRate(goalP)).toMatchObject({ rule: 'goal', monthlyRate: null, targetAmount: 2000 });
  });

  it('filtert Zwecke nach Topf und belebt beim Anlegen nur im selben Topf wieder', () => {
    const list = [free, bare, { ...bare, id: 'tc_old', name: 'Alt', deleted: true }];
    expect(getPurposesForPot(list, 'p_ferien').map((c) => c.id)).toEqual(['tc_b']);
    expect(addTransferCategory(list, 'alt', 'p_ferien').category.id).toBe('tc_old');
    const other = addTransferCategory(list, 'alt', 'p_res').category;
    expect(other.id).not.toBe('tc_old');
    expect(other).toMatchObject({ name: 'alt', potId: 'p_res', rule: 'free' });
  });
});
