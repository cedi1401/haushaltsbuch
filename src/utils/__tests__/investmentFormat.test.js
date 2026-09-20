import { describe, it, expect } from 'vitest';
import {
  formatFetchedAt,
  formatPercent,
  formatQuantity,
  formatQuotePrice,
  gainClass,
} from '../investmentFormat.js';

// Intl formatiert de-CH mit schmalem Apostroph als Tausendertrenner und Punkt
// als Dezimaltrenner. Die Tests prüfen die Stellenzahl, nicht die Trennzeichen.
const digitsOnly = (s) => s.replace(/[^\d,.]/g, '');

describe('formatQuantity', () => {
  it('lässt glatte Stückzahlen ohne Nachkommastellen', () => {
    expect(formatQuantity(3, 'pcs')).toBe('3 Stk');
  });

  it('zeigt bei Feinunzen bis zu vier Nachkommastellen', () => {
    expect(formatQuantity(3.858091, 'oz')).toBe('3.8581 oz');
  });

  it('kennt Gramm', () => {
    expect(formatQuantity(120, 'g')).toBe('120 g');
  });

  it('fällt bei unbekannter Einheit auf Stück zurück', () => {
    expect(formatQuantity(2, 'kg')).toBe('2 Stk');
  });

  it('meldet unbrauchbare Mengen als Strich', () => {
    expect(formatQuantity(null)).toBe('—');
    expect(formatQuantity(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('setzt bei Gewinn ein Plus', () => {
    expect(formatPercent(12.34)).toBe('+12.3 %');
  });

  it('lässt das Minus stehen', () => {
    expect(formatPercent(-4.5)).toBe('-4.5 %');
  });

  it('unterscheidet null von 0 %', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0)).toBe('0.0 %');
  });

  it('kann das Vorzeichen weglassen und die Stellen ändern', () => {
    expect(formatPercent(51.234, { digits: 0, sign: false })).toBe('51 %');
  });
});

describe('formatQuotePrice', () => {
  it('zeigt zwei Stellen ab 1 und vier darunter', () => {
    expect(digitsOnly(formatQuotePrice(112.4, 'CHF'))).toBe('112.40');
    expect(digitsOnly(formatQuotePrice(0.0842, 'USD'))).toBe('0.0842');
  });

  it('hängt die Handelswährung an', () => {
    expect(formatQuotePrice(112.4, 'USD').endsWith('USD')).toBe(true);
    expect(formatQuotePrice(112.4, '')).not.toContain('USD');
  });

  it('meldet fehlende Kurse als Strich', () => {
    expect(formatQuotePrice(null, 'CHF')).toBe('—');
  });
});

describe('formatFetchedAt', () => {
  const now = new Date('2026-09-20T15:00:00');

  it('zeigt am selben Tag nur die Uhrzeit', () => {
    const out = formatFetchedAt('2026-09-20T09:30:00', now);
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });

  it('zeigt an älteren Tagen zusätzlich das Datum', () => {
    const out = formatFetchedAt('2026-09-18T09:30:00', now);
    expect(out).toContain('18.09.2026');
    expect(out).toMatch(/\d{2}:\d{2}$/);
  });

  it('meldet fehlende oder kaputte Zeitstempel als Strich', () => {
    expect(formatFetchedAt(null)).toBe('—');
    expect(formatFetchedAt('keinDatum')).toBe('—');
  });
});

describe('gainClass', () => {
  it('ordnet Gewinn, Verlust und Null zu', () => {
    expect(gainClass(5)).toBe('hb-ok');
    expect(gainClass(-5)).toBe('hb-bad');
    expect(gainClass(0)).toBe('');
  });

  it('bleibt bei unbekanntem Wert neutral', () => {
    expect(gainClass(null)).toBe('hb-muted');
  });
});
