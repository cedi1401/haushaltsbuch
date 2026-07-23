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

// Zeitraum-Optionen für die Chart-RangeTabs (12/24 Monate bzw. gesamter Verlauf).
// App-weit identisch — geteilt, damit die Auswahl konsistent bleibt.
export const MONTH_RANGE_OPTIONS = [
  { value: "12", label: "12 M" },
  { value: "24", label: "24 M" },
  { value: "all", label: "Gesamt" },
];
