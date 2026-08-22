import { describe, it, expect } from 'vitest';
import { turnusMonths, monthlyRate, annualAmount, isSinkingFund, cycleAnchor, sinkingFundStatus, buildSinkingFundRows, buildCatchUpRates } from '../fixedCostUtils.js';
import { addMonthsISO } from '../financialMonthUtils.js';

describe('turnusMonths', () => {
  it('liefert 1 ohne Turnus', () => {
    expect(turnusMonths({ kind: 'transfer', amount: 200 })).toBe(1);
    expect(turnusMonths({ kind: 'transfer', amount: 200, turnus: null })).toBe(1);
  });

  it('liefert den gesetzten Turnus', () => {
    expect(turnusMonths({ kind: 'transfer', turnus: 3 })).toBe(3);
    expect(turnusMonths({ kind: 'transfer', turnus: 12 })).toBe(12);
  });

  it('fängt unbrauchbare Werte auf 1 ab', () => {
    expect(turnusMonths({ turnus: 0 })).toBe(1);
    expect(turnusMonths({ turnus: -6 })).toBe(1);
    expect(turnusMonths({ turnus: 'jährlich' })).toBe(1);
    expect(turnusMonths(undefined)).toBe(1);
  });
});

describe('monthlyRate', () => {
  it('gibt bei einer Ausgabe den Betrag unverändert zurück', () => {
    expect(monthlyRate({ kind: 'expense', amount: 50 })).toBe(50);
  });

  it('ignoriert einen Turnus an einer Ausgabe', () => {
    expect(monthlyRate({ kind: 'expense', amount: 1200, turnus: 12 })).toBe(1200);
  });

  it('gibt bei einem Transfer ohne Turnus den Betrag unverändert zurück', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 200 })).toBe(200);
  });

  it('teilt den Zyklusbetrag auf die Monate auf', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 1200, turnus: 12 })).toBe(100);
    expect(monthlyRate({ kind: 'transfer', amount: 600, turnus: 6 })).toBe(100);
  });

  it('rundet auf zwei Nachkommastellen (D5: einzige Rundungsstelle)', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 1000, turnus: 12 })).toBe(83.33);
    expect(monthlyRate({ kind: 'transfer', amount: 100, turnus: 3 })).toBe(33.33);
  });

  it('akzeptiert einen Draft aus dem Dialog (plain object)', () => {
    expect(monthlyRate({ kind: 'transfer', amount: 1200, turnus: 12 })).toBe(100);
  });

  it('liefert 0 bei fehlendem oder unbrauchbarem Betrag', () => {
    expect(monthlyRate({ kind: 'transfer', turnus: 12 })).toBe(0);
    expect(monthlyRate({ kind: 'transfer', amount: NaN, turnus: 12 })).toBe(0);
    expect(monthlyRate(undefined)).toBe(0);
  });
});

describe('annualAmount', () => {
  it('entspricht amount * 12 ohne Turnus', () => {
    expect(annualAmount({ kind: 'expense', amount: 50 })).toBe(600);
    expect(annualAmount({ kind: 'transfer', amount: 200 })).toBe(2400);
  });

  it('gibt bei einer Jahresrechnung den Zyklusbetrag zurück', () => {
    expect(annualAmount({ kind: 'transfer', amount: 1200, turnus: 12 })).toBe(1200);
  });

  it('zeigt bei krummen Raten die zwölf gerundeten Raten (D4: 999.96, nicht 1000)', () => {
    expect(annualAmount({ kind: 'transfer', amount: 1000, turnus: 12 })).toBeCloseTo(999.96, 2);
  });
});

describe('isSinkingFund', () => {
  it('ist wahr für einen Transfer mit Turnus', () => {
    expect(isSinkingFund({ kind: 'transfer', turnus: 12 })).toBe(true);
    expect(isSinkingFund({ kind: 'transfer', turnus: 1 })).toBe(true);
  });

  it('ist falsch für einen Transfer ohne Turnus (freies Sparen)', () => {
    expect(isSinkingFund({ kind: 'transfer', turnus: null })).toBe(false);
    expect(isSinkingFund({ kind: 'transfer' })).toBe(false);
  });

  it('ist falsch für eine Ausgabe, auch mit Turnus', () => {
    expect(isSinkingFund({ kind: 'expense', turnus: 12 })).toBe(false);
  });

  it('ist falsch ohne Item', () => {
    expect(isSinkingFund(undefined)).toBe(false);
  });
});

