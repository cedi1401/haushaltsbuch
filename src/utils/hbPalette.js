// WinUI 3 / Fluent-inspired color palette - vivid but tasteful
// 20 colors - cyclically reused when more categories exist.

export const PIE_PALETTE = [
  "#0078d4", // Fluent blue (primary accent)
  "#0f7b0f", // green
  "#c42b1c", // red
  "#9d5d00", // amber/gold
  "#7160e8", // purple
  "#038387", // teal
  "#ca5010", // orange
  "#4f6bed", // periwinkle
  "#8e562e", // brown
  "#10893e", // forest green
  "#e3008c", // magenta/rose
  "#498205", // lime
  "#5c2d91", // deep purple
  "#b4a00e", // olive gold
  "#c239b3", // orchid
  "#00b7c3", // cyan
  "#4a154b", // plum
  "#6b6b6b", // neutral gray
  "#005b70", // dark teal
  "#8764b8", // lavender
];

// Specific colors for income/expense charts
export const CHART_COLORS = {
  income: "#0f7b0f",      // Green
  expense: "#c42b1c",     // Red
  transfer: "#636363",    // Neutral gray
  balance: "#0078d4",     // Fluent blue
};

/**
 * Creates a stable category->color mapping based on ordering.
 * Tip: pass your category list (book) and append any "orphan" categories after.
 */
export function makeCategoryColorMap(categoryNames, palette = PIE_PALETTE) {
  const colors = Array.isArray(palette) && palette.length ? palette : ["#0078d4"];
  const map = new Map();
  let i = 0;

  for (const raw of categoryNames || []) {
    // Support both string arrays and object arrays
    const name = typeof raw === "string"
      ? raw.trim()
      : String(raw?.name || "").trim();

    if (!name) continue;
    if (map.has(name)) continue;
    map.set(name, colors[i % colors.length]);
    i++;
  }

  return map;
}

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
