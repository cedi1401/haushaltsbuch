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

  // Kurs-Cache der entfernten Investment-Funktion (bis 18.10.2026). Reiner
  // Wegwerf-Cache, darum ersatzlos verworfen. Idempotent.
  db.exec('DROP TABLE IF EXISTS price_cache');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Eine Zeile pro Buch (seit Schema 2). data ist das JSON des ganzen Buchs,
    -- das Datenmodell im Frontend bleibt unverändert. name ist eine Kopie für
    -- Diagnose per SQL, gelesen wird nur data. position hält die Reihenfolge
    -- der Bücher im Dropdown.
    CREATE TABLE IF NOT EXISTS books (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  // Schema version for future migrations
  const version = db.prepare(`SELECT value FROM app_settings WHERE key = 'schema_version'`).get();
  if (!version) {
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('schema_version', '1')`).run();
  }

  migrateBooksStoreToRows(db);

  return db;
}

// Schema 1 → 2: Bis v3.17 lagen alle Bücher als EIN JSON-Array in books_store
// (id = 1). Die Übernahme in die Tabelle books läuft einmal, in einer
// Transaktion. Die alte Tabelle wird nicht gelöscht, sondern in
// books_store_legacy umbenannt — sie bleibt als Rückfallebene liegen und wird
// danach nirgends mehr gelesen.
function migrateBooksStoreToRows(connection) {
  const row = connection.prepare(`SELECT value FROM app_settings WHERE key = 'schema_version'`).get();
  if (Number(row?.value) >= 2) return;

  const hasLegacy = connection
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'books_store'`)
    .get();

  connection.transaction(() => {
    if (hasLegacy) {
      const legacy = connection.prepare('SELECT data FROM books_store WHERE id = 1').get();
      let books = [];
      try {
        books = JSON.parse(legacy?.data || '[]');
      } catch (err) {
        // Nicht abbrechen: Die Rohdaten bleiben in books_store_legacy erhalten.
        console.error('[db] Migration: books_store ist kein gültiges JSON — Rohdaten bleiben in books_store_legacy:', err.message);
      }
      if (Array.isArray(books)) {
        const insert = connection.prepare(
          `INSERT OR REPLACE INTO books (id, name, data, position, updated_at) VALUES (?, ?, ?, ?, ?)`
        );
        const now = new Date().toISOString();
        let migrated = 0;
        books.forEach((book, index) => {
          if (!book || typeof book.id !== 'string' || !book.id) {
            console.warn(`[db] Migration: Buch an Position ${index} ohne ID übersprungen (bleibt in books_store_legacy).`);
            return;
          }
          insert.run(book.id, String(book.name || ''), JSON.stringify(book), index, now);
          migrated += 1;
        });
        console.info(`[db] Migration: ${migrated} Buch/Bücher in die Tabelle books übernommen.`);
      }
      connection.exec('DROP TABLE IF EXISTS books_store_legacy');
      connection.exec('ALTER TABLE books_store RENAME TO books_store_legacy');
    }
    connection.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '2')`).run();
  })();
}

export function getDb() {
  return {
    getBooks() {
      const rows = db.prepare('SELECT id, data FROM books ORDER BY position, rowid').all();
      const books = [];
      for (const row of rows) {
        try {
          books.push(JSON.parse(row.data));
        } catch (err) {
          // Ein beschädigtes Buch kostet nicht mehr alle anderen.
          console.error(`[db] getBooks: Buch ${row.id} ist kein gültiges JSON und wird übersprungen:`, err.message);
        }
      }
      return books;
    },

    // Schreibt nur die übergebenen Bücher (upserts), setzt die Reihenfolge aus
    // `order` und löscht Bücher, deren ID darin fehlt — alles in einer
    // Transaktion. Die Nutzlast ist vorher mit validateBookSync geprüft.
    syncBooks({ upserts, order }) {
      try {
        const now = new Date().toISOString();
        const upsert = db.prepare(
          `INSERT INTO books (id, name, data, position, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data,
             position = excluded.position, updated_at = excluded.updated_at`
        );
        const setPosition = db.prepare('UPDATE books SET position = ? WHERE id = ? AND position <> ?');
        const position = new Map(order.map((id, index) => [id, index]));

        db.transaction(() => {
          for (const book of upserts) {
            upsert.run(book.id, book.name, JSON.stringify(book), position.get(book.id), now);
          }
          order.forEach((id, index) => setPosition.run(index, id, index));
          const placeholders = order.map(() => '?').join(', ');
          db.prepare(`DELETE FROM books WHERE id NOT IN (${placeholders})`).run(...order);
        })();
      } catch (err) {
        console.error('[db] syncBooks fehlgeschlagen:', err.message);
        throw err;
      }
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

export function closeDatabase() {
  if (db) {
    try {
      db.close();
    } catch (err) {
      console.error('[db] close failed:', err);
    }
    db = null;
  }
}