// ── Zyklusrechnung ───────────────────────────────────────────────────────

/** Rücklage: Steuern, jährlich, 600, nächste Rechnung am 15.03.2027. */
const STEUERN = {
  id: 'fc-steuern',
  kind: 'transfer',
  name: 'Steuern',
  amount: 600,
  turnus: 12,
  faelligkeit: '2027-03-15',
  potId: 'reserve',
  transferCategory: 'Steuern',
};

function withdrawal(date, amount, over = {}) {
  return { kind: 'withdrawal', date, amount, potId: 'reserve', category: 'Steuern', ...over };
}

function transfer(date, amount, over = {}) {
  return { kind: 'transfer', date, amount, potId: 'reserve', category: 'Steuern', ...over };
}

describe('cycleAnchor', () => {
  it('liefert null für eine Position ohne Turnus', () => {
    expect(cycleAnchor({ kind: 'transfer', potId: 'reserve' }, [])).toBeNull();
    expect(cycleAnchor({ kind: 'expense', amount: 50, turnus: 12 }, [])).toBeNull();
  });

  it('rechnet ohne Entnahme aus der Fälligkeit zurück (Mitteneinstieg)', () => {
    const anchor = cycleAnchor(STEUERN, []);
    expect(anchor).toEqual({
      cycleStart: '2026-03-15',
      nextDue: '2027-03-15',
      lastPayment: null,
      anchorSource: 'faelligkeit',
    });
  });

  it('verankert den Zyklus an der Entnahme, sobald es eine gibt', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 600)]);
    expect(anchor).toEqual({
      cycleStart: '2026-05-10',
      nextDue: '2027-05-10',
      lastPayment: '2026-05-10',
      anchorSource: 'withdrawal',
    });
  });

  it('kennt keinen Schwellenwert: jede Entnahme setzt den Zyklus zurück', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 5)]);
    expect(anchor.cycleStart).toBe('2026-05-10');
    expect(anchor.anchorSource).toBe('withdrawal');
  });

  it('nimmt bei mehreren Entnahmen die jüngste', () => {
    const anchor = cycleAnchor(STEUERN, [
      withdrawal('2024-05-10', 600),
      withdrawal('2026-05-10', 600),
      withdrawal('2025-05-10', 600),
    ]);
    expect(anchor.cycleStart).toBe('2026-05-10');
  });

  it('ignoriert einen anderen Zweck im selben Topf', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 600, { category: 'Versicherung' })]);
    expect(anchor.anchorSource).toBe('faelligkeit');
    expect(anchor.lastPayment).toBeNull();
  });

  it('ignoriert denselben Zweck in einem anderen Topf', () => {
    const anchor = cycleAnchor(STEUERN, [withdrawal('2026-05-10', 600, { potId: 'surplus' })]);
    expect(anchor.anchorSource).toBe('faelligkeit');
  });

  it('ignoriert Einzahlungen — nur Entnahmen sind Zahlungen', () => {
    const anchor = cycleAnchor(STEUERN, [transfer('2026-05-10', 50)]);
    expect(anchor.anchorSource).toBe('faelligkeit');
  });

  it('klemmt den Tag am Monatsende', () => {
    const item = { ...STEUERN, turnus: 1, faelligkeit: '2027-03-31' };
    expect(cycleAnchor(item, []).cycleStart).toBe('2027-02-28');
  });

  it('liefert null, wenn weder Entnahme noch Fälligkeit einen Anker geben', () => {
    expect(cycleAnchor({ ...STEUERN, faelligkeit: null }, [])).toBeNull();
  });
});

