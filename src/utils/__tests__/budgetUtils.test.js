import { describe, it, expect } from 'vitest';
import {
  UNCATEGORIZED_ID,
  buildBudgetRows,
  calcBudgetMetrics,
  calcCategoryMonthlySpend,
  setCategoryBudgets,
} from '../budgetUtils.js';
import { getFinancialMonthInfo } from '../financialMonthUtils.js';

// Bezugstag für alle Tests: 15. Oktober 2026, Mittag (lokale Zeit).
const TODAY = new Date(2026, 9, 15, 12, 0, 0);
const info = (month, startDay = 1, today = TODAY) => getFinancialMonthInfo(month, startDay, today);

const expense = (date, amount, categoryId, extra = {}) => ({
  id: `e-${date}-${amount}-${categoryId}`,
  date,
  amount,
  kind: 'expense',
  source: 'month',
  categoryId,
  ...extra,
});

describe('getFinancialMonthInfo', () => {
  it('laufender Kalendermonat: Tage gezählt ab dem 1.', () => {
    expect(info('2026-10')).toMatchObject({
      startDate: '2026-10-01',
      daysInMonth: 31,
      daysElapsed: 15,
      daysRemaining: 16,
      isCurrentMonth: true,
      isFutureMonth: false,
    });
  });

  it('vergangener Monat ist vollständig abgelaufen', () => {
    expect(info('2026-09')).toMatchObject({
      daysInMonth: 30,
      daysElapsed: 30,
      daysRemaining: 0,
      isCurrentMonth: false,
      isFutureMonth: false,
    });
  });

  it('zukünftiger Monat hat noch keinen Tag verbraucht', () => {
    expect(info('2026-11')).toMatchObject({ daysElapsed: 0, daysRemaining: 30, isFutureMonth: true });
  });

  it('abweichender Monatsbeginn: der 24. Oktober gehört schon zum November', () => {
    const today = new Date(2026, 9, 24, 12, 0, 0);
    expect(info('2026-11', 24, today)).toMatchObject({
      startDate: '2026-10-24',
      daysInMonth: 31,
      daysElapsed: 1,
      isCurrentMonth: true,
    });
    expect(info('2026-10', 24, today)).toMatchObject({ isCurrentMonth: false, isFutureMonth: false });
  });

  it('kurz nach Mitternacht zählt der lokale Tag, nicht der UTC-Tag', () => {
    // 1. November 00:30 lokal — in UTC+1/+2 ist das noch der 31. Oktober.
    const today = new Date(2026, 10, 1, 0, 30, 0);
    expect(info('2026-11', 1, today)).toMatchObject({ isCurrentMonth: true, daysElapsed: 1 });
    expect(info('2026-10', 1, today)).toMatchObject({ isCurrentMonth: false });
  });

  it('ohne Monat oder mit ungültigem Monat: null', () => {
    expect(info('')).toBeNull();
    expect(info('2026-13')).toBeNull();
  });
});

describe('calcBudgetMetrics', () => {
  it('unter 95 % ist im Budget', () => {
    expect(calcBudgetMetrics({ budget: 200, spent: 100 })).toMatchObject({ status: 'ok', pct: 0.5, remaining: 100 });
  });

  it('ab 95 % ist knapp', () => {
    expect(calcBudgetMetrics({ budget: 200, spent: 190 }).status).toBe('risk');
  });

  it('genau 100 % ist ausgeschöpft, nicht überschritten', () => {
    const m = calcBudgetMetrics({ budget: 1500, spent: 1500 });
    expect(m.status).toBe('full');
    expect(m.remaining).toBe(0);
  });

  it('Rechenrauschen unter einem Rappen kippt den Status nicht', () => {
    expect(calcBudgetMetrics({ budget: 0.3, spent: 0.1 + 0.2 }).status).toBe('full');
  });

  it('erst über 100 % ist überschritten', () => {
    const m = calcBudgetMetrics({ budget: 200, spent: 200.01 });
    expect(m.status).toBe('over');
    expect(m.remaining).toBeCloseTo(-0.01);
  });

  it('ohne Budget: Auslastung 0', () => {
    expect(calcBudgetMetrics({ budget: 0, spent: 0 }).pct).toBe(0);
  });
});

