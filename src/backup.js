// backup.js
// Simple JSON backup/restore for the Haushaltsbuch app.
// Import behavior is designed for FULL RESTORE (overwrite), no merging.

import { normalizeBook } from "./utils/hbUtils.js";

function safeFileStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden."));
    reader.readAsText(file);
  });
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function validateBackupObject(obj) {
  if (!isPlainObject(obj)) return false;
  if (obj.format !== "haushaltsbuch-backup") return false;
  if (obj.version !== 1) return false;
  if (!Array.isArray(obj.books)) return false;
  return true;
}

/**
 * Creates and downloads a backup JSON.
 *
 * @param {Object} args
 * @param {Array} args.books
 * @param {string|null} args.activeBookId
 * @param {string} args.monthFilter
 */
export function exportBackup({ books, activeBookId, monthFilter }) {
  const payload = {
    format: "haushaltsbuch-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    books: Array.isArray(books) ? books : [],
    activeBookId: typeof activeBookId === "string" ? activeBookId : null,
    monthFilter: typeof monthFilter === "string" ? monthFilter : "",
  };

  downloadJson(`haushaltsbuch-backup-${safeFileStamp()}.json`, payload);
}

/**
 * Reads a backup JSON file and returns normalized data for FULL RESTORE.
 *
 * @param {File} file
 * @returns {Promise<{books:Array, activeBookId:string|null, monthFilter:string}>}
 */
export async function importBackupFile(file) {
  const text = await readFileAsText(file);
  const obj = JSON.parse(text);

  if (!validateBackupObject(obj)) {
    throw new Error("Ungültiges Backup-Format.");
  }

  const books = obj.books.map(normalizeBook);
  const activeBookId =
    typeof obj.activeBookId === "string" && books.some((b) => b.id === obj.activeBookId)
      ? obj.activeBookId
      : books[0]?.id || null;

  const monthFilter = typeof obj.monthFilter === "string" ? obj.monthFilter : "";

  return { books, activeBookId, monthFilter };
}
