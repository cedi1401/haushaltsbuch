import { createContext, useContext } from "react";
import { DEFAULT_CATEGORY_COLOR } from "../utils/hbPalette.js";

// Context + Consumer-Hook getrennt von der Provider-Komponente
// (ThemeColorsProvider.jsx), damit Fast Refresh der Komponente sauber
// funktioniert (only-export-components).

export const DEFAULT_COLORS = {
  green: "#0f7b0f",
  red: "#c42b1c",
  blue: DEFAULT_CATEGORY_COLOR,
  teal: "#038387",
  orange: "#ca5010",
  purple: "#7160e8",
  accent: DEFAULT_CATEGORY_COLOR,
  muted: "#636363",
  yoyOld: "#8ab6e0",
  yoyMid: "#2b7fd4",
  yoyNew: "#153a70",
};

export function readColors() {
  if (typeof window === "undefined") return DEFAULT_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const get = (name, fallback) => {
    const v = styles.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    green: get("--green", DEFAULT_COLORS.green),
    red: get("--red", DEFAULT_COLORS.red),
    blue: get("--blue", DEFAULT_COLORS.blue),
    teal: get("--teal", DEFAULT_COLORS.teal),
    orange: get("--orange", DEFAULT_COLORS.orange),
    purple: get("--purple", DEFAULT_COLORS.purple),
    accent: get("--accent", DEFAULT_COLORS.accent),
    muted: get("--muted", DEFAULT_COLORS.muted),
    yoyOld: get("--yoy-old", DEFAULT_COLORS.yoyOld),
    yoyMid: get("--yoy-mid", DEFAULT_COLORS.yoyMid),
    yoyNew: get("--yoy-new", DEFAULT_COLORS.yoyNew),
  };
}

export const ThemeColorsContext = createContext(DEFAULT_COLORS);

export function useThemeColors() {
  return useContext(ThemeColorsContext);
}