describe('calcCategoryMonthlySpend', () => {
  const categories = [
    { id: 'cat-essen', name: 'Essen', subcategories: [{ id: 'sub-rest', name: 'Restaurant' }] },
    { id: 'cat-wohnen', name: 'Wohnen', subcategories: [] },
  ];

  it('summiert je Kategorie, Unterkategorie und Finanzmonat', () => {
    const r = calcCategoryMonthlySpend(
      [
        expense('2026-08-05', 40, 'cat-essen'),
        expense('2026-08-20', 60, 'cat-essen', { subcategoryId: 'sub-rest' }),
        expense('2026-09-01', 25, 'cat-essen', { subcategoryId: 'sub-rest' }),
        expense('2026-09-02', 1500, 'cat-wohnen'),
      ],
      categories
    );
    expect(Object.fromEntries(r.byCategory.get('cat-essen'))).toEqual({ '2026-08': 100, '2026-09': 25 });
    expect(Object.fromEntries(r.bySubcategory.get('sub-rest'))).toEqual({ '2026-08': 60, '2026-09': 25 });
    expect(r.byCategory.get('cat-wohnen').get('2026-09')).toBe(1500);
  });

  it('zählt Topf-Ausgaben, Einnahmen und Transfers nicht', () => {
    const r = calcCategoryMonthlySpend(
      [
        { id: 'i', date: '2026-05-25', amount: 5000, kind: 'income' },
        expense('2026-08-05', 300, 'cat-essen', { source: 'pot', potId: 'p1' }),
        { id: 't', date: '2026-08-06', amount: 200, kind: 'transfer', potId: 'p1' },
      ],
      categories
    );
    expect(r.byCategory.size).toBe(0);
    expect(r.bySubcategory.size).toBe(0);
  });

  it('unbekannte Kategorie landet unter Unkategorisiert, unbekannte Unterkategorie nur in der Oberkategorie', () => {
    const r = calcCategoryMonthlySpend(
      [
        expense('2026-08-05', 10, 'cat-geloescht'),
        expense('2026-08-06', 5, null),
        expense('2026-08-07', 7, 'cat-essen', { subcategoryId: 'sub-geloescht' }),
      ],
      categories
    );
    expect(r.byCategory.get(UNCATEGORIZED_ID).get('2026-08')).toBe(15);
    expect(r.byCategory.get('cat-essen').get('2026-08')).toBe(7);
    expect(r.bySubcategory.has('sub-geloescht')).toBe(false);
  });

  it('berücksichtigt den Monatsbeginn', () => {
    const r = calcCategoryMonthlySpend([expense('2026-08-24', 10, 'cat-essen')], categories, 24);
    expect(r.byCategory.get('cat-essen').get('2026-09')).toBe(10);
  });

  it('leeres Buch', () => {
    expect(calcCategoryMonthlySpend([], categories).byCategory.size).toBe(0);
  });
});

