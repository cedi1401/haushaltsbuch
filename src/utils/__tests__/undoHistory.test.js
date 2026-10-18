import { describe, it, expect } from 'vitest';
import {
  createHistory,
  recordChange,
  undo,
  redo,
  diffBooks,
  UNDO_LIMIT,
  MERGE_WINDOW_MS,
} from '../undoHistory.js';

const bookA = { id: 'a', entries: [] };
const bookB = { id: 'b', entries: [] };

function change(before, after, overrides = {}) {
  return {
    before,
    after,
    label: null,
    at: 10_000,
    ...overrides,
  };
}

describe('diffBooks', () => {
  it('meldet nichts bei gleichen Referenzen in neuem Array', () => {
    expect(diffBooks([bookA, bookB], [bookA, bookB])).toEqual({ structural: false, changed: [] });
  });

  it('nennt die Bücher mit geändertem Inhalt', () => {
    const b2 = { ...bookB, name: 'x' };
    const res = diffBooks([bookA, bookB], [bookA, b2]);
    expect(res.structural).toBe(false);
    expect(res.changed).toEqual([{ before: bookB, after: b2 }]);
  });

  it('erkennt Anlegen, Löschen und Umsortieren als Listen-Änderung', () => {
    expect(diffBooks([bookA], [bookA, bookB]).structural).toBe(true);
    expect(diffBooks([bookA, bookB], [bookA]).structural).toBe(true);
    expect(diffBooks([bookA, bookB], [bookB, bookA]).structural).toBe(true);
  });
});

describe('recordChange', () => {
  it('ignoriert Änderungen ohne Wirkung', () => {
    const h = createHistory();
    const { history, step } = recordChange(h, change(bookA, bookA));
    expect(step).toBeNull();
    expect(history).toBe(h);
  });

  it('legt einen Schritt an und verwirft future', () => {
    const a2 = { ...bookA, name: 'x' };
    let h = recordChange(createHistory(), change(bookA, a2)).history;
    h = undo(h).history;
    expect(h.future).toHaveLength(1);
    const a3 = { ...bookA, name: 'y' };
    const res = recordChange(h, change(bookA, a3, { at: 50_000 }));
    expect(res.history.past).toHaveLength(1);
    expect(res.history.future).toHaveLength(0);
    expect(res.step.after).toBe(a3);
  });

  it('verschmilzt schnelle unbeschriftete Änderungen am selben Buch', () => {
    const a2 = { ...bookA, name: 'x' };
    const a3 = { ...bookA, name: 'xy' };
    let h = recordChange(createHistory(), change(bookA, a2)).history;
    h = recordChange(h, change(a2, a3, { at: 10_000 + MERGE_WINDOW_MS })).history;
    expect(h.past).toHaveLength(1);
    expect(h.past[0].before).toBe(bookA);
    expect(h.past[0].after).toBe(a3);
  });

  it('verschmilzt nicht nach Pause oder mit Text', () => {
    const a2 = { ...bookA, name: 'x' };
    const a3 = { ...bookA, name: 'xy' };
    const base = recordChange(createHistory(), change(bookA, a2)).history;

    const late = recordChange(base, change(a2, a3, { at: 10_000 + MERGE_WINDOW_MS + 1 }));
    expect(late.history.past).toHaveLength(2);

    const labeled = recordChange(base, change(a2, a3, { at: 10_100, label: 'Buchung gelöscht.' }));
    expect(labeled.history.past).toHaveLength(2);
  });

  it('verschmilzt nicht mit einem beschrifteten Schritt', () => {
    const a2 = { ...bookA, name: 'x' };
    const a3 = { ...bookA, name: 'xy' };
    let h = recordChange(createHistory(), change(bookA, a2, { label: 'Gelöscht.' })).history;
    h = recordChange(h, change(a2, a3, { at: 10_100 })).history;
    expect(h.past).toHaveLength(2);
  });

  it('begrenzt den Verlauf auf UNDO_LIMIT Schritte', () => {
    let h = createHistory();
    let book = bookA;
    for (let i = 0; i < UNDO_LIMIT + 5; i++) {
      const next = { ...bookA, n: i };
      h = recordChange(h, change(book, next, { at: i * 10 * MERGE_WINDOW_MS })).history;
      book = next;
    }
    expect(h.past).toHaveLength(UNDO_LIMIT);
    expect(h.past[UNDO_LIMIT - 1].after).toBe(book);
  });
});

describe('undo / redo', () => {
  it('liefert null bei leerem Verlauf', () => {
    const h = createHistory();
    expect(undo(h).step).toBeNull();
    expect(redo(h).step).toBeNull();
  });

  it('nimmt zurück und stellt wieder her', () => {
    const before = bookA;
    const after = { ...bookA, name: 'x' };
    let h = recordChange(createHistory(), change(before, after, { label: 'Umbenannt.' })).history;

    const u = undo(h);
    expect(u.step.before).toBe(before);
    expect(u.history.past).toHaveLength(0);
    h = u.history;

    const r = redo(h);
    expect(r.step.after).toBe(after);
    expect(r.history.past).toHaveLength(1);
    expect(r.history.future).toHaveLength(0);
  });

  it('arbeitet mehrere Schritte in umgekehrter Reihenfolge ab', () => {
    const s1 = { ...bookA, n: 1 };
    const s2 = { ...bookA, n: 2 };
    let h = recordChange(createHistory(), change(bookA, s1, { label: 'eins' })).history;
    h = recordChange(h, change(s1, s2, { label: 'zwei' })).history;

    const u1 = undo(h);
    expect(u1.step.label).toBe('zwei');
    const u2 = undo(u1.history);
    expect(u2.step.label).toBe('eins');
    expect(u2.step.before).toBe(bookA);
    const r1 = redo(u2.history);
    expect(r1.step.label).toBe('eins');
  });
});
