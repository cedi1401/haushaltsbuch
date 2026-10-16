// Ermittelt, was beim Speichern in die Datenbank muss (eine Zeile pro Buch).
// Pure JS ohne Electron-Abhängigkeit, damit es mit Vitest testbar ist.
//
// Die Bücher werden im Frontend immutabel aktualisiert (patchActiveBook,
// updateBook usw. erzeugen ein neues Objekt nur für das geänderte Buch).
// Ein Referenzvergleich genügt deshalb, um geänderte Bücher zu erkennen.

/**
 * @param {Array|null} prevBooks Stand des letzten Speicherns, `null` = unbekannt
 * @param {Array} nextBooks aktueller Stand
 * @returns {{ upserts: Array, order: string[] }}
 *   `upserts`: neue oder geänderte Bücher (bei `prevBooks === null` alle).
 *   `order`: alle Buch-IDs in Anzeigereihenfolge. Was darin fehlt, wird gelöscht.
 */
export function diffBooks(prevBooks, nextBooks) {
  const order = nextBooks.map((b) => b.id);
  if (!Array.isArray(prevBooks)) {
    return { upserts: [...nextBooks], order };
  }
  const prevById = new Map(prevBooks.map((b) => [b.id, b]));
  const upserts = nextBooks.filter((b) => prevById.get(b.id) !== b);
  return { upserts, order };
}

/** true, wenn ein Diff nichts an der Datenbank ändern würde. */
export function isEmptyDiff(prevBooks, diff) {
  if (!Array.isArray(prevBooks) || diff.upserts.length > 0) return false;
  if (prevBooks.length !== diff.order.length) return false;
  return prevBooks.every((b, i) => b.id === diff.order[i]);
}
