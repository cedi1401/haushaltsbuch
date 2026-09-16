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

// Map of allowed setting keys to their value validators.
// Adding a new setting: append one entry here — no other changes needed.
export const SETTING_SCHEMA = new Map([
  ['activeBookId',  (v) => typeof v === 'string'],
  ['theme',         (v) => typeof v === 'string'],
  ['darkMode',      (v) => typeof v === 'string' || typeof v === 'boolean'],
  ['month',         (v) => typeof v === 'string'],
  ['monthStartDay', (v) => typeof v === 'string' || typeof v === 'number'],
]);

export function isValidSetting(key, value) {
  const validator = SETTING_SCHEMA.get(key);
  return validator ? validator(value) : false;
}