describe('buildBudgetRows', () => {
  const categories = [
    {
      id: 'cat-essen',
      name: 'Essen',
      color: '#111',
      budget: 600,
      subcategories: [
        { id: 'sub-rest', name: 'Restaurant', budget: 200 },
        { id: 'sub-markt', name: 'Supermarkt' },
      ],
    },
    { id: 'cat-wohnen', name: 'Wohnen', color: '#333', budget: 2000, subcategories: [] },
    {
      id: 'cat-freizeit',
      name: 'Freizeit',
      color: '#222',
      subcategories: [{ id: 'sub-kino', name: 'Kino' }],
    },
    { id: 'cat-gesundheit', name: 'Gesundheit', color: '#444', subcategories: [] },
    { id: 'cat-leer', name: 'Abos', color: '#555', subcategories: [] },
  ];

  const entries = [
    // September: abgeschlossener Monat
    expense('2026-09-10', 700, 'cat-essen'),
    expense('2026-09-01', 1500, 'cat-wohnen'),
    expense('2026-09-20', 90, 'cat-gesundheit'),
    expense('2026-09-21', 12, 'cat-geloescht'),
    // Oktober: laufender Monat (Tag 15 von 31)
    expense('2026-10-02', 1500, 'cat-wohnen'),
    expense('2026-10-05', 150, 'cat-wohnen'),
    expense('2026-10-06', 100, 'cat-essen'),
    expense('2026-10-07', 210, 'cat-essen', { subcategoryId: 'sub-rest' }),
    expense('2026-10-08', 80, 'cat-essen', { subcategoryId: 'sub-markt' }),
    expense('2026-10-09', 30, 'cat-freizeit', { subcategoryId: 'sub-kino' }),
    expense('2026-10-10', 999, 'cat-essen', { source: 'pot', potId: 'p' }),
  ];

  const build = (monthFilter, extra = {}) =>
    buildBudgetRows({
      entries,
      expenseCategories: categories,
      monthFilter,
      monthStartDay: 1,
      today: TODAY,
      ...extra,
    });
  const byId = (rows, id) => rows.find((r) => r.id === id);

  it('mit Budget: eine Zeile je Oberkategorie, Ausgaben der Unterkategorien eingeschlossen', () => {
    const r = build('2026-10');
    expect(r.budgeted.map((x) => x.id).sort()).toEqual(['cat-essen', 'cat-wohnen']);
    expect(byId(r.budgeted, 'cat-essen')).toMatchObject({
      level: 'category',
      isParent: true,
      budget: 600,
      spent: 390,
      remaining: 210,
      status: 'ok',
      allocated: 200,
      directSpent: 100,
    });
  });

  it('Topf-Ausgaben belasten das Budget nicht', () => {
    expect(byId(build('2026-10').budgeted, 'cat-essen').spent).toBe(390);
  });

  it('Unterkategorien hängen an ihrer Oberkategorie: mit Budget gemessen, ohne nur mit Ausgaben', () => {
    const { subs } = byId(build('2026-10').budgeted, 'cat-essen');
    expect(subs.map((x) => x.id)).toEqual(['sub-rest', 'sub-markt']);
    expect(subs[0]).toMatchObject({
      level: 'subcategory',
      categoryId: 'cat-essen',
      subcategoryId: 'sub-rest',
      parentName: 'Essen',
      isParent: false,
      budget: 200,
      spent: 210,
      status: 'over',
    });
    expect(subs[0].remaining).toBeCloseTo(-10);
    expect(subs[1]).toMatchObject({ budget: null, spent: 80, pct: null, remaining: null, status: null });
    expect(byId(build('2026-10').budgeted, 'cat-wohnen')).toMatchObject({ subs: [], allocated: 0, directSpent: 1650 });
  });

  it('ohne Budget: alle Oberkategorien ohne Budget, auch ohne Ausgaben; Ausgaben zuerst', () => {
    const r = build('2026-10');
    // Ohne Ausgaben im Monat nach Name: „Abos“ vor „Gesundheit“
    expect(r.unbudgeted.map((x) => x.id)).toEqual(['cat-freizeit', 'cat-leer', 'cat-gesundheit']);
    expect(byId(r.unbudgeted, 'cat-leer')).toMatchObject({ spent: 0, budget: null, isParent: true });
    expect(r.unbudgetedSpent).toBe(30);
  });

  it('Unkategorisiert erscheint nur mit Ausgaben im Monat', () => {
    const row = byId(build('2026-09').unbudgeted, UNCATEGORIZED_ID);
    expect(row).toMatchObject({ level: 'uncategorized', spent: 12, categoryId: null });
    expect(byId(build('2026-10').unbudgeted, UNCATEGORIZED_ID)).toBeUndefined();
  });

  it('gemessen wird allein am Verbrauch, in jedem Monat', () => {
    expect(byId(build('2026-10').budgeted, 'cat-wohnen')).toMatchObject({ spent: 1650, remaining: 350, status: 'ok' });
    expect(byId(build('2026-09').budgeted, 'cat-wohnen')).toMatchObject({ spent: 1500, status: 'ok' });
    expect(byId(build('2026-09').budgeted, 'cat-essen')).toMatchObject({ spent: 700, status: 'over' });
    expect(byId(build('2026-11').budgeted, 'cat-wohnen')).toMatchObject({ spent: 0, status: 'ok' });
  });

  it('ohne Monatsfilter gilt der laufende Finanzmonat', () => {
    const r = build('');
    expect(r.month).toBe('2026-10');
    expect(r.monthInfo).toMatchObject({ isCurrentMonth: true, daysRemaining: 16 });
    expect(byId(r.budgeted, 'cat-essen').spent).toBe(390);
    expect(build('2026-09').month).toBe('2026-09');
    // Monatsbeginn am 24.: der 15. Oktober gehört noch zum Finanzmonat Oktober
    expect(build('', { monthStartDay: 24 }).month).toBe('2026-10');
    expect(build('', { monthStartDay: 10 }).month).toBe('2026-11');
  });

  it('Summen nur über Oberkategorien, Sortierung nach Auslastung', () => {
    const r = build('2026-09');
    expect(r.budgeted.map((x) => x.id)).toEqual(['cat-essen', 'cat-wohnen']);
    expect(r.totals).toMatchObject({ budget: 2600, spent: 2200, overCount: 1, status: 'ok' });
    expect(r.totals.pct).toBeCloseTo(2200 / 2600);
  });

  it('ohne Budgets und ohne Daten: leere Sektion, Summen bei 0', () => {
    const r = buildBudgetRows({ entries: [], expenseCategories: [], monthFilter: '2026-10', today: TODAY });
    expect(r.budgeted).toEqual([]);
    expect(r.unbudgeted).toEqual([]);
    expect(r.totals).toMatchObject({ budget: 0, spent: 0, overCount: 0 });
  });
});

