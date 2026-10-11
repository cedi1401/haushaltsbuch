import { describe, it, expect } from 'vitest';
import {
  UNCATEGORIZED_ID,
  buildBudgetHistory,
  buildBudgetRows,
  calcBudgetMetrics,
  calcBudgetSuggestions,
  calcCategoryMonthlySpend,
  calcHistoryAverage,
  calcSpendStats,
  listBudgetRowEntries,
  listCompletedMonths,
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

describe('calcBudgetMetrics — Status', () => {
  const past = info('2026-09');

  it('unter 95 % ist im Budget', () => {
    expect(calcBudgetMetrics({ budget: 200, spent: 100 }, past).status).toBe('ok');
  });

  it('ab 95 % ist knapp', () => {
    expect(calcBudgetMetrics({ budget: 200, spent: 190 }, past).status).toBe('risk');
  });

  it('genau 100 % ist ausgeschöpft, nicht überschritten', () => {
    const m = calcBudgetMetrics({ budget: 1500, spent: 1500 }, past);
    expect(m.status).toBe('full');
    expect(m.remaining).toBe(0);
  });

  it('Rechenrauschen unter einem Rappen kippt den Status nicht', () => {
    expect(calcBudgetMetrics({ budget: 0.3, spent: 0.1 + 0.2 }, past).status).toBe('full');
  });

  it('erst über 100 % ist überschritten', () => {
    const m = calcBudgetMetrics({ budget: 200, spent: 200.01 }, past);
    expect(m.status).toBe('over');
    expect(m.remaining).toBeCloseTo(-0.01);
  });

  it('außerhalb des laufenden Monats gibt es weder Zeitvergleich noch Prognose', () => {
    for (const monthInfo of [past, info('2026-11'), null]) {
      const m = calcBudgetMetrics({ budget: 200, spent: 150 }, monthInfo);
      expect(m.status).toBe('ok');
      expect(m.forecast).toBeNull();
      expect(m.paceDelta).toBeNull();
      expect(m.expectedPct).toBeNull();
    }
  });
});

describe('calcBudgetMetrics — Zeitvergleich und Prognose', () => {
  // 15 von 31 Tagen ⇒ Zeitfortschritt 48,4 %
  const current = info('2026-10');

  it('mehr als 10 Prozentpunkte über dem Zeitfortschritt: Aufpassen', () => {
    const m = calcBudgetMetrics({ budget: 310, spent: 200 }, current);
    expect(m.status).toBe('warn');
    expect(m.expectedPct).toBeCloseTo(15 / 31);
    // 310 * 15/31 = 150 wären im Zeitplan
    expect(m.paceDelta).toBeCloseTo(50);
    expect(m.forecast).toBeCloseTo((200 / 15) * 31);
    expect(m.forecastDelta).toBeCloseTo((200 / 15) * 31 - 310);
  });

  it('innerhalb der Toleranz bleibt es im Budget', () => {
    // 170 / 310 = 54,8 % — 6,4 Punkte über dem Zeitfortschritt
    expect(calcBudgetMetrics({ budget: 310, spent: 170 }, current).status).toBe('ok');
  });

  it('vor Tag 3 wird nicht hochgerechnet', () => {
    const day2 = info('2026-10', 1, new Date(2026, 9, 2, 12, 0, 0));
    const m = calcBudgetMetrics({ budget: 310, spent: 200 }, day2);
    expect(m.status).toBe('ok');
    expect(m.forecast).toBeNull();
  });

  it('reine Fixkosten-Kategorie: Miete am 3. ist ausgeschöpft, Prognose = Miete', () => {
    const day3 = info('2026-10', 1, new Date(2026, 9, 3, 12, 0, 0));
    const m = calcBudgetMetrics({ budget: 1500, spent: 1500, fixedBooked: 1500 }, day3);
    expect(m.status).toBe('full');
    expect(m.forecast).toBe(1500);
    expect(m.dailyRate).toBe(0);
    // Kein variabler Teil ⇒ kein Zeitvergleich
    expect(m.paceDelta).toBeNull();
  });

  it('gemischte Kategorie: nur der variable Teil wird linear hochgerechnet', () => {
    // Budget 2000, davon 1500 Miete gebucht; variabel 500, davon 150 verbraucht
    const m = calcBudgetMetrics({ budget: 2000, spent: 1650, fixedBooked: 1500 }, current);
    expect(m.variableBudget).toBe(500);
    expect(m.variableSpent).toBe(150);
    // 150 / 500 = 30 % bei 48 % Zeitfortschritt ⇒ nicht „Aufpassen“
    expect(m.status).toBe('ok');
    expect(m.forecast).toBeCloseTo(1500 + (150 / 15) * 31);
    expect(m.paceDelta).toBeCloseTo(150 - 500 * (15 / 31));
  });

  it('noch offene Fixkosten gehen mit vollem Betrag in die Prognose ein', () => {
    // Miete 1500 noch nicht gebucht, 150 variabel verbraucht
    const m = calcBudgetMetrics({ budget: 2000, spent: 150, fixedOpen: 1500 }, current);
    expect(m.forecast).toBeCloseTo(1500 + (150 / 15) * 31);
    expect(m.variableBudget).toBe(500);
    expect(m.status).toBe('ok');
  });

  it('variabler Teil läuft davon: Aufpassen trotz hohem Fixanteil', () => {
    // variabel 400 von 500 = 80 % bei 48 % Zeitfortschritt
    const m = calcBudgetMetrics({ budget: 2000, spent: 1900, fixedBooked: 1500 }, current);
    // 95 % Gesamtauslastung hat Vorrang vor dem Zeitvergleich
    expect(m.status).toBe('risk');
    const m2 = calcBudgetMetrics({ budget: 2000, spent: 1850, fixedBooked: 1500 }, current);
    expect(m2.status).toBe('warn');
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
    expect(r.firstMonth).toBe('2026-08');
  });

  it('zählt Topf-Ausgaben, Einnahmen und Transfers nicht — sie setzen aber den ersten Monat', () => {
    const r = calcCategoryMonthlySpend(
      [
        { id: 'i', date: '2026-05-25', amount: 5000, kind: 'income' },
        expense('2026-08-05', 300, 'cat-essen', { source: 'pot', potId: 'p1' }),
        { id: 't', date: '2026-08-06', amount: 200, kind: 'transfer', potId: 'p1' },
      ],
      categories
    );
    expect(r.byCategory.size).toBe(0);
    expect(r.firstMonth).toBe('2026-05');
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
    expect(calcCategoryMonthlySpend([], categories).firstMonth).toBeNull();
  });
});

describe('listCompletedMonths', () => {
  it('liefert die letzten n Monate vor dem laufenden, älteste zuerst', () => {
    expect(listCompletedMonths('2026-02', 3, '2020-01')).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('geht nie vor die erste Buchung zurück', () => {
    expect(listCompletedMonths('2026-10', 6, '2026-08')).toEqual(['2026-08', '2026-09']);
  });

  it('ohne abgeschlossenen Monat: leer', () => {
    expect(listCompletedMonths('2026-10', 6, '2026-10')).toEqual([]);
    expect(listCompletedMonths('2026-10', 6, null)).toEqual([]);
    expect(listCompletedMonths('2026-10', Infinity, null)).toEqual([]);
  });

  it('Infinity liefert alle Monate seit der ersten Buchung', () => {
    expect(listCompletedMonths('2026-10', Infinity, '2025-08')).toHaveLength(14);
  });
});

describe('calcSpendStats', () => {
  const map = new Map([['2026-07', 100], ['2026-08', 400], ['2026-09', 130]]);

  it('Durchschnitt und Median, Monate ohne Ausgaben zählen als 0', () => {
    expect(calcSpendStats(map, ['2026-06', '2026-07', '2026-08', '2026-09'])).toEqual({
      avg: 157.5,
      median: 115,
      count: 4,
    });
  });

  it('ungerade Anzahl: mittlerer Wert', () => {
    expect(calcSpendStats(map, ['2026-07', '2026-08', '2026-09']).median).toBe(130);
  });

  it('rundet auf zwei Stellen', () => {
    expect(calcSpendStats(new Map([['2026-07', 100]]), ['2026-07', '2026-08', '2026-09']).avg).toBe(33.33);
  });

  it('ohne Monate: null; ohne Daten: 0', () => {
    expect(calcSpendStats(map, [])).toBeNull();
    expect(calcSpendStats(undefined, ['2026-09'])).toEqual({ avg: 0, median: 0, count: 1 });
  });
});

describe('buildBudgetRows', () => {
  const categories = [
    { id: 'cat-essen', name: 'Essen', color: '#111', budget: 600, subcategories: [{ id: 'sub-rest', name: 'Restaurant' }] },
    {
      id: 'cat-freizeit',
      name: 'Freizeit',
      color: '#222',
      subcategories: [
        { id: 'sub-kino', name: 'Kino', budget: 50 },
        { id: 'sub-sport', name: 'Sport' },
      ],
    },
    { id: 'cat-wohnen', name: 'Wohnen', color: '#333', budget: 2000, subcategories: [] },
    { id: 'cat-gesundheit', name: 'Gesundheit', color: '#444', subcategories: [] },
    { id: 'cat-leer', name: 'Abos', color: '#555', subcategories: [] },
  ];
  const miete = { id: 'r-miete', name: 'Miete', kind: 'expense', amount: 1500, categoryId: 'cat-wohnen' };
  const strom = { id: 'r-strom', name: 'Strom', kind: 'expense', amount: 100, categoryId: 'cat-wohnen' };
  const steuern = { id: 'r-steuern', name: 'Steuern', kind: 'transfer', amount: 1200, turnus: 12, potId: 'p' };

  const entries = [
    // August und September: abgeschlossene Monate
    expense('2026-08-10', 500, 'cat-essen'),
    expense('2026-09-10', 700, 'cat-essen'),
    expense('2026-09-12', 80, 'cat-freizeit', { subcategoryId: 'sub-kino' }),
    expense('2026-09-13', 40, 'cat-freizeit', { subcategoryId: 'sub-sport' }),
    expense('2026-09-14', 20, 'cat-freizeit'),
    expense('2026-09-01', 1500, 'cat-wohnen', { recurringId: 'r-miete' }),
    expense('2026-09-20', 90, 'cat-gesundheit'),
    expense('2026-09-21', 12, 'cat-geloescht'),
    // Oktober: laufender Monat (Tag 15 von 31)
    expense('2026-10-02', 1500, 'cat-wohnen', { recurringId: 'r-miete' }),
    expense('2026-10-05', 150, 'cat-wohnen'),
    expense('2026-10-06', 300, 'cat-essen'),
    expense('2026-10-07', 30, 'cat-freizeit', { subcategoryId: 'sub-sport' }),
    expense('2026-10-08', 999, 'cat-essen', { source: 'pot', potId: 'p' }),
  ];

  const build = (monthFilter, extra = {}) =>
    buildBudgetRows({
      entries,
      expenseCategories: categories,
      recurringExpenses: [miete, strom, steuern],
      monthFilter,
      monthStartDay: 1,
      today: TODAY,
      ...extra,
    });
  const byId = (rows, id) => rows.find((r) => r.id === id);

  it('mit Budget: eine Zeile je budgetierter Ebene', () => {
    const r = build('2026-10');
    expect(r.budgeted.map((x) => x.id).sort()).toEqual(['cat-essen', 'cat-wohnen', 'sub-kino']);
    expect(byId(r.budgeted, 'sub-kino')).toMatchObject({
      level: 'subcategory',
      categoryId: 'cat-freizeit',
      subcategoryId: 'sub-kino',
      parentName: 'Freizeit',
      isParent: false,
      budget: 50,
      spent: 0,
    });
    expect(byId(r.budgeted, 'cat-essen')).toMatchObject({ level: 'category', isParent: true, spent: 300 });
  });

  it('Topf-Ausgaben belasten das Budget nicht', () => {
    expect(byId(build('2026-10').budgeted, 'cat-essen').spent).toBe(300);
  });

  it('ohne Budget: alle Oberkategorien, auch ohne Ausgaben; Ausgaben zuerst', () => {
    const r = build('2026-10');
    expect(r.unbudgeted.map((x) => x.id)).toEqual(['cat-freizeit', 'cat-gesundheit', UNCATEGORIZED_ID, 'cat-leer']);
    expect(byId(r.unbudgeted, 'cat-leer')).toMatchObject({ spent: 0, budget: null, isRemainder: false });
    expect(r.unbudgetedSpent).toBe(30);
  });

  it('Oberkategorie mit Unterkategorie-Budgets: der Rest steht ohne Budget', () => {
    const rest = byId(build('2026-09').unbudgeted, 'cat-freizeit');
    // 140 gesamt, davon 80 im budgetierten Kino
    expect(rest).toMatchObject({ isRemainder: true, spent: 60, budget: null });
  });

  it('Rest entfällt, wenn alle Unterkategorien budgetiert sind und nichts übrig ist', () => {
    const cats = [
      { id: 'cat-a', name: 'A', subcategories: [{ id: 'sub-a1', name: 'A1', budget: 10 }] },
    ];
    const args = { expenseCategories: cats, monthFilter: '2026-10', today: TODAY };
    const clean = buildBudgetRows({ ...args, entries: [expense('2026-10-03', 5, 'cat-a', { subcategoryId: 'sub-a1' })] });
    expect(clean.unbudgeted).toEqual([]);
    const direct = buildBudgetRows({ ...args, entries: [expense('2026-10-03', 5, 'cat-a')] });
    expect(direct.unbudgeted).toHaveLength(1);
    expect(direct.unbudgeted[0]).toMatchObject({ id: 'cat-a', isRemainder: true, spent: 5 });
  });

  it('Unkategorisiert erscheint nur mit Ausgaben oder Durchschnitt', () => {
    const row = byId(build('2026-09').unbudgeted, UNCATEGORIZED_ID);
    expect(row).toMatchObject({ level: 'uncategorized', spent: 12, categoryId: null });
    const none = buildBudgetRows({
      entries: [expense('2026-10-03', 5, 'cat-leer')],
      expenseCategories: categories,
      monthFilter: '2026-10',
      today: TODAY,
    });
    expect(byId(none.unbudgeted, UNCATEGORIZED_ID)).toBeUndefined();
  });

  it('Ø und Median nur über abgeschlossene Monate seit der ersten Buchung', () => {
    const essen = byId(build('2026-10').budgeted, 'cat-essen');
    // August 500, September 700 — der laufende Oktober zählt nicht
    expect(essen.avg6).toBe(600);
    expect(essen.median12).toBe(600);
    const leer = byId(build('2026-10').unbudgeted, 'cat-leer');
    expect(leer.avg6).toBe(0);
  });

  it('Buch ohne abgeschlossenen Monat: kein Durchschnitt', () => {
    const r = buildBudgetRows({
      entries: [expense('2026-10-03', 5, 'cat-essen')],
      expenseCategories: categories,
      monthFilter: '2026-10',
      today: TODAY,
    });
    expect(byId(r.budgeted, 'cat-essen')).toMatchObject({ avg6: null, median12: null });
  });

  it('laufender Monat: gebuchte und offene Fixkosten, Prognose ohne Hochrechnung der Miete', () => {
    const wohnen = byId(build('2026-10').budgeted, 'cat-wohnen');
    // Miete gebucht, Strom (100) noch offen; die Rücklage ist kein Ausgaben-Fixposten
    expect(wohnen).toMatchObject({ spent: 1650, fixedBooked: 1500, fixedOpen: 100, status: 'ok' });
    expect(wohnen.forecast).toBeCloseTo(1600 + (150 / 15) * 31);
  });

  it('vergangener Monat: keine offenen Fixkosten, keine Prognose', () => {
    const wohnen = byId(build('2026-09').budgeted, 'cat-wohnen');
    expect(wohnen).toMatchObject({ spent: 1500, fixedBooked: 1500, fixedOpen: 0, forecast: null, status: 'ok' });
    expect(byId(build('2026-09').budgeted, 'cat-essen').status).toBe('over');
  });

  it('zukünftiger Monat: nur Soll, Fixkosten als offen', () => {
    const r = build('2026-11');
    expect(byId(r.budgeted, 'cat-wohnen')).toMatchObject({ spent: 0, fixedOpen: 1600, forecast: null, status: 'ok' });
    expect(r.monthInfo.isFutureMonth).toBe(true);
  });

  it('alle Monate: Ø pro abgeschlossenem Monat statt Summe, ohne Fixanteil und Prognose', () => {
    const r = build('');
    expect(r.isAverage).toBe(true);
    expect(r.monthInfo).toBeNull();
    expect(byId(r.budgeted, 'cat-essen')).toMatchObject({
      spent: 600,
      isAverage: true,
      fixedBooked: 0,
      fixedOpen: 0,
      forecast: null,
      status: 'full',
    });
    // Kino: 80 im September, 0 im August
    expect(byId(r.budgeted, 'sub-kino')).toMatchObject({ spent: 40, status: 'ok' });
  });

  it('Summen und Sortierung nach Auslastung', () => {
    const r = build('2026-09');
    expect(r.budgeted.map((x) => x.id)).toEqual(['sub-kino', 'cat-essen', 'cat-wohnen']);
    expect(r.totals).toMatchObject({ budget: 2650, spent: 2280, overCount: 2, status: 'ok' });
    expect(r.totals.pct).toBeCloseTo(2280 / 2650);
  });

  it('ohne Budgets und ohne Daten: leere Sektion, Summen bei 0', () => {
    const r = buildBudgetRows({ entries: [], expenseCategories: [], monthFilter: '2026-10', today: TODAY });
    expect(r.budgeted).toEqual([]);
    expect(r.unbudgeted).toEqual([]);
    expect(r.totals).toMatchObject({ budget: 0, spent: 0, overCount: 0 });
  });

  it('Verlauf: Summe der budgetierten Zeilen je Monat, laufender Monat markiert', () => {
    const r = build('2026-10');
    expect(r).toMatchObject({ firstMonth: '2026-08', currentMonth: '2026-10' });
    const series = buildBudgetHistory(r.budgeted.map((x) => x.monthly), r.firstMonth, r.currentMonth);
    expect(series).toEqual([
      { ym: '2026-08', label: 'Aug 2026', total: 500, isCurrent: false },
      { ym: '2026-09', label: 'Sep 2026', total: 2280, isCurrent: false },
      { ym: '2026-10', label: 'Okt 2026', total: 1950, isCurrent: true },
    ]);
    expect(calcHistoryAverage(series)).toBe(1390);
  });

  it('Verlauf: der Monatsfilter ändert die Reihe nicht, das Limit zählt vom laufenden Monat rückwärts', () => {
    const r = build('2026-08');
    const rest = byId(r.unbudgeted, 'cat-freizeit');
    const series = buildBudgetHistory([rest.monthly], r.firstMonth, r.currentMonth, 2);
    expect(series.map((p) => [p.ym, p.total])).toEqual([['2026-09', 60], ['2026-10', 30]]);
  });

  it('Verlauf: ohne Buchungen leer, Ø ohne abgeschlossenen Monat null', () => {
    expect(buildBudgetHistory([], null, '2026-10')).toEqual([]);
    expect(buildBudgetHistory([undefined], '2026-10', '2026-10')).toEqual([
      { ym: '2026-10', label: 'Okt 2026', total: 0, isCurrent: true },
    ]);
    expect(calcHistoryAverage([{ total: 80, isCurrent: true }])).toBeNull();
    expect(calcHistoryAverage([])).toBeNull();
  });

  it('Buchungen einer Zeile: gleiche Zuordnung wie das Ist, neueste zuerst', () => {
    const r = build('2026-09');
    const list = (row, monthFilter = '2026-09') =>
      listBudgetRowEntries({ entries, expenseCategories: categories, row, monthFilter, monthStartDay: 1 })
        .map((e) => e.amount);
    expect(list(byId(r.budgeted, 'sub-kino'))).toEqual([80]);
    // Rest der Oberkategorie: ohne die budgetierte Unterkategorie Kino
    expect(list(byId(r.unbudgeted, 'cat-freizeit'))).toEqual([20, 40]);
    expect(list(byId(r.unbudgeted, UNCATEGORIZED_ID))).toEqual([12]);
    // Topf-Ausgabe im Oktober zählt nicht
    expect(list(byId(r.budgeted, 'cat-essen'), '2026-10')).toEqual([300]);
    expect(list(byId(r.budgeted, 'cat-wohnen'), '2026-10')).toEqual([150, 1500]);
    expect(list(byId(r.budgeted, 'cat-essen'), '')).toEqual([]);
  });

  it('Buchungen einer Zeile summieren sich zum Ist', () => {
    const r = build('2026-09');
    for (const row of [...r.budgeted, ...r.unbudgeted]) {
      const sum = listBudgetRowEntries({ entries, expenseCategories: categories, row, monthFilter: '2026-09' })
        .reduce((s, e) => s + e.amount, 0);
      expect(sum).toBe(row.spent);
    }
  });
});

describe('calcBudgetSuggestions', () => {
  const categories = [
    { id: 'cat-freizeit', name: 'Freizeit', subcategories: [{ id: 'sub-kino', name: 'Kino' }, { id: 'sub-sport', name: 'Sport' }] },
    { id: 'cat-leer', name: 'Leer', subcategories: [] },
  ];
  const entries = [
    expense('2026-08-05', 100, 'cat-freizeit', { subcategoryId: 'sub-kino' }),
    expense('2026-09-05', 60, 'cat-freizeit', { subcategoryId: 'sub-kino' }),
    expense('2026-09-06', 40, 'cat-freizeit'),
    // laufender Monat zählt nicht mit
    expense('2026-10-02', 999, 'cat-freizeit', { subcategoryId: 'sub-kino' }),
  ];

  it('liefert Ø und Median je Oberkategorie (inkl. Unterkategorien) und je Unterkategorie', () => {
    const r = calcBudgetSuggestions({ entries, expenseCategories: categories, today: TODAY });
    expect(r.byCategory.get('cat-freizeit')).toEqual({ avg6: 100, median12: 100 });
    expect(r.bySubcategory.get('sub-kino')).toEqual({ avg6: 80, median12: 80 });
    expect(r.bySubcategory.get('sub-sport')).toEqual({ avg6: 0, median12: 0 });
    expect(r.byCategory.get('cat-leer')).toEqual({ avg6: 0, median12: 0 });
  });

  it('ohne abgeschlossenen Monat gibt es keine Vorschläge', () => {
    const r = calcBudgetSuggestions({
      entries: [expense('2026-10-02', 50, 'cat-freizeit')],
      expenseCategories: categories,
      today: TODAY,
    });
    expect(r.byCategory.get('cat-freizeit')).toEqual({ avg6: null, median12: null });
  });
});

describe('setCategoryBudgets', () => {
  const categories = [
    {
      id: 'cat-freizeit',
      name: 'Freizeit',
      budget: null,
      subcategories: [
        { id: 'sub-kino', name: 'Kino', budget: 50 },
        { id: 'sub-sport', name: 'Sport' },
      ],
    },
    { id: 'cat-essen', name: 'Essen', budget: 600, subcategories: [] },
  ];
  const freizeit = (list) => list.find((c) => c.id === 'cat-freizeit');

  it('Budget für die ganze Kategorie leert die Unterkategorien', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', { budget: 200 });
    expect(freizeit(next).budget).toBe(200);
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, null]);
  });

  it('Budgets je Unterkategorie leeren die Oberkategorie', () => {
    const start = setCategoryBudgets(categories, 'cat-freizeit', { budget: 200 });
    const next = setCategoryBudgets(start, 'cat-freizeit', { subBudgets: { 'sub-sport': 80.456 } });
    expect(freizeit(next).budget).toBeNull();
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, 80.46]);
  });

  it('leere, ungültige und nicht positive Beträge heißen „kein Budget“', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', {
      subBudgets: { 'sub-kino': 0, 'sub-sport': 'abc' },
    });
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, null]);
    expect(freizeit(setCategoryBudgets(categories, 'cat-freizeit', { budget: -5 })).budget).toBeNull();
  });

  it('ohne Angabe wird das Budget auf beiden Ebenen entfernt', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit');
    expect(freizeit(next).budget).toBeNull();
    expect(freizeit(next).subcategories.map((s) => s.budget)).toEqual([null, null]);
  });

  it('lässt andere Kategorien und die Eingabe unangetastet', () => {
    const next = setCategoryBudgets(categories, 'cat-freizeit', { budget: 200 });
    expect(next[1]).toBe(categories[1]);
    expect(categories[0].subcategories[0].budget).toBe(50);
    expect(setCategoryBudgets(null, 'x', { budget: 1 })).toEqual([]);
  });
});
