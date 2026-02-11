import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db = null;

export async function initDatabase() {
  const dbDir = app.getPath('userData');
  const dbPath = path.join(dbDir, 'haushaltsbuch.db');

  db = new Database(dbPath);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS books_store (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      data  TEXT NOT NULL DEFAULT '[]'
    );
  `);

  // Ensure the single row exists
  db.prepare(`INSERT OR IGNORE INTO books_store (id, data) VALUES (1, '[]')`).run();

  // Schema version for future migrations
  const version = db.prepare(`SELECT value FROM app_settings WHERE key = 'schema_version'`).get();
  if (!version) {
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('schema_version', '1')`).run();
  }

  return db;
}

export function getDb() {
  return {
    getBooks() {
      const row = db.prepare('SELECT data FROM books_store WHERE id = 1').get();
      if (!row || !row.data) return [];
      try {
        return JSON.parse(row.data);
      } catch {
        return [];
      }
    },

    saveBooks(books) {
      const json = JSON.stringify(books);
      db.prepare('UPDATE books_store SET data = ? WHERE id = 1').run(json);
    },

    getSetting(key) {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
      return row ? row.value : null;
    },

    setSetting(key, value) {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
    },
  };
}
