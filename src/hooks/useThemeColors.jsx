import React, { createContext, useContext, useEffect, useState } from "react";

const DEFAULT_COLORS = {
  green: "#0f7b0f",
  red: "#c42b1c",
  blue: "#0078d4",
  accent: "#0078d4",
  muted: "#636363",
};

function readColors() {
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
    accent: get("--accent", DEFAULT_COLORS.accent),
    muted: get("--muted", DEFAULT_COLORS.muted),
  };
}

export const ThemeColorsContext = createContext(DEFAULT_COLORS);

export function ThemeColorsProvider({ children }) {
  const [colors, setColors] = useState(readColors);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setColors(readColors());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <ThemeColorsContext.Provider value={colors}>
      {children}
    </ThemeColorsContext.Provider>
  );
}

export function useThemeColors() {
  return useContext(ThemeColorsContext);
}
