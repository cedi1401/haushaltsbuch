import { useState, useEffect, useRef } from "react";
import { getSetting, setSetting } from "../dal/storage.js";
import makeLogger from "../utils/logger.js";

const log = makeLogger("useAppSettings");

export function useAppSettings() {
  const [darkMode, setDarkMode] = useState(false);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [monthFilter, setMonthFilter] = useState("");

  // Gate persistence until the initial hydration from storage has finished, so
  // the load-induced setState calls don't immediately write the values back.
  // Owned here — no longer coupled to useBookManager's load flag.
  const hasLoaded = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [savedMonth, savedDark, savedFont] = await Promise.all([
          getSetting("month"),
          getSetting("darkMode"),
          getSetting("fontFamily"),
        ]);
        if (typeof savedMonth === "string") setMonthFilter(savedMonth);
        if (savedDark === "true") setDarkMode(true);
        if (typeof savedFont === "string" && savedFont) setFontFamily(savedFont);
      } catch (err) {
        log.warn("Einstellungen konnten nicht geladen werden — Standardwerte werden verwendet", err);
      } finally {
        hasLoaded.current = true;
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    if (hasLoaded.current) {
      setSetting("darkMode", String(darkMode));
    }
  }, [darkMode]);

  useEffect(() => {
    const fontMap = {
      "Inter":       "'Inter Variable', sans-serif",
      "Bitter":      "'Bitter Variable', serif",
      "Nunito Sans": "'Nunito Sans Variable', sans-serif",
    };
    const value = fontMap[fontFamily] ?? "'Inter Variable', sans-serif";
    document.documentElement.style.setProperty("--app-font-family", value);
    if (hasLoaded.current) {
      setSetting("fontFamily", fontFamily);
    }
  }, [fontFamily]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    setSetting("month", monthFilter);
  }, [monthFilter]);

  return {
    darkMode, setDarkMode,
    fontFamily, setFontFamily,
    monthFilter, setMonthFilter,
  };
}
