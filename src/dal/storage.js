// Data Access Layer — abstracts storage between Electron (SQLite) and Browser (localStorage).
// The React app calls these functions; they route to the right backend automatically.

import { formatFileStamp } from "../utils/hbUtils.js";

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

// --- Books ---

export async function loadBooks() {
  if (isElectron) {
    return window.electronAPI.getBooks();
  }
  const raw = localStorage.getItem('hb_books');
  const parsed = JSON.parse(raw || 'null');
  return Array.isArray(parsed) ? parsed : null;
}

export async function saveBooks(books) {
  if (isElectron) {
    return window.electronAPI.saveBooks(books);
  }
  localStorage.setItem('hb_books', JSON.stringify(books));
}

// --- Settings (key-value) ---

export async function getSetting(key) {
  if (isElectron) {
    return window.electronAPI.getSetting(key);
  }
  return localStorage.getItem(`hb_${key}`);
}

export async function setSetting(key, value) {
  if (isElectron) {
    return window.electronAPI.setSetting(key, value);
  }
  localStorage.setItem(`hb_${key}`, value);
}

// --- Backup ---

export async function exportBackupFile({ book, monthFilter }) {
  const payload = {
    format: 'haushaltsbuch-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: [book],
    activeBookId: book?.id || null,
    monthFilter: typeof monthFilter === 'string' ? monthFilter : '',
  };

  if (isElectron) {
    return window.electronAPI.exportBackup(payload);
  }

  // Browser fallback: download via blob
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `haushaltsbuch-backup-${formatFileStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { canceled: false };
}

export async function importBackupFile() {
  if (isElectron) {
    return window.electronAPI.importBackup();
  }

  // Browser fallback: file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve({ canceled: true });
      const text = await file.text();
      try {
        resolve({ canceled: false, data: JSON.parse(text) });
      } catch {
        resolve({ canceled: true, error: 'Ungültiges JSON' });
      }
    };
    input.click();
  });
}

export { isElectron };
