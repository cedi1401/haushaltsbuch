import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getSetting, setSetting } from "../dal/storage.js";
import makeLogger from "../utils/logger.js";

const log = makeLogger("useTableColumns");

/**
 * Persistenz der Spaltenauswahl einer Tabelle.
 *
 * Bewusst NICHT im Buch gespeichert: Die Auswahl ist eine Anzeige-Präferenz,
 * kein Buchinhalt. Sie gehört nicht ins Backup-Format und nicht in
 * `normalizeBooks()` — deshalb läuft sie über die App-Settings des DAL
 * (Electron: `app_settings`, Browser: `localStorage`).
 *
 * Gespeichert wird die Liste der SICHTBAREN Spalten-IDs. Bekannte Folge: Eine
 * später neu hinzugefügte Standardspalte erscheint bei Bestandsnutzern nicht
 * automatisch — sie holen sie über „Standard wiederherstellen". Das ist der
 * Preis dafür, dass die explizite Auswahl gewinnt, und er ist hier richtig
 * herum gewählt.
 *
 * @param {string} storageKey - Schlüssel der Tabelle, z.B. "reserves"
 * @param {Array} columns - der vollständige Spaltenkatalog
 */
export function useTableColumns(storageKey, columns) {
  const settingKey = `table.columns.${storageKey}`;

  const defaults = useMemo(
    () => columns.filter((c) => c.defaultVisible).map((c) => c.id),
    [columns]
  );

  // Der Katalog ist bei jedem Render ein neues Array (er entsteht aus einer
  // Fabrik). Für die Effekte unten zählt nur sein Inhalt, nicht seine Identität
  // — deshalb über ein Ref statt über die Dependency-Liste.
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const [visibleIds, setVisibleIds] = useState(defaults);

  // Bis `getSetting` auflöst, wird mit den Defaults gerendert. Ohne dieses Gate
  // schriebe der Persistenz-Effekt die Defaults sofort über die gespeicherte
  // Auswahl zurück.
  const hasLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = await getSetting(settingKey);
        if (cancelled) return;
        if (typeof raw === "string" && raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setVisibleIds(sanitize(parsed, columnsRef.current));
        }
      } catch (err) {
        log.warn(`Spaltenauswahl „${settingKey}" konnte nicht geladen werden`, err);
      } finally {
        if (!cancelled) hasLoaded.current = true;
      }
    }
    load();
    return () => { cancelled = true; };
  }, [settingKey]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    setSetting(settingKey, JSON.stringify(visibleIds));
  }, [settingKey, visibleIds]);

  const toggle = useCallback((id) => {
    setVisibleIds((prev) => {
      const col = columnsRef.current.find((c) => c.id === id);
      if (!col || col.alwaysVisible) return prev;
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return sanitize(next, columnsRef.current);
    });
  }, []);

  const reset = useCallback(() => {
    // Der DAL kennt kein `delete` — „Standard wiederherstellen" schreibt die
    // Default-Liste, es löscht den Schlüssel nicht.
    setVisibleIds(columnsRef.current.filter((c) => c.defaultVisible).map((c) => c.id));
  }, []);

  const isDefault = useMemo(() => {
    if (visibleIds.length !== defaults.length) return false;
    const set = new Set(visibleIds);
    return defaults.every((id) => set.has(id));
  }, [visibleIds, defaults]);

  return { visibleIds, toggle, reset, isDefault };
}

/**
 * Unbekannte IDs fallen raus (eine später entfernte Spalte darf nicht als Geist
 * in der Auswahl bleiben), `alwaysVisible` wird erzwungen, und die Reihenfolge
 * folgt dem Katalog — nicht der Speicherreihenfolge.
 */
function sanitize(ids, columns) {
  const wanted = new Set(ids);
  return columns.filter((c) => c.alwaysVisible || wanted.has(c.id)).map((c) => c.id);
}
