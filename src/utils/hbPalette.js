// Claymorphism-optimierte Farbpalette - leicht entsaettigt, warm und organisch
// 20 Farben - zyklisch wiederverwendet, wenn mehr Kategorien existieren.

export const PIE_PALETTE = [
  "#5b8dc7", // muted blue (primary)
  "#5a9e6f", // muted green
  "#c75b5b", // muted red
  "#c9a857", // muted gold
  "#8b7bc7", // muted purple
  "#5a9e9e", // muted teal
  "#c78b5b", // muted orange
  "#7b8bc7", // periwinkle
  "#9e6f5a", // muted brown
  "#5bc78b", // seafoam
  "#c75b8b", // muted rose
  "#8bc75b", // lime green
  "#5b5bc7", // indigo
  "#c7c75b", // muted yellow
  "#c75bc7", // muted magenta
  "#5bc7c7", // cyan
  "#7b5a9e", // grape
  "#9e9e5a", // olive
  "#5a7b9e", // steel blue
  "#9e5a7b", // mauve
];

// Spezifische Farben fuer Einnahmen/Ausgaben Charts
export const CHART_COLORS = {
  income: "#5a9e6f",      // Muted green
  expense: "#c75b5b",     // Muted red
  transfer: "#718096",    // Neutral gray
  balance: "#5b8dc7",     // Muted blue
};

/**
 * Erstellt eine stabile Kategorie->Farbe Zuordnung anhand einer Reihenfolge.
 * Tipp: Gib als Reihenfolge z.B. deine Kategorien-Liste (Book) rein und haenge
 * ggf. "orphan" Kategorien danach an.
 */
export function makeCategoryColorMap(categoryNames, palette = PIE_PALETTE) {
  const colors = Array.isArray(palette) && palette.length ? palette : ["#5b8dc7"];
  const map = new Map();
  let i = 0;

  for (const raw of categoryNames || []) {
    // Unterstuetze sowohl String-Arrays als auch Objekt-Arrays
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