describe('sinkingFundStatus', () => {
  const opts = (over = {}) => ({ monthStartDay: 1, today: '2026-05-20', ...over });

  it('zählt Finanzmonate ab dem Zyklusbeginn, der Zahlungsmonat zählt als 0', () => {
    // Mitteneinstieg: cycleStart 2026-03-15, zwei volle Monate bis Mai
    const s = sinkingFundStatus(STEUERN, [], opts());
    expect(s.isSinkingFund).toBe(true);
    expect(s.cycleStart).toBe('2026-03-15');
    expect(s.elapsed).toBe(2);
    expect(s.monthlyRate).toBe(50);
    expect(s.target).toBe(100);
  });

  it('liefert im Zahlungsmonat selbst elapsed 0 und Soll 0', () => {
    const s = sinkingFundStatus(STEUERN, [withdrawal('2026-05-10', 600)], opts());
    expect(s.elapsed).toBe(0);
    expect(s.target).toBe(0);
    expect(s.anchorSource).toBe('withdrawal');
  });

  it('deckelt elapsed und target bei einer überfälligen Position', () => {
    // cycleStart 14 Finanzmonate vor today
    const s = sinkingFundStatus(STEUERN, [withdrawal('2025-03-15', 600)], opts());
    expect(s.elapsed).toBe(12);
    expect(s.target).toBe(600);
    expect(s.status).toBe('overdue');
  });

  it('ist fällig, sobald der Zyklus durch ist', () => {
    const s = sinkingFundStatus(STEUERN, [], opts({ today: '2027-03-20' }));
    expect(s.elapsed).toBe(12);
    expect(s.nextDue).toBe('2027-03-15');
    expect(s.status).toBe('due');
  });

  it('wird erst einen Monat nach der Fälligkeit überfällig', () => {
    expect(sinkingFundStatus(STEUERN, [], opts({ today: '2027-04-14' })).status).toBe('due');
    expect(sinkingFundStatus(STEUERN, [], opts({ today: '2027-04-15' })).status).toBe('overdue');
  });

  it('verschiebt elapsed mit dem monthStartDay', () => {
    // monthStartDay 24: der 20. gehört noch in den Vormonat, der 25. schon in den nächsten
    const vorher = { ...STEUERN, faelligkeit: '2027-05-20' }; // cycleStart 2026-05-20 → FM 2026-05
    const nachher = { ...STEUERN, faelligkeit: '2027-05-25' }; // cycleStart 2026-05-25 → FM 2026-06
    const o = { monthStartDay: 24, today: '2026-08-10' }; // FM 2026-08
    expect(sinkingFundStatus(vorher, [], o).elapsed).toBe(3);
    expect(sinkingFundStatus(nachher, [], o).elapsed).toBe(2);
  });

  it('meldet freies Sparen ohne Turnus — ohne Soll-Stand und ohne Fälligkeit', () => {
    const frei = { ...STEUERN, turnus: null, faelligkeit: null, amount: 50 };
    const s = sinkingFundStatus(frei, [transfer('2026-04-01', 50)], opts());
    expect(s.isSinkingFund).toBe(false);
    expect(s.status).toBe('free');
    expect(s.target).toBeNull();
    expect(s.coverage).toBeNull();
    expect(s.nextDue).toBeNull();
    expect(s.actual).toBe(50);
  });

  it('rechnet den Ist-Stand netto über den Zweck, nicht über den Topf', () => {
    const s = sinkingFundStatus(STEUERN, [
      transfer('2026-04-01', 50),
      transfer('2026-05-01', 50),
      transfer('2026-05-01', 999, { category: 'Versicherung' }), // anderer Zweck
      transfer('2026-05-01', 999, { potId: 'surplus' }), // anderer Topf
      withdrawal('2026-05-02', 20),
    ], opts());
    expect(s.actual).toBe(80);
    // Die Entnahme ist zugleich der neue Zyklusanker — der Soll-Stand startet
    // damit bei 0 und die 80 stehen als Überdeckung im neuen Zyklus.
    expect(s.cycleStart).toBe('2026-05-02');
    expect(s.elapsed).toBe(0);
    expect(s.delta).toBe(80);
  });

  it('bewertet Rundungsreste innerhalb der Toleranz nicht als Rückstand', () => {
    // 1000 auf 12 Monate → Rate 83.33, zwölf Raten = 999.96 gegen Soll 999.96
    const item = { ...STEUERN, amount: 1000, faelligkeit: '2027-03-15' };
    const raten = Array.from({ length: 12 }, (_, i) =>
      transfer(addMonthsISO('2026-04-01', i), 83.33));
    const s = sinkingFundStatus(item, raten, opts({ today: '2027-03-01' }));
    expect(s.elapsed).toBe(12);
    expect(s.tolerance).toBeCloseTo(0.12, 10);
    expect(s.delta).toBeCloseTo(0, 6);
    expect(s.status).toBe('onTrack');
  });

  it('trennt onTrack und behind an der Toleranzgrenze', () => {
    const item = { ...STEUERN, amount: 1000 };
    // Soll nach 12 Monaten: 83.33 × 12 = 999.96
    const knapp = sinkingFundStatus(item, [transfer('2026-04-01', 999.86)], opts({ today: '2027-03-01' }));
    expect(knapp.delta).toBeCloseTo(-0.1, 6);
    expect(knapp.status).toBe('onTrack');
    const drunter = sinkingFundStatus(item, [transfer('2026-04-01', 999.81)], opts({ today: '2027-03-01' }));
    expect(drunter.delta).toBeCloseTo(-0.15, 6);
    expect(drunter.status).toBe('behind');
  });

  it('behandelt einen Restbetrag aus dem Vorzyklus als Überdeckung, nicht als Fehler', () => {
    const s = sinkingFundStatus(STEUERN, [transfer('2026-04-01', 150)], opts());
    expect(s.target).toBe(100);
    expect(s.delta).toBe(50);
    expect(s.coverage).toBe(1.5);
    expect(s.status).toBe('onTrack');
  });

  it('rechnet coverage gegen die übergebene Soll-Summe eines geteilten Zwecks', () => {
    const s = sinkingFundStatus(STEUERN, [transfer('2026-04-01', 150)], opts({ targetSum: 300 }));
    expect(s.target).toBe(100);
    expect(s.coverage).toBe(0.5);
  });

  it('liefert coverage null, solange der Soll-Stand 0 ist', () => {
    const s = sinkingFundStatus(STEUERN, [], opts({ today: '2026-03-20' }));
    expect(s.elapsed).toBe(0);
    expect(s.coverage).toBeNull();
    expect(s.progress).toBe(0);
  });
});

