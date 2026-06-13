export const RECURRING_DUE_THRESHOLD_DAYS = 7;
export const BURNRATE_DELTA_THRESHOLD_PCT = 10;

// Shared stable empty-array reference for memo/default fallbacks.
// Single identity avoids re-render churn when used as a `|| EMPTY_ARRAY` default.
export const EMPTY_ARRAY = [];

// German month names — canonical, app-wide. Index 0 = Januar.
export const MONTHS_LONG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
export const MONTHS_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];
