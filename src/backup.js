// backup.js
// Simple JSON backup/restore for the Haushaltsbuch app.
// Import behavior is designed for FULL RESTORE (overwrite), no merging.

import { formatFileStamp } from "./utils/hbUtils.js";

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export const BACKUP_FORMAT = "haushaltsbuch-backup";

// 1 = Ursprungsformat.
// 2 = Bücher können `investments` tragen (Depots, Assets, Transaktionen, Snapshots).
//     Angehoben statt stillschweigend erweitert, damit ein alter Build das Backup
//     sichtbar ablehnt, statt die Investments beim Rück-Export zu verlieren.
export const BACKUP_VERSION = 2;

// Ältere Versionen bleiben lesbar — normalizeBook() ergänzt die fehlenden Felder.
export const SUPPORTED_BACKUP_VERSIONS = [1, 2];

export function validateBackupObject(obj) {
  if (!isPlainObject(obj)) return false;
  if (obj.format !== BACKUP_FORMAT) return false;
  if (!SUPPORTED_BACKUP_VERSIONS.includes(obj.version)) return false;
  if (!Array.isArray(obj.books)) return false;
  return true;
}

/**
 * Creates and downloads a backup JSON for a single book.
 *
 * @param {Object} args
 * @param {Object} args.book - The active book to export
 * @param {string} args.monthFilter
 */
export function exportBackup({ book, monthFilter }) {
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    books: [book],
    activeBookId: book?.id || null,
    monthFilter: typeof monthFilter === "string" ? monthFilter : "",
  };

  downloadJson(`haushaltsbuch-backup-${formatFileStamp()}.json`, payload);
}
