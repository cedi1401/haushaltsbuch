// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

describe('storage (Electron path) — saveBooks', () => {
  const b1 = { id: 'b1', name: 'Haushalt' };
  const b2 = { id: 'b2', name: 'Ferien' };
  let syncBooks;

  beforeEach(() => {
    syncBooks = vi.fn().mockResolvedValue(true);
    window.electronAPI = { isElectron: true, syncBooks };
  });

  afterEach(() => {
    delete window.electronAPI;
  });

  it('sends every book on the first save', async () => {
    const { saveBooks } = await importStorage();
    await saveBooks([b1, b2]);
    expect(syncBooks).toHaveBeenCalledWith({ upserts: [b1, b2], order: ['b1', 'b2'] });
  });

  it('sends only the changed book afterwards', async () => {
    const { saveBooks } = await importStorage();
    await saveBooks([b1, b2]);
    const b2Edited = { ...b2, name: 'Ferien 2027' };
    await saveBooks([b1, b2Edited]);
    expect(syncBooks).toHaveBeenLastCalledWith({ upserts: [b2Edited], order: ['b1', 'b2'] });
  });

  it('skips the IPC call when nothing changed', async () => {
    const { saveBooks } = await importStorage();
    const books = [b1, b2];
    await saveBooks(books);
    await expect(saveBooks([b1, b2])).resolves.toBe(true);
    expect(syncBooks).toHaveBeenCalledTimes(1);
  });

  it('sends everything again after a failed save', async () => {
    const { saveBooks } = await importStorage();
    await saveBooks([b1, b2]);
    syncBooks.mockResolvedValueOnce(false);
    const b1Edited = { ...b1, name: 'Neu' };
    await expect(saveBooks([b1Edited, b2])).resolves.toBe(false);
    await saveBooks([b1Edited, b2]);
    expect(syncBooks).toHaveBeenLastCalledWith({ upserts: [b1Edited, b2], order: ['b1', 'b2'] });
  });

  it('sends everything again after a rejected save', async () => {
    const { saveBooks } = await importStorage();
    await saveBooks([b1]);
    syncBooks.mockRejectedValueOnce(new Error('IPC weg'));
    const b1Edited = { ...b1, name: 'Neu' };
    await expect(saveBooks([b1Edited])).rejects.toThrow('IPC weg');
    await saveBooks([b1Edited, b2]);
    expect(syncBooks).toHaveBeenLastCalledWith({ upserts: [b1Edited, b2], order: ['b1', 'b2'] });
  });
});