describe('buildSinkingFundRows', () => {
  const opts = { monthStartDay: 1, today: '2026-05-20' };

  // Zwei Positionen auf demselben Zweck: Soll 100 und 200 bei gemeinsamem Ist 150
  const klein = { ...STEUERN, id: 'fc-klein', name: 'Steuern Bund', amount: 600 };
  const gross = { ...STEUERN, id: 'fc-gross', name: 'Steuern Kanton', amount: 1200 };
  const gemeinsam = [transfer('2026-04-01', 150)];

  it('rechnet den Deckungsgrad gegen die Soll-Summe des geteilten Zwecks', () => {
    const rows = buildSinkingFundRows([klein, gross], gemeinsam, opts);
    expect(rows.map((r) => r.target)).toEqual([100, 200]);
    // Ohne Auflösung läse jede Zeile 150 gegen ihr eigenes Soll: 150 % bzw. 75 %
    expect(rows[0].coverage).toBe(0.5);
    expect(rows[1].coverage).toBe(0.5);
  });

  it('markiert beide Zeilen als geteilt und zählt die anderen Positionen', () => {
    const rows = buildSinkingFundRows([klein, gross], gemeinsam, opts);
    expect(rows.every((r) => r.sharedPurpose)).toBe(true);
    expect(rows.map((r) => r.sharedWith)).toEqual([1, 1]);
  });

  it('lässt eine Einzelposition unmarkiert', () => {
    const allein = { ...STEUERN, transferCategory: 'Versicherung' };
    const rows = buildSinkingFundRows([klein, allein], gemeinsam, opts);
    expect(rows[1].sharedPurpose).toBe(false);
    expect(rows[1].sharedWith).toBe(0);
  });

  it('behält je Zeile den eigenen Zyklus', () => {
    // Nur die zweite Position hat eine Entnahme — sie verankert deren Zyklus neu.
    const anders = { ...gross, potId: 'surplus' };
    const rows = buildSinkingFundRows([klein, anders], [
      ...gemeinsam,
      withdrawal('2026-05-10', 1200, { potId: 'surplus' }),
    ], opts);
    expect(rows[0].cycleStart).toBe('2026-03-15');
    expect(rows[0].nextDue).toBe('2027-03-15');
    expect(rows[1].cycleStart).toBe('2026-05-10');
    expect(rows[1].nextDue).toBe('2027-05-10');
  });

  it('trennt Zwecke gleichen Namens in verschiedenen Töpfen', () => {
    const anderesTopf = { ...gross, potId: 'surplus' };
    const rows = buildSinkingFundRows([klein, anderesTopf], gemeinsam, opts);
    expect(rows.every((r) => r.sharedPurpose === false)).toBe(true);
    expect(rows[0].coverage).toBe(1.5);
    expect(rows[1].coverage).toBe(0);
  });

  it('zählt freies Sparen nicht in die Soll-Summe und markiert es nicht', () => {
    const frei = { ...STEUERN, id: 'fc-frei', turnus: null, faelligkeit: null, amount: 50 };
    const rows = buildSinkingFundRows([klein, frei], gemeinsam, opts);
    expect(rows[0].sharedPurpose).toBe(false);
    expect(rows[0].coverage).toBe(1.5); // 150 / 100, unbeeinflusst von der freien Position
    expect(rows[1].status).toBe('free');
    expect(rows[1].sharedWith).toBe(0);
  });

  it('reicht das Item für die Anzeige mit durch', () => {
    const rows = buildSinkingFundRows([klein], gemeinsam, opts);
    expect(rows[0].item).toBe(klein);
  });

  it('kommt mit einer leeren oder fehlenden Liste zurecht', () => {
    expect(buildSinkingFundRows([], [], opts)).toEqual([]);
    expect(buildSinkingFundRows(undefined, [], opts)).toEqual([]);
  });
});

