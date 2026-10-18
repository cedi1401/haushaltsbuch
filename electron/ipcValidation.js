// Validation helpers for IPC handlers in main.js.
// No Electron imports — pure JS so this module is testable with Vitest.

export function validateBook(book) {
  return (
    book !== null &&
    typeof book === 'object' &&
    typeof book.id === 'string' &&
    book.id.length > 0 &&
    typeof book.name === 'string' &&
    book.name.length > 0
  );
}

// Nutzlast von db:syncBooks: `{ upserts: Book[], order: string[] }`.
// `order` listet ALLE Buch-IDs; was darin fehlt, löscht die Datenbank. Eine
// leere oder doppelte Liste wird darum abgelehnt — sie würde Bücher verwerfen.
// Jedes Buch in `upserts` muss in `order` stehen, sonst hätte es keine Position.
export function validateBookSync(payload) {
  if (payload === null || typeof payload !== 'object') return false;
  const { upserts, order } = payload;
  if (!Array.isArray(order) || order.length === 0) return false;
  if (!order.every((id) => typeof id === 'string' && id.length > 0)) return false;
  const ids = new Set(order);
  if (ids.size !== order.length) return false;
  if (!Array.isArray(upserts) || !upserts.every(validateBook)) return false;
  return upserts.every((book) => ids.has(book.id));
}

// Map of allowed setting keys to their value validators.
// Adding a new setting: append one entry here — no other changes needed.
export const SETTING_SCHEMA = new Map([
  ['activeBookId',  (v) => typeof v === 'string'],
  ['theme',         (v) => typeof v === 'string'],
  ['darkMode',      (v) => typeof v === 'string' || typeof v === 'boolean'],
  ['month',         (v) => typeof v === 'string'],
  ['monthStartDay', (v) => typeof v === 'string' || typeof v === 'number'],
]);

// Spaltenauswahl der Tabellen (`useTableColumns`): ein Schlüssel je Tabelle,
// `table.columns.<storageKey>`, Wert ist die JSON-Liste der sichtbaren Spalten.
// Als Muster statt als Einzeleinträge, damit eine neue Tabelle nicht still
// ihre Auswahl verliert, weil ihr Schlüssel hier fehlt.
const TABLE_COLUMNS_KEY_PATTERN = /^table\.columns\.[A-Za-z0-9._-]{1,64}$/;
const MAX_TABLE_COLUMNS_LENGTH = 4000;

export function isValidSetting(key, value) {
  if (typeof key === 'string' && TABLE_COLUMNS_KEY_PATTERN.test(key)) {
    return typeof value === 'string' && value.length <= MAX_TABLE_COLUMNS_LENGTH;
  }
  const validator = SETTING_SCHEMA.get(key);
  return validator ? validator(value) : false;
}
