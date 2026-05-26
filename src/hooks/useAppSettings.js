import { useState, useEffect } from "react";
import { getSetting, setSetting } from "../dal/storage.js";

export function useAppSettings({ isInitialLoad }) {
  const [darkMode, setDarkMode] = useState(false);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [monthFilter, setMonthFilter] = useState("");
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    async function load() {
      const [savedMonth, savedDark, savedFont] = await Promise.all([
        getSetting("month"),
        getSetting("darkMode"),
        getSetting("fontFamily"),
      ]);
      if (typeof savedMonth === "string") setMonthFilter(savedMonth);
      if (savedDark === "true") setDarkMode(true);
      if (typeof savedFont === "string" && savedFont) setFontFamily(savedFont);
    }
    load();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    if (!isInitialLoad.current) {
      setSetting("darkMode", String(darkMode));
    }
  }, [darkMode, isInitialLoad]);

  useEffect(() => {
    const fontMap = {
      "Inter":       "'Inter Variable', sans-serif",
      "Bitter":      "'Bitter Variable', serif",
      "Nunito Sans": "'Nunito Sans Variable', sans-serif",
    };
    const value = fontMap[fontFamily] ?? "'Inter Variable', sans-serif";
    document.documentElement.style.setProperty("--app-font-family", value);
    if (!isInitialLoad.current) {
      setSetting("fontFamily", fontFamily);
    }
  }, [fontFamily, isInitialLoad]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    setSetting("month", monthFilter);
  }, [monthFilter, isInitialLoad]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateDownloaded) return;
    window.electronAPI.onUpdateDownloaded(() => setUpdateReady(true));
  }, []);

  return {
    darkMode, setDarkMode,
    fontFamily, setFontFamily,
    monthFilter, setMonthFilter,
    updateReady, setUpdateReady,
  };
}
