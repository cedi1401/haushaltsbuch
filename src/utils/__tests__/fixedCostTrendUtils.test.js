import { describe, it, expect } from 'vitest';
import {
  buildFixedCostMonthlyData,
  buildItemTrends,
} from '../fixedCostTrendUtils.js';

// Drei Positionen, die die Kostenregel abdecken:
// - Ausgaben-Fixkosten            → zählt
// - Rücklage (Transfer mit Turnus) → zählt, Zyklusbetrag 1200 bei turnus 12
// - freies Sparen (ohne Turnus)    → zählt nicht
const miete = { id: 'r-miete', name: 'Miete', kind: 'expense', amount: 1500, categoryId: 'cat-wohnen' };
const steuern = { id: 'r-steuern', name: 'Steuern', kind: 'transfer', amount: 1200, turnus: 12, potId: 'pot-steuern', transferCategory: 'Steuern' };
const ferien = { id: 'r-ferien', name: 'Ferien', kind: 'transfer', amount: 200, potId: 'pot-ferien', transferCategory: 'Ferien' };

const items = [miete, steuern, ferien];

// m.expense kommt aus TrendView und zählt nur kind === "expense" && source === "month".
const monthly = [{ month: '2026-08', label: 'Aug 26', expense: 2000 }];

const booked = (recurringId, amount, extra = {}) => ({
  id: `e-${recurringId}`,
  date: '2026-08-10',
  amount,
  recurringId,
  ...extra,
});

const data = (entries) => buildFixedCostMonthlyData(entries, items, monthly, 1)[0];

describe('buildFixedCostMonthlyData — Kostenregel im Zähler', () => {
  it('zählt Ausgaben-Fixkosten aus dem Monatsbudget', () => {
    const r = data([booked('r-miete', 1500, { kind: 'expense', source: 'month' })]);
    expect(r.expenseFixedTotal).toBe(1500);
    expect(r.sinkingTotal).toBe(0);
    expect(r.fixedTotal).toBe(1500);
  });

  it('zählt eine Rücklage (Transfer mit Turnus) als Belastung', () => {
    const r = data([booked('r-steuern', 100, { kind: 'transfer', potId: 'pot-steuern' })]);
    expect(r.sinkingTotal).toBe(100);
    expect(r.expenseFixedTotal).toBe(0);
    expect(r.fixedTotal).toBe(100);
  });

  it('lässt freies Sparen (Transfer ohne Turnus) vollständig aussen vor', () => {
    const r = data([booked('r-ferien', 200, { kind: 'transfer', potId: 'pot-ferien' })]);
    expect(r.fixedTotal).toBe(0);
    expect(r.sinkingTotal).toBe(0);
    expect(r.basis).toBe(2000);
    expect(r.share).toBeCloseTo(0, 10);
  });

  it('ignoriert eine aus dem Topf bezahlte Ausgabe — die Entnahme ist keine Kostenbuchung', () => {
    const r = data([booked('r-miete', 1500, { kind: 'expense', source: 'pot', potId: 'pot-steuern' })]);
    expect(r.fixedTotal).toBe(0);
  });

  it('ignoriert Einträge ohne recurringId und mit unbekannter recurringId', () => {
    const r = data([
      { id: 'e-manuell', date: '2026-08-10', amount: 999, kind: 'expense', source: 'month' },
      booked('r-geloescht', 999, { kind: 'expense', source: 'month' }),
    ]);
    expect(r.fixedTotal).toBe(0);
  });

  it('ignoriert Einkommen, auch mit passender recurringId', () => {
    const r = data([booked('r-miete', 500, { kind: 'income' })]);
    expect(r.fixedTotal).toBe(0);
  });
});

describe('buildFixedCostMonthlyData — Anteil an der Gesamtbelastung', () => {
  it('nimmt die gebuchte Rücklage in den Nenner auf', () => {
    const r = data([
      booked('r-miete', 1500, { kind: 'expense', source: 'month' }),
      booked('r-steuern', 100, { kind: 'transfer', potId: 'pot-steuern' }),
    ]);
    // basis = 2000 Ausgaben + 100 Rücklage; Zähler = 1500 + 100
    expect(r.basis).toBe(2100);
    expect(r.share).toBeCloseTo((1600 / 2100) * 100, 10);
  });

  it('überschreitet 100 % nicht mehr, wenn nur Rücklagen gebucht sind', () => {
    // Der alte Fehler: Zähler enthielt den Transfer, Nenner (m.expense) nicht.
    const r = buildFixedCostMonthlyData(
      [booked('r-steuern', 100, { kind: 'transfer', potId: 'pot-steuern' })],
      items,
      [{ month: '2026-08', label: 'Aug 26', expense: 0 }],
      1
    )[0];
    expect(r.share).toBe(100);
  });

  it('liefert share === null, wenn im Monat gar nichts anfällt', () => {
    const r = buildFixedCostMonthlyData([], items, [{ month: '2026-08', label: 'Aug 26', expense: 0 }], 1)[0];
    expect(r.share).toBeNull();
    expect(r.basis).toBe(0);
    expect(r.fixedTotal).toBe(0);
  });

  it('kommt ohne Einträge, ohne Positionen und ohne Monate ohne NaN aus', () => {
    expect(buildFixedCostMonthlyData(null, null, null, 1)).toEqual([]);
    const r = buildFixedCostMonthlyData(null, null, [{ month: '2026-08', label: 'Aug 26' }], 1)[0];
    expect(r.fixedTotal).toBe(0);
    expect(r.basis).toBe(0);
    expect(r.share).toBeNull();
  });
});

describe('buildItemTrends — folgt derselben Kostenregel', () => {
  it('führt freies Sparen ohne Werte, die Rücklage dagegen mit', () => {
    const trends = buildItemTrends(
      [
        booked('r-steuern', 100, { kind: 'transfer', potId: 'pot-steuern' }),
        booked('r-ferien', 200, { kind: 'transfer', potId: 'pot-ferien' }),
      ],
      items,
      monthly,
      1
    );
    const byId = Object.fromEntries(trends.map((t) => [t.id, t]));
    expect(byId['r-steuern'].data[0].amount).toBe(100);
    expect(byId['r-ferien'].data[0].amount).toBeNull();
  });
});
