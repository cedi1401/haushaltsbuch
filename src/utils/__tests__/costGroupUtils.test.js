import { describe, it, expect } from 'vitest';
import { calcCostGroupStats, formatMonthCount } from '../costGroupUtils.js';

const group = { categoryIds: ['cat-auto'], subcategoryIds: [] };
const expense = (date, amount) => ({ kind: 'expense', date, amount, categoryId: 'cat-auto' });

const entries = [
  expense('2025-03-10', 100),
  expense('2025-03-20', 200),
  expense('2025-04-15', 300),
  expense('2025-05-15', 400),
  expense('2025-06-30', 500),
  expense('2025-07-05', 600),
];

// Fixes "heute", damit die Fenster "12"/"24"/"all" reproduzierbar bleiben.
const TODAY = '2026-08-20';
const stats = (opts) => calcCostGroupStats(group, entries, { today: TODAY, ...opts });
const custom = (from, to, opts) => stats({ rangeOption: 'custom', customRange: { from, to }, ...opts });

describe('calcCostGroupStats — feste Zeitfenster', () => {
  it('behält die feste Fensterlänge als Monatszahl', () => {
    expect(stats({ rangeOption: '12' }).monthCount).toBe(12);
    expect(stats({ rangeOption: '24' }).monthCount).toBe(24);
  });

  it('rechnet bei "all" vom ersten Buchungsmonat bis heute', () => {
    const r = stats({ rangeOption: 'all' });
    expect(r.total).toBe(2100);
    expect(r.firstMonth).toBe('2025-03');
    expect(r.monthCount).toBe(18); // Mär 2025 – Aug 2026
  });

  it('markiert in festen Fenstern keine Monate als angeschnitten', () => {
    for (const rangeOption of ['12', '24', 'all']) {
      const r = stats({ rangeOption });
      expect(r.monthlySeries.some((p) => p.partial)).toBe(false);
    }
  });
});

describe('calcCostGroupStats — freier Zeitraum', () => {
  it('ergibt bei ganzen Kalendermonaten eine ganze Monatszahl', () => {
    const r = custom('2025-03-01', '2025-06-30');
    expect(r.total).toBe(1500);
    expect(r.monthCount).toBe(4);
    expect(r.avgMonthly).toBe(375);
    expect(r.monthlySeries.some((p) => p.partial)).toBe(false);
  });

  it('filtert tagesgenau statt auf Monatsebene', () => {
    const r = custom('2025-03-15', '2025-06-30');
    expect(r.total).toBe(1400); // die Buchung vom 10.03. fällt raus
    expect(r.entryCount).toBe(4);
  });

  it('zählt angebrochene Randmonate anteilig', () => {
    const r = custom('2025-03-15', '2025-06-30');
    expect(r.monthCount).toBeCloseTo(3 + 16 / 30, 6);
    expect(r.avgMonthly).toBeCloseTo(1400 / r.monthCount, 6);
  });

  it('markiert angeschnittene Randmonate in der Zeitreihe', () => {
    const [first, second] = custom('2025-03-15', '2025-06-30').monthlySeries;
    expect(first).toMatchObject({ ym: '2025-03', partial: true, partialFrom: '2025-03-15', partialTo: '2025-03-31' });
    expect(second.partial).toBeUndefined();
  });

  it('markiert Teilmonate anhand der Finanzmonatsgrenzen (monthStartDay > 1)', () => {
    const r = custom('2025-03-01', '2025-06-30', { monthStartDay: 24 });
    // Finanzmonate Mär–Jul; die Monatszahl bleibt tagesgenau bei 4.
    expect(r.monthlySeries.map((p) => p.ym)).toEqual(['2025-03', '2025-04', '2025-05', '2025-06', '2025-07']);
    expect(r.monthCount).toBe(4);
    expect(r.monthlySeries[0]).toMatchObject({ partial: true, partialTo: '2025-03-23' });
    expect(r.monthlySeries[4]).toMatchObject({ partial: true, partialFrom: '2025-06-24' });
  });

  it('liefert ohne Buchungen eine 0-Zeitreihe über das volle Fenster', () => {
    const r = custom('2025-01-01', '2025-02-28');
    expect(r.total).toBe(0);
    expect(r.monthCount).toBe(2);
    expect(r.avgMonthly).toBe(0);
    expect(r.monthlySeries.map((p) => p.total)).toEqual([0, 0]);
  });

  it('rechnet sehr kurze Zeiträume anteilig hoch, ohne durch 0 zu teilen', () => {
    const r = custom('2025-06-28', '2025-06-30');
    expect(r.total).toBe(500);
    expect(r.monthCount).toBeCloseTo(3 / 30, 6);
    expect(Number.isFinite(r.avgMonthly)).toBe(true);
  });

  it('klemmt das Ende auf heute — Zukunft zählt nicht', () => {
    const r = custom('2026-08-01', '2027-01-01');
    expect(r.rangeTo).toBe(TODAY);
  });

  it('liefert leere Kennzahlen bei ungültigem Zeitraum', () => {
    for (const r of [custom('2025-06-30', '2025-03-01'), custom('', ''), custom('2025-03-01', '')]) {
      expect(r.monthCount).toBe(0);
      expect(r.avgMonthly).toBe(0);
      expect(r.monthlySeries).toEqual([]);
    }
  });

  it('klemmt den Monatstag ans Monatsende (31.01. + 1 Monat)', () => {
    expect(custom('2025-01-31', '2025-02-27').monthCount).toBeCloseTo(1, 9);
    expect(custom('2024-02-01', '2024-02-29').monthCount).toBeCloseTo(1, 9); // Schaltjahr
  });
});

describe('formatMonthCount', () => {
  it('zeigt ganze Zahlen ohne Dezimale', () => {
    expect(formatMonthCount(4)).toBe('4');
    expect(formatMonthCount(12)).toBe('12');
  });

  it('zeigt angebrochene Zeiträume mit deutschem Komma', () => {
    expect(formatMonthCount(3.5333)).toBe('3,5');
    expect(formatMonthCount(0.1)).toBe('0,1');
  });

  it('rundet knapp daneben liegende Werte auf die ganze Zahl', () => {
    expect(formatMonthCount(3.96)).toBe('4');
  });
});
