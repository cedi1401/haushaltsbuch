import { describe, it, expect } from 'vitest';
import { diffBooks, isEmptyDiff } from '../bookSync.js';

const b1 = { id: 'b1', name: 'Haushalt' };
const b2 = { id: 'b2', name: 'Ferien' };

describe('diffBooks', () => {
  it('writes every book when the previous state is unknown', () => {
    expect(diffBooks(null, [b1, b2])).toEqual({ upserts: [b1, b2], order: ['b1', 'b2'] });
  });

  it('writes only the book whose reference changed', () => {
    const b1Edited = { ...b1, name: 'Haushalt 2026' };
    const diff = diffBooks([b1, b2], [b1Edited, b2]);
    expect(diff.upserts).toEqual([b1Edited]);
    expect(diff.order).toEqual(['b1', 'b2']);
  });

  it('writes a newly added book', () => {
    expect(diffBooks([b1], [b1, b2]).upserts).toEqual([b2]);
  });

  it('drops a deleted book from order without upserts', () => {
    expect(diffBooks([b1, b2], [b1])).toEqual({ upserts: [], order: ['b1'] });
  });
});

describe('isEmptyDiff', () => {
  it('is true when nothing changed', () => {
    const prev = [b1, b2];
    expect(isEmptyDiff(prev, diffBooks(prev, [b1, b2]))).toBe(true);
  });

  it('is false when the order changed', () => {
    expect(isEmptyDiff([b1, b2], diffBooks([b1, b2], [b2, b1]))).toBe(false);
  });

  it('is false when a book was deleted', () => {
    expect(isEmptyDiff([b1, b2], diffBooks([b1, b2], [b1]))).toBe(false);
  });

  it('is false when the previous state is unknown', () => {
    expect(isEmptyDiff(null, diffBooks(null, [b1]))).toBe(false);
  });
});
