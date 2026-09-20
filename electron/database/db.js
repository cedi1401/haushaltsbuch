import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db = null;

// Spalten, die price_cache haben MUSS. Fehlt eine davon, stammt die Tabelle aus
// einer früheren Fassung und wird verworfen.
const PRICE_CACHE_COLUMNS = ['symbol', 'price', 'currency', 'exchange_name', 'market_time', 'fetched_at'];

function ensurePriceCacheSchema(connection) {
  const columns = connection.prepare('PRAGMA table_info(price_cache)').all().map((c) => c.name);
  if (columns.length === 0) return; // Tabelle existiert noch nicht — CREATE legt sie korrekt an.
  const complete = PRICE_CACHE_COLUMNS.every((name) => columns.includes(name));
  if (!complete) {
    console.warn('[db] price_cache hat ein veraltetes Schema — Tabelle wird neu angelegt (reiner Cache, kein Datenverlust).');
    connection.exec('DROP TABLE price_cache');
  }
}

export async function initDatabase() {
  const dbDir = app.getPath('userData');
  const dbPath = path.join(dbDir, 'haushaltsbuch.db');

  db = new Database(dbPath);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Der erste Investment-Anlauf (entfernt in f6f3333, bis v2.3.0) hinterliess eine
  // Tabelle GLEICHEN NAMENS mit anderem Schema (cache_key/date_key/source/raw_data).
  // "CREATE TABLE IF NOT EXISTS" lässt eine solche Tabelle unangetastet stehen —
  // jedes INSERT scheitert dann an "no such column: exchange_name", und zwar leise.
  // Der Inhalt ist reiner Wegwerf-Cache, deshalb wird eine abweichende Tabelle
  // verworfen statt migriert. Läuft vor dem CREATE und ist idempotent.
  ensurePriceCacheSchema(db);

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

    -- Zuletzt abgerufene Kurse. Gespeichert wird der Originalkurs in seiner
    -- HANDELSWÄHRUNG, nicht der umgerechnete Betrag — sonst bräuchte es pro
    -- Zielwährung eine eigene Zeile. Die Umrechnungskurse sind bei Yahoo
    -- selbst Symbole (USDCHF=X) und liegen darum in derselben Tabelle.
    --
    -- Zweck ist nicht nur Geschwindigkeit: Ohne Netz zeigt die App damit den
    -- letzten bekannten Kurs mit "Stand vom ..." statt einer Lücke.
    CREATE TABLE IF NOT EXISTS price_cache (
      symbol        TEXT PRIMARY KEY,
      price         REAL NOT NULL,
      currency      TEXT NOT NULL,
      exchange_name TEXT,
      market_time   TEXT,
      fetched_at    TEXT NOT NULL
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
      } catch (err) {
        console.error('[db] getBooks: JSON-Parsing fehlgeschlagen — Datenbank-Inhalt ist beschädigt:', err.message);
        return [];
      }
    },

    saveBooks(books) {
      try {
        const json = JSON.stringify(books);
        db.prepare('UPDATE books_store SET data = ? WHERE id = 1').run(json);
      } catch (err) {
        console.error('[db] saveBooks fehlgeschlagen:', err.message);
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

    // --- Kurs-Cache ---
    // Nach aussen camelCase wie im übrigen Marktdaten-Code; die snake_case-
    // Spaltennamen bleiben auf diese Datei beschränkt.

    getCachedPrice(symbol) {
      const row = db
        .prepare('SELECT symbol, price, currency, exchange_name, market_time, fetched_at FROM price_cache WHERE symbol = ?')
        .get(symbol);
      if (!row) return null;
      return {
        symbol: row.symbol,
        price: row.price,
        currency: row.currency,
        exchangeName: row.exchange_name || '',
        marketTime: row.market_time || null,
        fetchedAt: row.fetched_at,
      };
    },

    setCachedPrice({ symbol, price, currency, exchangeName, marketTime, fetchedAt }) {
      db.prepare(
        `INSERT OR REPLACE INTO price_cache (symbol, price, currency, exchange_name, market_time, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(symbol, price, currency, exchangeName || null, marketTime || null, fetchedAt);
    },

    clearPriceCache() {
      db.prepare('DELETE FROM price_cache').run();
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