describe('setCategoryBudgets', () => {
  const categories = [
    {
      id: 'cat-freizeit',
      name: 'Freizeit',
      budget: 200,
      subcategories: [
        { id: 'sub-kino', name: 'Kino', budget: 50 },
        { id: 'sub-sport', name: 'Sport' },
      ],
    },
    { id: 'cat-essen', name: 'Essen', budget: 600, subcategories: [] },
  ];
  const freizeit = (list) => list.find((c) => c.id === 'cat-freizeit');

  it('setzt das Budget der Kategorie und die Aufteilung auf ihre Unterkategorien', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', {
      budget: 300,
      subBudgets: { 'sub-kino': 120, 'sub-sport': 80.456 },
    });
    expect(freizeit(next).budget).toBe(300);
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([120, 80.46]);
  });

  it('die Aufteilung wird vollständig ersetzt: ohne Angabe bleibt keine Unterkategorie budgetiert', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', { budget: 300 });
    expect(freizeit(next).budget).toBe(300);
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, null]);
  });

  it('leere, ungültige und nicht positive Beträge heißen „kein Budget“', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', {
      budget: 300,
      subBudgets: { 'sub-kino': 0, 'sub-sport': 'abc' },
    });
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, null]);
  });

  it('ohne Budget der Kategorie entfällt auch die Aufteilung', () => {
    for (const change of [undefined, { budget: -5, subBudgets: { 'sub-kino': 40 } }, { subBudgets: { 'sub-kino': 40 } }]) {
      const next = setCategoryBudgets(categories, 'cat-freizeit', change);
      expect(freizeit(next).budget).toBeNull();
      expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, null]);
    }
  });

  it('übersteigt die Aufteilung das Budget, wird es auf die Summe angehoben', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', {
      budget: 100,
      subBudgets: { 'sub-kino': 80, 'sub-sport': 70 },
    });
    expect(freizeit(next).budget).toBe(150);
  });

  it('lässt andere Kategorien und die Eingabe unangetastet', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', { budget: 300 });
    expect(next[1]).toBe(categories[1]);
    expect(categories[0].subcategories[0].budget).toBe(50);
    expect(setCategoryBudgets(null, 'x', { budget: 1 })).toEqual([]);
  });
});
