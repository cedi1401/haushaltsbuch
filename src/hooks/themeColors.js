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
  yellow: "#d97706",
  accent: DEFAULT_CATEGORY_COLOR,
  muted: "#636363",
  text: "#1a1a1a",
  card: "#ffffff",
  border: "#e0e0e0",
  yoyOld: "#8ab6e0",
  yoyMid: "#2b7fd4",
  yoyNew: "#153a70",
  invStock: "#3b82f6",
  invEtf: "#22c55e",
  invMetal: "#eab308",
  invCrypto: "#8b5cf6",
  invOther: "#8e949c",
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
    yellow: get("--yellow", DEFAULT_COLORS.yellow),
    accent: get("--accent", DEFAULT_COLORS.accent),
    muted: get("--muted", DEFAULT_COLORS.muted),
    text: get("--text", DEFAULT_COLORS.text),
    card: get("--card", DEFAULT_COLORS.card),
    border: get("--border", DEFAULT_COLORS.border),
    yoyOld: get("--yoy-old", DEFAULT_COLORS.yoyOld),
    yoyMid: get("--yoy-mid", DEFAULT_COLORS.yoyMid),
    yoyNew: get("--yoy-new", DEFAULT_COLORS.yoyNew),
    invStock: get("--inv-class-stock", DEFAULT_COLORS.invStock),
    invEtf: get("--inv-class-etf", DEFAULT_COLORS.invEtf),
    invMetal: get("--inv-class-metal", DEFAULT_COLORS.invMetal),
    invCrypto: get("--inv-class-crypto", DEFAULT_COLORS.invCrypto),
    invOther: get("--inv-class-other", DEFAULT_COLORS.invOther),
  };
}

export const ThemeColorsContext = createContext(DEFAULT_COLORS);

export function useThemeColors() {
  return useContext(ThemeColorsContext);
}
