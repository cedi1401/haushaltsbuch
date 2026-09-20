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

// --- Marktdaten ---

// Yahoo-Symbole enthalten neben Buchstaben/Ziffern auch Punkt (VWRL.SW), Bindestrich,
// Gleichheitszeichen (GC=F, USDCHF=X) und Zirkumflex (^GSPC).
const SYMBOL_PATTERN = /^[A-Za-z0-9.^=-]{1,20}$/;

export function isValidSymbol(symbol) {
  return typeof symbol === 'string' && SYMBOL_PATTERN.test(symbol);
}

export function isValidSearchQuery(query) {
  return typeof query === 'string' && query.trim().length > 0 && query.length <= 64;
}

// Von Yahoo unterstützte Werte, als Whitelist statt Durchreichen freier Strings.
export const HISTORY_INTERVALS = ['1d', '1wk', '1mo'];
export const HISTORY_RANGES = ['1mo', '3mo', '6mo', '1y', '5y', 'max'];

export function isValidHistoryOptions(options) {
  if (options == null) return true;
  if (typeof options !== 'object') return false;
  const { interval, range } = options;
  if (interval !== undefined && !HISTORY_INTERVALS.includes(interval)) return false;
  if (range !== undefined && !HISTORY_RANGES.includes(range)) return false;
  return true;
}
