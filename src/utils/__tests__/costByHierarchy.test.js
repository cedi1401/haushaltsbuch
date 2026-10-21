import { describe, it, expect } from 'vitest';
import {
  RESERVE_NO_CATEGORY_ID,
  UNCATEGORIZED_ID,
  calcCostByHierarchy,
  calcExpenseByHierarchy,
  hasCategorizedReserves,
} from '../budgetUtils.js';

const CATEGORIES = [
  { id: 'cat_auto', name: 'Auto', color: '#111', budget: 300, subcategories: [{ id: 'sub_vers', name: 'Versicherung' }, { id: 'sub_benzin', name: 'Benzin' }] },
  { id: 'cat_wohnen', name: 'Wohnen', color: '#222', subcategories: [] },
];

const PURPOSES = [
  { id: 'tcat_autovers', name: 'Autoversicherung', potId: 'p', rule: 'reserve', categoryId: 'cat_auto', subcategoryId: 'sub_vers' },
  { id: 'tcat_strom', name: 'Strom', potId: 'p', rule: 'reserve', categoryId: 'cat_wohnen', subcategoryId: null },
  { id: 'tcat_steuern', name: 'Steuern', potId: 'p', rule: 'reserve', categoryId: null },
  { id: 'tcat_alt', name: 'Alt', potId: 'p', rule: 'reserve', categoryId: 'cat_auto', deleted: true },
  { id: 'tcat_weg', name: 'Weg', potId: 'p', rule: 'reserve', categoryId: 'cat_geloescht' },
  { id: 'tcat_frei', name: 'Frei', potId: 'p', rule: 'free' },
  { id: 'tcat_ziel', name: 'Ziel', potId: 'p', rule: 'goal' },
];

let n = 0;
const entry = (kind, amount, extra = {}) => ({ id: `e${n++}`, date: '2026-10-05', kind, amount, ...extra });
const expense = (amount, categoryId, extra) => entry('expense', amount, { source: 'month', categoryId, ...extra });
const transfer = (amount, transferCategoryId, extra) => entry('transfer', amount, { potId: 'p', transferCategoryId, ...extra });

const byId = (list, id) => list.find((c) => c.id === id);
const total = (list) => list.reduce((s, c) => s + c.value, 0);

describe('calcCostByHierarchy', () => {
  it('ordnet die Rate einer Rückstellung ihrer Unterkategorie zu', () => {
    const r = calcCostByHierarchy(
      [expense(50, 'cat_auto', { subcategoryId: 'sub_benzin' }), transfer(100, 'tcat_autovers')],
      CATEGORIES, PURPOSES, '2026-10'
    );
    const auto = byId(r, 'cat_auto');
    expect(auto).toMatchObject({ value: 150, reserveValue: 100, entryCount: 2 });
    expect(byId(auto.subcategories, 'sub_vers')).toMatchObject({ value: 100, reserveValue: 100 });
    expect(byId(auto.subcategories, 'sub_benzin')).toMatchObject({ value: 50, reserveValue: 0 });
    expect(auto).not.toHaveProperty('budget');
  });

  it('ordnet eine Rückstellung ohne Unterkategorie der Oberkategorie zu', () => {
    const r = calcCostByHierarchy([transfer(40, 'tcat_strom')], CATEGORIES, PURPOSES, '2026-10');
    expect(byId(r, 'cat_wohnen')).toMatchObject({ value: 40, reserveValue: 40 });
  });

  it('sammelt Rückstellungen ohne gültige Kategorie im eigenen Block', () => {
    const r = calcCostByHierarchy(
      [transfer(10, 'tcat_steuern'), transfer(20, 'tcat_alt'), transfer(30, 'tcat_weg')],
      CATEGORIES, PURPOSES, '2026-10'
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: RESERVE_NO_CATEGORY_ID, name: 'Rückstellungen ohne Kategorie', value: 60, reserveValue: 60 });
  });

  it('ignoriert Rücklagen, Sparziele, unbekannte Sparpositionen und Topf-Ausgaben', () => {
    const r = calcCostByHierarchy(
      [
        transfer(10, 'tcat_frei'),
        transfer(20, 'tcat_ziel'),
        transfer(30, null),
        transfer(40, 'tcat_unbekannt'),
        entry('withdrawal', 50, { potId: 'p', transferCategoryId: 'tcat_autovers' }),
        entry('expense', 1200, { source: 'pot', potId: 'p', categoryId: 'cat_auto' }),
      ],
      CATEGORIES, PURPOSES, '2026-10'
    );
    expect(r).toEqual([]);
  });

  it('zählt Nachbuchungen im selben Monat mit und filtert andere Monate weg', () => {
    const r = calcCostByHierarchy(
      [transfer(100, 'tcat_autovers'), transfer(100, 'tcat_autovers'), transfer(100, 'tcat_autovers', { date: '2026-09-05' })],
      CATEGORIES, PURPOSES, '2026-10'
    );
    expect(byId(r, 'cat_auto').value).toBe(200);
    expect(total(calcCostByHierarchy([transfer(100, 'tcat_autovers', { date: '2026-09-05' })], CATEGORIES, PURPOSES, ''))).toBe(100);
  });

  it('lässt Monatsausgaben wie calcExpenseByHierarchy (inkl. Unkategorisiert)', () => {
    const entries = [expense(25, 'cat_wohnen'), expense(5, null)];
    const cost = calcCostByHierarchy(entries, CATEGORIES, PURPOSES, '2026-10');
    const plain = calcExpenseByHierarchy(entries, CATEGORIES, '2026-10');
    expect(cost.map((c) => [c.id, c.value])).toEqual(plain.map((c) => [c.id, c.value]));
    expect(byId(cost, UNCATEGORIZED_ID).reserveValue).toBe(0);
  });

  it('Summe = Monatsausgaben + Rückstellungs-Transfers des Monats', () => {
    const entries = [
      expense(25, 'cat_wohnen'),
      expense(70, 'cat_auto', { subcategoryId: 'sub_benzin' }),
      expense(5, null),
      transfer(100, 'tcat_autovers'),
      transfer(40, 'tcat_strom'),
      transfer(10, 'tcat_steuern'),
      transfer(999, 'tcat_frei'),
      entry('expense', 1200, { source: 'pot', potId: 'p', categoryId: 'cat_auto' }),
    ];
    const expenses = 25 + 70 + 5;
    const reserves = 100 + 40 + 10;
    expect(total(calcCostByHierarchy(entries, CATEGORIES, PURPOSES, '2026-10'))).toBe(expenses + reserves);
  });
});

describe('hasCategorizedReserves', () => {
  it('erkennt nur aktive Rückstellungen mit vorhandener Kategorie', () => {
    expect(hasCategorizedReserves(PURPOSES, CATEGORIES)).toBe(true);
    expect(hasCategorizedReserves([PURPOSES[2], PURPOSES[3], PURPOSES[4], PURPOSES[5]], CATEGORIES)).toBe(false);
    expect(hasCategorizedReserves(null, CATEGORIES)).toBe(false);
  });
});
