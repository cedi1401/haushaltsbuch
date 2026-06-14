# Haushaltsbuch - Project Instructions

## Hard Constraints

These rules must never be broken, regardless of what seems convenient:

- **Dev-Server nie starten**: `npm run dev` läuft nur im Windows-Terminal (Rollup-Binary-Problem in WSL). Nie automatisch via Bash starten — nach UI-Änderungen den Nutzer bitten, es selbst zu starten.
- **Kein TypeScript**: Das Projekt ist und bleibt JSX/JS. Keine `.ts`/`.tsx`-Dateien, keine TS-Typen einführen.
- **Kein CSS-Framework**: Styling ausschließlich via CSS (eigene Klassen/Variablen). Kein Tailwind, kein Bootstrap, keine Utility-Klassen.
- **Kein automatisiertes Browser-Testing**: Kein Python, kein Playwright, kein webapp-testing-Skill. Der Nutzer testet selbst manuell über den Dev-Server.
- **Keine hardcodierten Währungen**: Immer `fmt`/`baseCurrency` aus dem aktiven Buch verwenden — nie `CHF` oder ein Symbol fest im Code hinterlegen.
- **DAL-Pattern einhalten**: Jeder Datenzugriff läuft über `src/dal/storage.js` — nie direkt `localStorage` oder SQLite ansprechen.
- **Nie automatisch committen**: Commits werden ausschließlich über den `git-expert`-Subagenten gemacht. Nie selbst `git commit` ausführen — auch nicht nach abgeschlossenen Änderungen.

## Quick Reference

- **Design System**: WinUI 3 / Fluent Design — Details sind in der ui-expert-Agent-Definition. Für UI-Änderungen immer den ui-expert konsultieren.
- **Sprache UI**: Deutsch (korrekte deutsche Grammatik und Rechtschreibung)
- **Währung**: Konfigurierbar pro Buch (mehrere Formate verfügbar); kein einzelnes Format annehmen
