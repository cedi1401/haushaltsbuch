import React, { useRef, useState, useEffect } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { Button } from "../components/ui.jsx";
import { exportBackupFile, importBackupFile as importBackupNative } from "../dal/storage.js";
import { exportBackup } from "../backup.js";
import { normalizeBook, validateMonthStartDay } from "../utils/hbUtils.js";
import { getFinancialMonthRange } from "../utils/financialMonthUtils.js";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import PotsManager from "./PotsManager.jsx";

export default function SettingsDialog({
  open,
  onClose,

  // State needed for backup
  monthFilter,

  // callbacks for backup
  onRestoreAll,
  onImportBook,

  // NEU: für Töpfe-Verwaltung
  activeBook,
  onUpdateBook,
  onMonthStartDayChange,
}) {
  const backupInputRef = useRef(null);

  const toast = useToast();
  const { confirm } = useConfirm();

  // Electron-Erkennung als React State — wird beim Mount ausgewertet, danach reaktiv
  const [isElectronEnv, setIsElectronEnv] = useState(false);
  useEffect(() => {
    setIsElectronEnv(window.electronAPI?.isElectron === true);
  }, []);

  // App-Version
  const [appVersion, setAppVersion] = useState(null);
  useEffect(() => {
    if (open && isElectronEnv && window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});
    }
  }, [open, isElectronEnv]);

  // Update-Check
  const [updateStatus, setUpdateStatus] = useState(null); // null | "checking" | "available" | "not-available" | "error"

  async function checkForUpdates() {
    if (!window.electronAPI?.checkForUpdates) return;
    setUpdateStatus("checking");
    try {
      const result = await window.electronAPI.checkForUpdates();
      setUpdateStatus(result?.available ? "available" : "not-available");
    } catch {
      setUpdateStatus("error");
    }
  }

  // State für Monatsbeginn-Input
  const [monthStartDayDraft, setMonthStartDayDraft] = useState(1);

  // Monatsbeginn-Draft initialisieren wenn Dialog öffnet
  useEffect(() => {
    if (open && activeBook) {
      setMonthStartDayDraft(activeBook.monthStartDay ?? 1);
    }
  }, [open, activeBook]);

  async function doExportBackup() {
    if (!activeBook) return;
    if (isElectronEnv) {
      await exportBackupFile({ book: activeBook, monthFilter });
    } else {
      exportBackup({ book: activeBook, monthFilter });
    }
  }

  async function triggerImportBackup() {
    if (isElectronEnv) {
      // Electron: native file dialog via IPC
      try {
        const result = await importBackupNative();
        if (result.canceled) return;

        const obj = result.data;
        if (!obj || obj.format !== 'haushaltsbuch-backup' || obj.version !== 1 || !Array.isArray(obj.books) || obj.books.length === 0) {
          toast.error("Ungültiges Backup-Format.");
          return;
        }

        const bookToImport = normalizeBook(obj.books[0]);
        const ok = await confirm({
          title: "Backup importieren",
          message: `Haushaltsbuch „${bookToImport.name}“ importieren?\n\nEs wird zur bestehenden Datenbank hinzugefügt.`,
          confirmLabel: "Importieren",
        });
        if (!ok) return;

        onImportBook?.(bookToImport);
        toast.success(`„${bookToImport.name}“ importiert.`);
        onClose?.();
      } catch (e) {
        console.error(e);
        toast.error("Import fehlgeschlagen.");
      }
    } else {
      // Browser: hidden file input
      backupInputRef.current?.click();
    }
  }

  async function onPickBackupFile(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const obj = JSON.parse(text);

      if (!obj || obj.format !== 'haushaltsbuch-backup' || obj.version !== 1 || !Array.isArray(obj.books) || obj.books.length === 0) {
        toast.error("Ungültiges Backup-Format. Ist es wirklich ein gültiges Haushaltsbuch-Backup (.json)?");
        return;
      }

      const bookToImport = normalizeBook(obj.books[0]);
      const ok = await confirm({
        title: "Backup importieren",
        message: `Haushaltsbuch „${bookToImport.name}“ importieren?\n\nEs wird zur bestehenden Datenbank hinzugefügt.`,
        confirmLabel: "Importieren",
      });
      if (!ok) return;

      onImportBook?.(bookToImport);
      toast.success(`„${bookToImport.name}“ importiert.`);
      onClose?.();
    } catch (e) {
      console.error(e);
      toast.error("Import fehlgeschlagen. Ist es wirklich ein gültiges Haushaltsbuch-Backup (.json)?");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  return (
    <EditDialog
      open={open}
      title="Einstellungen"
      onClose={onClose}
      onSave={onClose}
      canSave={true}
      saveLabel="Schließen"
    >
      <div className="hb-field">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Backup</div>
        <div className="hb-muted" style={{ marginBottom: 10 }}>
          Export speichert das aktive Haushaltsbuch als .json Datei. Import fügt ein Buch zur bestehenden Datenbank hinzu.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={doExportBackup}>
            Backup exportieren
          </Button>
          <Button variant="outline" onClick={triggerImportBackup}>
            Backup importieren
          </Button>
        </div>

        <input
          ref={backupInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickBackupFile(f);
          }}
        />

        <div className="hb-note">Tipp: Bewahre dein Backup z.B. in OneDrive/Dropbox/USB auf.</div>
      </div>

      {/* App-Updates (nur Electron) */}
      {isElectronEnv && (
        <div className="hb-field" style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>App-Updates</div>
          {appVersion && (
            <div className="hb-muted" style={{ marginBottom: 8, fontSize: 13 }}>
              Aktuelle Version: <strong>v{appVersion}</strong>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="outline"
              onClick={checkForUpdates}
              disabled={updateStatus === "checking"}
            >
              {updateStatus === "checking" ? "Suche läuft…" : "Nach Update suchen"}
            </Button>
            {updateStatus === "available" && (
              <span style={{ color: "var(--green)", fontSize: 13 }}>
                Update verfügbar — wird automatisch heruntergeladen.
              </span>
            )}
            {updateStatus === "not-available" && (
              <span className="hb-muted" style={{ fontSize: 13 }}>
                Bereits auf dem neuesten Stand.
              </span>
            )}
            {updateStatus === "error" && (
              <span style={{ color: "var(--red)", fontSize: 13 }}>
                Fehler beim Suchen. Internetverbindung prüfen.
              </span>
            )}
          </div>
        </div>
      )}

      {/* BASISWÄHRUNG */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Basiswährung</div>
        <div className="hb-muted" style={{ marginBottom: 10 }}>
          Alle Beträge in diesem Haushaltsbuch werden in dieser Währung angezeigt.
        </div>
        <select
          className="hb-input"
          style={{ maxWidth: 200 }}
          value={activeBook?.baseCurrency || "CHF"}
          onChange={(e) => {
            const newCurrency = e.target.value;
            if (!activeBook) return;
            onUpdateBook?.({ ...activeBook, baseCurrency: newCurrency });
          }}
        >
          <option value="CHF">CHF – Schweizer Franken</option>
          <option value="EUR">EUR – Euro</option>
          <option value="USD">USD – US-Dollar</option>
        </select>
      </div>

      {/* MONATSBEGINN */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Monatsbeginn</div>
        <div className="hb-muted" style={{ marginBottom: 10 }}>
          Ab welchem Tag beginnt dein finanzieller Monat? Einträge ab diesem Tag werden dem Folgemonat zugerechnet.
          Standard ist der 1. (Kalendermonat). Maximum ist der 28.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="hb-input"
            type="number"
            min="1"
            max="28"
            value={monthStartDayDraft}
            onChange={(e) => {
              setMonthStartDayDraft(validateMonthStartDay(e.target.value));
            }}
            style={{ width: 80 }}
          />
          <span className="hb-muted">. des Monats</span>
          {monthStartDayDraft !== 1 && (
            <button
              className="hb-muted"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" }}
              onClick={() => setMonthStartDayDraft(1)}
            >
              Auf 1. zurücksetzen
            </button>
          )}
        </div>
        {(() => {
          const d = monthStartDayDraft;
          if (d === 1) {
            return (
              <div className="hb-note" style={{ marginTop: 8 }}>
                Einträge vom 1. bis letzten Tag des Monats zählen als Kalendermonat.
              </div>
            );
          }
          const today = new Date();
          const m = today.getMonth() + 1;
          const y = today.getFullYear();
          const yyyymm = `${y}-${String(m).padStart(2, "0")}`;
          const range = getFinancialMonthRange(yyyymm, d);
          const nextM = m === 12 ? 1 : m + 1;
          const nextY = m === 12 ? y + 1 : y;
          const nextYYYYMM = `${nextY}-${String(nextM).padStart(2, "0")}`;
          const nextRange = getFinancialMonthRange(nextYYYYMM, d);
          const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
          const fmtDate = (iso) => {
            if (!iso) return "";
            const [, mm, dd] = iso.split("-");
            return `${Number(dd)}. ${months[Number(mm) - 1]}`;
          };
          return (
            <div className="hb-note" style={{ marginTop: 8 }}>
              Beispiel: {fmtDate(range?.startDate)} – {fmtDate(range?.endDate)} zählen als „{months[m - 1]}"
              <br />
              {fmtDate(nextRange?.startDate)} – {fmtDate(nextRange?.endDate)} zählen als „{months[nextM - 1]}"
            </div>
          );
        })()}
        <Button
          variant="solid"
          style={{ marginTop: 12 }}
          onClick={() => {
            if (!activeBook) return;
            onUpdateBook?.({ ...activeBook, monthStartDay: monthStartDayDraft });
            onMonthStartDayChange?.(monthStartDayDraft);
            toast.success("Monatsbeginn gespeichert.");
          }}
        >
          Monatsbeginn speichern
        </Button>
      </div>

      {/* TÖPFE-VERWALTUNG */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <PotsManager activeBook={activeBook} onUpdateBook={onUpdateBook} />
      </div>

    </EditDialog>
  );
}
