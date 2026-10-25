// src/utils/statementParser.js
//
// Einstieg für den Bankimport (F1): erkennt das Format am Inhalt und gibt an
// den passenden Leser weiter — camt (XML) oder den CSV-Export von Yuh.
// Beide liefern dieselbe Form (siehe `parseCamt`). Rein.

import { CamtParseError, parseCamt } from "./camtParser.js";
import { isBankCsv, parseBankCsv } from "./bankCsvParser.js";

export const SUPPORTED_FORMATS_TEXT = "camt.053 (XML) und der CSV-Export von Yuh";

/**
 * Liest einen Kontoauszug in einem der unterstützten Formate.
 * @param {string} text
 * @param {{ DOMParser?: typeof DOMParser }} [options] — für `parseCamt`
 * @throws {CamtParseError}
 */
export function parseStatement(text, options) {
  const source = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!source) throw new CamtParseError("empty", "Die Datei ist leer.");
  if (source.startsWith("{") || source.startsWith("[")) {
    throw new CamtParseError(
      "not-statement",
      `Das ist eine JSON-Datei (z. B. ein Backup), kein Kontoauszug. Unterstützt: ${SUPPORTED_FORMATS_TEXT}.`
    );
  }
  if (source.startsWith("<")) return parseCamt(source, options);
  if (isBankCsv(source)) return parseBankCsv(source);
  if (source.split(/\r?\n/, 1)[0].includes(";")) {
    throw new CamtParseError(
      "not-csv-profile",
      "Diese CSV-Datei hat kein bekanntes Format. Unterstützt wird der CSV-Export von Yuh."
    );
  }
  throw new CamtParseError("not-statement", `Format nicht erkannt. Unterstützt: ${SUPPORTED_FORMATS_TEXT}.`);
}
