import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  formatSigned,
} from '../formatUtils.js';
import { shortMonthTick } from '../chartStyle.js';

// ─── formatCurrency ────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('puts a real minus sign before the currency affix', () => {
    expect(formatCurrency(-65, 'CHF')).toBe(`−${formatCurrency(65, 'CHF')}`);
    expect(formatCurrency(-65, 'EUR')).toBe('−65,00 €');
    expect(formatCurrency(-65, 'USD')).toBe('−$65.00');
  });

  it('leaves positive amounts and zero unsigned', () => {
    expect(formatCurrency(65, 'USD')).toBe('$65.00');
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
    expect(formatCurrency(-0, 'USD')).toBe('$0.00');
  });
});

// ─── formatSigned ──────────────────────────────────────────────────────────

describe('formatSigned', () => {
  const fmt = (n) => formatCurrency(n, 'USD');

  it('adds a plus to positive amounts and keeps the real minus', () => {
    expect(formatSigned(fmt, 65)).toBe('+$65.00');
    expect(formatSigned(fmt, -65)).toBe('−$65.00');
  });

  it('leaves amounts that round to zero unsigned', () => {
    expect(formatSigned(fmt, 0)).toBe('$0.00');
    expect(formatSigned(fmt, 0.004)).toBe('$0.00');
    expect(formatSigned(fmt, -0.004)).toBe('$0.00');
    expect(formatSigned(fmt, null)).toBe('$0.00');
  });
});

// ─── formatPercent ─────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('adds a plus to positive values', () => {
    expect(formatPercent(12.34)).toBe('+12.3 %');
  });

  it('uses a real minus sign', () => {
    expect(formatPercent(-4.5)).toBe('−4.5 %');
    expect(formatPercent(-4.5, { sign: false })).toBe('−4.5 %');
  });

  it('distinguishes null from 0 %', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0)).toBe('0.0 %');
  });

  it('leaves values that round to zero unsigned', () => {
    expect(formatPercent(0.04)).toBe('0.0 %');
    expect(formatPercent(-0.04)).toBe('0.0 %');
    expect(formatPercent(-0.4, { digits: 0 })).toBe('0 %');
  });

  it('can drop the sign and change the digits', () => {
    expect(formatPercent(51.234, { digits: 0, sign: false })).toBe('51 %');
  });
});

// ─── formatCurrencyCompact ─────────────────────────────────────────────────

describe('formatCurrencyCompact', () => {
  it('shortens thousands and millions and drops a trailing .0', () => {
    expect(formatCurrencyCompact(500, 'CHF')).toBe('CHF 500');
    expect(formatCurrencyCompact(7000, 'CHF')).toBe('CHF 7k');
    expect(formatCurrencyCompact(7500, 'CHF')).toBe('CHF 7.5k');
    expect(formatCurrencyCompact(1_200_000, 'CHF')).toBe('CHF 1.2M');
  });

  it('follows the affix placement of formatCurrency', () => {
    expect(formatCurrencyCompact(7000, 'EUR')).toBe('7k €');
    expect(formatCurrencyCompact(7000, 'USD')).toBe('$7k');
    expect(formatCurrencyCompact(7000, 'SEK')).toBe('SEK 7k');
  });

  it('puts a real minus sign before the currency affix', () => {
    expect(formatCurrencyCompact(-7000, 'CHF')).toBe('−CHF 7k');
    expect(formatCurrencyCompact(-7000, 'EUR')).toBe('−7k €');
  });
});

describe('shortMonthTick', () => {
  it('shortens the year of a month label and leaves other labels alone', () => {
    expect(shortMonthTick('Jan 2026')).toBe('Jan 26');
    expect(shortMonthTick('Mär')).toBe('Mär');
  });
});
