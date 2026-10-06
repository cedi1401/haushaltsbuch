// Gemeinsamer Chart-Stil: Achsen, Linienstärken und Strichmuster an einer
// Stelle, damit alle Recharts-Charts gleich aussehen.

// Linienstärken — drei Stufen, keine weiteren Zwischenwerte.
export const CHART_STROKE = {
  main: 2, // Datenlinien und Flächenkonturen
  ref: 1.5, // Durchschnitt, Zielmarke, Prognose, Sparklines
  aux: 1, // Nulllinie, Soll, Cursor, Marker
};

// Strichmuster — durchgezogen sind Daten, Zielmarken und Nulllinien.
export const CHART_DASH = {
  derived: "5 3", // abgeleitete Werte: Durchschnitt, Prognose, Soll
  secondary: "2 3", // Zweit-Durchschnitt, Marker, Tooltip-Cursor
};

export const AXIS_FONT_SIZE = 11;
// Einheitliche Breite der Betragsachsen: gleiche Breite = gleiche linke
// Plotkante bei nebeneinanderstehenden Charts.
export const AMOUNT_AXIS_WIDTH = 64;
const X_AXIS_HEIGHT = 28;

// „Jan 2026" → „Jan 26". Nur für die Achse: der Datenwert bleibt lang, damit
// der Tooltip das volle Label zeigt.
export function shortMonthTick(label) {
  return String(label).replace(/ \d{2}(\d{2})$/, " $1");
}

// Basis für jede Achse: keine Achsen- und Tick-Linien, gerade Beschriftung.
export function axisProps(themeColors) {
  return {
    axisLine: false,
    tickLine: false,
    tick: { fontSize: AXIS_FONT_SIZE, fill: themeColors.muted },
  };
}

export function xAxisProps(themeColors) {
  return { ...axisProps(themeColors), height: X_AXIS_HEIGHT };
}

// X-Achse mit Monatslabels: gekürzt und bei Platzmangel gleichmäßig
// ausgedünnt (jeder 2./3. Monat) statt schräg gestellt.
export function monthAxisProps(themeColors) {
  return {
    ...xAxisProps(themeColors),
    interval: "equidistantPreserveStart",
    minTickGap: 12,
    tickFormatter: shortMonthTick,
  };
}

// Der eine Stil für „Durchschnitt", app-weit gleich.
export function averageLineProps(themeColors) {
  return {
    stroke: themeColors.orange,
    strokeWidth: CHART_STROKE.ref,
    strokeDasharray: CHART_DASH.derived,
  };
}

export function zeroLineProps(themeColors) {
  return {
    stroke: themeColors.muted,
    strokeOpacity: 0.6,
    strokeWidth: CHART_STROKE.aux,
  };
}
