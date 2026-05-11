import { useState, useEffect } from "react";
import { getSetting, setSetting } from "../dal/storage.js";

export function useAppSettings({ isInitialLoad }) {
  const [darkMode, setDarkMode] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    async function load() {
      const [savedMonth, savedDark] = await Promise.all([
        getSetting("month"),
        getSetting("darkMode"),
      ]);
      if (typeof savedMonth === "string") setMonthFilter(savedMonth);
      if (savedDark === "true") setDarkMode(true);
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
    if (isInitialLoad.current) return;
    setSetting("month", monthFilter);
  }, [monthFilter, isInitialLoad]);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateDownloaded) return;
    window.electronAPI.onUpdateDownloaded(() => setUpdateReady(true));
  }, []);

  return {
    darkMode, setDarkMode,
    monthFilter, setMonthFilter,
    updateReady, setUpdateReady,
  };
}
