// WinUI 3 / Fluent-inspired base palette — used internally as the fallback
// shade source for makeSubcategoryColorShades.
const PIE_PALETTE = [
  "#0078d4", "#0f7b0f", "#c42b1c", "#9d5d00", "#7160e8",
  "#038387", "#ca5010", "#4f6bed", "#8e562e", "#10893e",
  "#e3008c", "#498205", "#5c2d91", "#b4a00e", "#c239b3",
  "#00b7c3", "#4a154b", "#6b6b6b", "#005b70", "#8764b8",
];

// Farben für benutzerdefinierte Kategorien — keiner davon ist identisch mit
// den Hauptkategorie-Farben (Wohnen, Versicherung, Sparen, Shopping, Reisen,
// Mobilität, Lebenshaltung, Kinder, Gesundheit, Freizeit, Bank,
// Unkategorisiert, Einnahmen).
export const CUSTOM_CATEGORY_PALETTE = [
  "#5c2d91", // Tiefviolett
  "#4a154b", // Pflaume
  "#8764b8", // Lavendel
  "#c239b3", // Orchidee
  "#881798", // Dunkelmagenta
  "#8b0057", // Dunkelrose
  "#6b2737", // Burgund
  "#005b70", // Dunkelblaugrün
  "#00b7c3", // Cyan
  "#018574", // Türkis (Fluent)
  "#1a6b8a", // Petrol
  "#003087", // Marine
  "#00cc6a", // Smaragdgrün
  "#038387", // Helles Blaugrün (Fluent)
  "#73aa24", // Gelbgrün (Fluent)
  "#e8a200", // Goldgelb
  "#ef6950", // Koralle
  "#ff7043", // Leuchtendes Orange
  "#5d4037", // Dunkelbraun
  "#455a64", // Blaugrau
];

// Blau-Palette für Transfer-Kategorien im Topf-Donut-Chart. Gleiche Farbfamilie
// (Hue ≈208°) → kommuniziert visuell „alle Transfers derselben Natur". Die
// Zuweisung erfolgt stabil nach Zweck-Key (siehe PotsView), nicht nach Wert-Rang.
// Monoton gespreizt (dunkel → hell) mit gleichmäßigen Lightness-Abständen, damit
// benachbarte Zwecke auch bei vielen Kategorien unterscheidbar bleiben; die hellen
// Stufen kontrastieren schwach mit weißer Fläche, was im Donut durch die stets
// vorhandene Legende/Beschriftung (Secondary Encoding) aufgefangen wird.
export const TRANSFER_PALETTE = [
  "#215583", // L≈32%
  "#27669c", // L≈38%
  "#2d76b6", // L≈44%
  "#3687cd", // L≈51%
  "#5096d3", // L≈57%
  "#6aa5da", // L≈63%
  "#83b5e0", // L≈70%
  "#9dc4e7", // L≈76%
];

// Specific colors for income/expense charts
export const CHART_COLORS = {
  income: "#0f7b0f",      // Green
  expense: "#c42b1c",     // Red
  transfer: "#636363",    // Neutral gray
  balance: "#0078d4",     // Fluent blue
};

/**
 * Generates count color shades (lighter/darker tones) of a base color.
 * Used for drill-down charts (subcategories of a parent category).
 *
 * @param {string} baseHex - Hex color of the parent category, e.g. "#0078d4"
 * @param {number} count - Number of colors needed
 * @returns {string[]} - Array of count hex colors
 */
export function makeSubcategoryColorShades(baseHex, count) {
  if (!count || count <= 0) return [];
  if (!baseHex || typeof baseHex !== "string") {
    return Array.from({ length: count }, (_, i) => PIE_PALETTE[i % PIE_PALETTE.length]);
  }

  // Hex -> RGB
  const hex = baseHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // RGB -> HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  // Generate shades: evenly distributed across a lightness range
  const shades = [];
  if (count === 1) {
    shades.push(hslToHex(h * 360, s, l));
  } else {
    const spread = 0.35;
    const startL = Math.max(0.25, l - spread / 2);
    const endL = Math.min(0.78, l + spread / 2);
    const step = count > 1 ? (endL - startL) / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      shades.push(hslToHex(h * 360, Math.min(s + 0.05, 1), startL + i * step));
    }
  }

  return shades;
}

/**
 * Converts HSL values to a hex color string.
 * @param {number} h - Hue 0-360
 * @param {number} s - Saturation 0-1
 * @param {number} l - Lightness 0-1
 * @returns {string} - Hex color, e.g. "#0078d4"
 */
function hslToHex(h, s, l) {
  const hNorm = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (hNorm < 60)      { r = c; g = x; b = 0; }
  else if (hNorm < 120) { r = x; g = c; b = 0; }
  else if (hNorm < 180) { r = 0; g = c; b = x; }
  else if (hNorm < 240) { r = 0; g = x; b = c; }
  else if (hNorm < 300) { r = x; g = 0; b = c; }
  else                  { r = c; g = 0; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
