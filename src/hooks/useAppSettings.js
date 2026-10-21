import { useState, useEffect, useRef } from "react";
import { getSetting, setSetting } from "../dal/storage.js";
import makeLogger from "../utils/logger.js";

const log = makeLogger("useAppSettings");

export function useAppSettings() {
  const [darkMode, setDarkMode] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");
  // Wunsch „Navigationsleiste ausgeklappt“. Gilt nur bei genug Fensterbreite,
  // darunter startet die Leiste immer eingeklappt (siehe NavPane).
  const [navExpanded, setNavExpanded] = useState(true);
  // Ausgaben-Donut „Inkl. Rückstellungen“: null = nie gewählt, dann gilt der
  // Standard (an, sobald eine Rückstellung eine Kategorie hat).
  const [includeReserves, setIncludeReserves] = useState(null);

  // Gate persistence until the initial hydration from storage has finished, so
  // the load-induced setState calls don't immediately write the values back.
  // Owned here — no longer coupled to useBookManager's load flag.
  const hasLoaded = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [savedMonth, savedDark, savedNav, savedReserves] = await Promise.all([
          getSetting("month"),
          getSetting("darkMode"),
          getSetting("navExpanded"),
          getSetting("includeReserves"),
        ]);
        if (typeof savedMonth === "string") setMonthFilter(savedMonth);
        if (savedDark === "true") setDarkMode(true);
        if (savedNav === "false") setNavExpanded(false);
        if (savedReserves === "true" || savedReserves === "false") setIncludeReserves(savedReserves === "true");
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

  useEffect(() => {
    if (!hasLoaded.current) return;
    setSetting("navExpanded", String(navExpanded));
  }, [navExpanded]);

  useEffect(() => {
    if (!hasLoaded.current || includeReserves === null) return;
    setSetting("includeReserves", String(includeReserves));
  }, [includeReserves]);

  return {
    darkMode, setDarkMode,
    monthFilter, setMonthFilter,
    navExpanded, setNavExpanded,
    includeReserves, setIncludeReserves,
  };
}
