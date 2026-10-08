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

// Eine Höhe für alle großen Achsen-Charts (Trend, Töpfe, Fixkosten,
// Kostenrechner). Donuts und die kleinen Insights-Charts haben eigene Maße.
export const CHART_HEIGHT = 260;

// Balken: eine Höchstbreite und ein Radius am äußeren Ende. Höchstbreite statt
// fester Breite, damit gruppierte Balken bei Platzmangel schmaler werden.
export const BAR_MAX_SIZE = 24;
export const BAR_RADIUS = 3;
export const BAR_TOP_RADIUS = [BAR_RADIUS, BAR_RADIUS, 0, 0];

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

// Schriftgröße für den Betrag in der Donut-Mitte: lange Beträge eine Stufe
// kleiner, damit sie nicht in den Ring ragen.
export function pieCenterFontSize(text) {
  const len = String(text).length;
  return len >= 15 ? 17 : len >= 12 ? 20 : 24;
}

// Der eine Stil für „Durchschnitt", app-weit gleich.
export function averageLineProps(themeColors) {
  return {
    stroke: themeColors.orange,
    strokeWidth: CHART_STROKE.ref,
    strokeDasharray: CHART_DASH.derived,
  };
}

// Tooltip-Cursor der Linien- und Flächen-Charts. Balken-Charts zeigen keinen
// Cursor (`cursor={false}`): der Balken selbst markiert die Stelle.
export function lineCursorProps(themeColors) {
  return {
    stroke: themeColors.muted,
    strokeWidth: CHART_STROKE.aux,
    strokeDasharray: CHART_DASH.secondary,
  };
}

export function zeroLineProps(themeColors) {
  return {
    stroke: themeColors.muted,
    strokeOpacity: 0.6,
    strokeWidth: CHART_STROKE.aux,
  };
}
