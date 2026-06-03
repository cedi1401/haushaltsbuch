// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// storage.js reads isElectron at module load time from window.electronAPI.
// In jsdom, window exists but window.electronAPI is undefined → browser path.
// We use vi.resetModules() + dynamic import to get a fresh module for each test.

async function importStorage() {
  vi.resetModules();
  return await import('../storage.js');
}

describe('storage (browser path)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Ensure no Electron API is present
    delete window.electronAPI;
  });

  describe('loadBooks', () => {
    it('returns null when localStorage is empty', async () => {
      const { loadBooks } = await importStorage();
      const result = await loadBooks();
      expect(result).toBeNull();
    });

    it('returns parsed array when localStorage has valid data', async () => {
      const books = [{ id: 'b1', name: 'Test' }];
      localStorage.setItem('hb_books', JSON.stringify(books));
      const { loadBooks } = await importStorage();
      const result = await loadBooks();
      expect(result).toEqual(books);
    });

    it('returns null for a non-array JSON value', async () => {
      localStorage.setItem('hb_books', JSON.stringify({ id: 'b1' }));
      const { loadBooks } = await importStorage();
      const result = await loadBooks();
      expect(result).toBeNull();
    });

    it('returns null for corrupt JSON without throwing', async () => {
      localStorage.setItem('hb_books', 'INVALID_JSON{{{');
      const { loadBooks } = await importStorage();
      await expect(loadBooks()).resolves.toBeNull();
    });
  });

  describe('saveBooks', () => {
    it('writes serialized books to localStorage', async () => {
      const books = [{ id: 'b1', name: 'Haushalt' }];
      const { saveBooks } = await importStorage();
      await saveBooks(books);
      expect(JSON.parse(localStorage.getItem('hb_books'))).toEqual(books);
    });

    it('overwrites previously saved books', async () => {
      const { saveBooks } = await importStorage();
      await saveBooks([{ id: 'b1' }]);
      await saveBooks([{ id: 'b2' }]);
      expect(JSON.parse(localStorage.getItem('hb_books'))).toEqual([{ id: 'b2' }]);
    });
  });

  describe('getSetting / setSetting', () => {
    it('returns null for unknown setting', async () => {
      const { getSetting } = await importStorage();
      expect(await getSetting('unknownKey')).toBeNull();
    });

    it('persists and retrieves a setting', async () => {
      const { getSetting, setSetting } = await importStorage();
      await setSetting('theme', 'dark');
      expect(await getSetting('theme')).toBe('dark');
    });
  });

  describe('createAutoBackup', () => {
    it('is a no-op in the browser (no error thrown)', async () => {
      const { createAutoBackup } = await importStorage();
      await expect(createAutoBackup([{ id: 'b1' }])).resolves.toBeUndefined();
    });
  });
});