describe('buildCatchUpRates', () => {
  it('erzeugt eine Rate je Finanzmonat nach dem Zyklusbeginn', () => {
    const rates = buildCatchUpRates(STEUERN, {
      cycleStart: '2026-03-15',
      monthStartDay: 1,
      today: '2026-05-20',
    });
    expect(rates).toEqual([
      { ym: '2026-04', date: '2026-04-01', amount: 50 },
      { ym: '2026-05', date: '2026-05-01', amount: 50 },
    ]);
  });

  it('liefert nichts, solange der Zyklus im laufenden Finanzmonat begann', () => {
    expect(buildCatchUpRates(STEUERN, {
      cycleStart: '2026-05-02',
      monthStartDay: 1,
      today: '2026-05-20',
    })).toEqual([]);
  });

  it('datiert auf den ersten Tag des Finanzmonats — auch bei verschobenem Monatsbeginn', () => {
    const rates = buildCatchUpRates(STEUERN, {
      cycleStart: '2026-03-15',
      monthStartDay: 24,
      today: '2026-05-20',
    });
    // FM des cycleStart ist 2026-03 (15. < 24.), today liegt im FM 2026-05
    expect(rates).toEqual([
      { ym: '2026-04', date: '2026-03-24', amount: 50 },
      { ym: '2026-05', date: '2026-04-24', amount: 50 },
    ]);
  });

  it('deckelt NICHT auf den Turnus — überfällige Position (D1)', () => {
    const item = { ...STEUERN, amount: 1200 };
    const rates = buildCatchUpRates(item, {
      cycleStart: '2025-03-15',
      monthStartDay: 1,
      today: '2026-05-20',
    });
    expect(rates).toHaveLength(14);
    expect(rates[0]).toEqual({ ym: '2025-04', date: '2025-04-01', amount: 100 });
    expect(rates[13]).toEqual({ ym: '2026-05', date: '2026-05-01', amount: 100 });
    // Bewusst über dem Soll-Stand: target ist auf 1200 gedeckelt, die Summe nicht.
    expect(rates.reduce((sum, r) => sum + r.amount, 0)).toBe(1400);
  });

  it('läuft über den Jahreswechsel', () => {
    const rates = buildCatchUpRates(STEUERN, {
      cycleStart: '2026-11-15',
      monthStartDay: 1,
      today: '2027-02-10',
    });
    expect(rates.map((r) => r.ym)).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  it('liefert nichts ohne Turnus, ohne cycleStart oder bei künftigem Zyklusbeginn', () => {
    const frei = { ...STEUERN, turnus: null, faelligkeit: null };
    expect(buildCatchUpRates(frei, { cycleStart: '2026-03-15', today: '2026-05-20' })).toEqual([]);
    expect(buildCatchUpRates(STEUERN, { today: '2026-05-20' })).toEqual([]);
    expect(buildCatchUpRates(STEUERN, { cycleStart: '2026-09-15', today: '2026-05-20' })).toEqual([]);
  });
});
