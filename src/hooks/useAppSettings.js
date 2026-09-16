import { useState, useEffect, useRef } from "react";
import { getSetting, setSetting } from "../dal/storage.js";
import makeLogger from "../utils/logger.js";

const log = makeLogger("useAppSettings");

export function useAppSettings() {
  const [darkMode, setDarkMode] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");

  // Gate persistence until the initial hydration from storage has finished, so
  // the load-induced setState calls don't immediately write the values back.
  // Owned here — no longer coupled to useBookManager's load flag.
  const hasLoaded = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [savedMonth, savedDark] = await Promise.all([
          getSetting("month"),
          getSetting("darkMode"),
        ]);
        if (typeof savedMonth === "string") setMonthFilter(savedMonth);
        if (savedDark === "true") setDarkMode(true);
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
    if (!hasLoaded.current) return;
    setSetting("month", monthFilter);
  }, [monthFilter]);

  return {
    darkMode, setDarkMode,
    monthFilter, setMonthFilter,
  };
}
