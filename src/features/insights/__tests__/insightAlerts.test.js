import { describe, it, expect } from 'vitest';
import { reservesAlert, reservesAlertText } from '../insightAlerts.js';

// Einfacher Formatierer: die Tests prüfen Reihenfolge und Text, nicht das Währungsformat.
const fmt = (n) => `#${n}`;

const row = (name, status, extra = {}) => ({ purpose: { name }, status, delta: 0, nextDate: '2026-11-01', ...extra });

describe('reservesAlert', () => {
  it('meldet rot bei Überfälligkeit, gelb bei Rückstand, sonst nichts', () => {
    expect(reservesAlert({ overdue: 1, behind: 2 })).toBe('error');
    expect(reservesAlert({ overdue: 0, behind: 2 })).toBe('warning');
    expect(reservesAlert({ overdue: 0, behind: 0, due: 3 })).toBeNull();
    expect(reservesAlert(undefined)).toBeNull();
  });
});

describe('reservesAlertText', () => {
  it('liefert null ohne überfällige oder rückständige Rückstellungen', () => {
    expect(reservesAlertText([row('Auto', 'due'), row('Strom', 'onTrack')], fmt)).toBeNull();
    expect(reservesAlertText([], fmt)).toBeNull();
    expect(reservesAlertText(undefined, fmt)).toBeNull();
  });

  it('nennt überfällige Rückstellungen nach Fälligkeit, ohne Betrag, rot', () => {
    const rows = [
      row('Versicherung', 'overdue', { nextDate: '2026-10-20' }),
      row('Steuern', 'overdue', { nextDate: '2026-09-30' }),
      row('Auto', 'behind', { delta: -100 }),
    ];
    expect(reservesAlertText(rows, fmt)).toEqual({
      title: '2 Rückstellungen überfällig',
      message: 'Steuern, Versicherung',
      tone: undefined,
    });
  });

  it('nennt Rückstand nach größter Lücke, mit Betrag, gelb', () => {
    const rows = [row('Strom', 'behind', { delta: -20 }), row('Auto', 'behind', { delta: -150 })];
    expect(reservesAlertText(rows, fmt)).toEqual({
      title: '2 Rückstellungen im Rückstand',
      message: 'Auto −#150, Strom −#20',
      tone: 'warning',
    });
  });

  it('nennt höchstens drei Namen und zählt den Rest, Einzahl im Titel', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((n, i) => row(n, 'overdue', { nextDate: `2026-10-0${i + 1}` }));
    expect(reservesAlertText(many, fmt).message).toBe('A, B, C und 2 weitere');
    expect(reservesAlertText([row('', 'overdue')], fmt)).toMatchObject({
      title: '1 Rückstellung überfällig',
      message: 'Ohne Namen',
    });
  });
});
