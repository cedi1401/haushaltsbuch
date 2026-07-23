import React, { useEffect, useState } from "react";
import { ThemeColorsContext, readColors } from "./themeColors.js";

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
