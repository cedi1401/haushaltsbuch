import React, { useRef, useState, useEffect } from "react";
import EditDialog from "../components/EditDialog.jsx";
import { Button } from "../components/ui.jsx";
import { exportBackupFile, importBackupFile as importBackupNative } from "../dal/storage.js";
import { exportBackup, validateBackupObject } from "../backup.js";
import { normalizeBook, validateMonthStartDay } from "../utils/hbUtils.js";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import HbTooltip from "../components/HbTooltip.jsx";
import makeLogger from "../utils/logger.js";

const log = makeLogger("SettingsDialog");
export default function SettingsDialog({
  open,
  onClose,

  // State needed for backup
  monthFilter,

  // callbacks for backup
  onImportBook,

  // NEU: für Töpfe-Verwaltung
  activeBook,
  onUpdateBook,
  onMonthStartDayChange,
  fontFamily,
  onFontFamilyChange,
  update,
}) {
  const backupInputRef = useRef(null);

  const toast = useToast();
  const { confirm } = useConfirm();

  const [isElectronEnv] = useState(() => window.electronAPI?.isElectron === true);

  // App-Version
  const [appVersion, setAppVersion] = useState(null);
  useEffect(() => {
    if (open && isElectronEnv && window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});
    }
  }, [open, isElectronEnv]);

  // Update-Lifecycle wird zentral von useUpdateManager (in HaushaltsbuchApp) verwaltet
  // und via `update`-Prop geteilt — keine eigenen Listener/IPC-Aufrufe hier.

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

  // Shared core for both import paths (Electron native dialog & browser file input):
  // validate → normalize → confirm → import → toast. Only how `obj` is obtained differs.
  async function processBackupObject(obj) {
    if (!validateBackupObject(obj) || obj.books.length === 0) {
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
  }

  async function triggerImportBackup() {
    if (isElectronEnv) {
      // Electron: native file dialog via IPC
      try {
        const result = await importBackupNative();
        if (result.canceled) return;
        await processBackupObject(result.data);
      } catch (e) {
        log.error("Backup-Import (Electron) fehlgeschlagen", e);
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
      await processBackupObject(JSON.parse(text));
    } catch (e) {
      log.error("Backup-Import (Browser) fehlgeschlagen", e);
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
      {/* App-Updates (nur Electron) */}
      {isElectronEnv && (
        <div className="hb-field">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>App-Updates</div>
          {appVersion && (
            <div className="hb-muted" style={{ marginBottom: 8, fontSize: 13 }}>
              Aktuelle Version: <strong>v{appVersion}</strong>
            </div>
          )}

          {update.ready ? (
            <div>
              <div style={{ color: "var(--green)", fontSize: 13, marginBottom: 10 }}>
                Update <strong>v{update.ready.version}</strong> wurde heruntergeladen und ist bereit.
              </div>
              <Button variant="solid" onClick={update.install}>
                Jetzt installieren &amp; neu starten
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="outline"
                onClick={update.checkForUpdates}
                disabled={update.checkStatus === "checking"}
              >
                {update.checkStatus === "checking" ? "Suche läuft…" : "Nach Update suchen"}
              </Button>
              {update.available && !update.downloading && (
                <>
                  <span style={{ color: "var(--accent)", fontSize: 13 }}>
                    Version <strong>v{update.available.version}</strong> verfügbar
                  </span>
                  <Button variant="outline" onClick={update.download}>
                    {update.manualDownload ? "Auf GitHub herunterladen" : "Herunterladen"}
                  </Button>
                </>
              )}
              {update.available && update.downloading && (
                <span className="hb-muted" style={{ fontSize: 13 }}>
                  Wird heruntergeladen…
                </span>
              )}
              {update.checkStatus === "up-to-date" && (
                <span className="hb-muted" style={{ fontSize: 13 }}>
                  Bereits auf dem neuesten Stand.
                </span>
              )}
              {update.checkStatus === "error" && (
                <span style={{ color: "var(--green)", fontSize: 13 }}>
                  App ist auf dem aktuellsten Stand.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="hb-field" style={{ marginTop: isElectronEnv ? 24 : 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Backup</div>

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

        <div className="hb-note">Tipp: Bewahre dein Backup in einer Cloud oder auf einem USB Stick auf.</div>
      </div>

      {/* SCHRIFTART */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Schriftart</div>
        <select
          className="hb-input"
          style={{ maxWidth: 150 }}
          value={fontFamily || "Inter"}
          onChange={(e) => onFontFamilyChange?.(e.target.value)}
        >
          <option value="Inter">Inter (Standard)</option>
          <option value="Bitter">Bitter</option>
          <option value="Nunito Sans">Nunito Sans</option>
        </select>
      </div>

      {/* BASISWÄHRUNG */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Basiswährung</div>
        <select
          className="hb-input"
          style={{ width: 90, minWidth: 0 }}
          value={activeBook?.baseCurrency || "CHF"}
          onChange={(e) => {
            const newCurrency = e.target.value;
            if (!activeBook) return;
            onUpdateBook?.({ ...activeBook, baseCurrency: newCurrency });
          }}
        >
          <option value="CHF">CHF</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {/* MONATSBEGINN */}
      <div className="hb-field" style={{ marginTop: 24 }}>
        <div className="hb-title-with-help" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600 }}>Monatsbeginn</div>
          <HbTooltip text="Einträge ab diesem Tag werden dem Folgemonat zugerechnet. Standard ist der 1. (Kalendermonat). Maximum ist der 28." placement="right" />
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
            style={{ width: 70, minWidth: 0 }}
          />
          <span className="hb-muted">. des Monats</span>
          {monthStartDayDraft !== 1 && (
            <Button variant="outline" onClick={() => setMonthStartDayDraft(1)}>
              Zurücksetzen
            </Button>
          )}
          <Button
            variant="solid"
            onClick={() => {
              if (!activeBook) return;
              onUpdateBook?.({ ...activeBook, monthStartDay: monthStartDayDraft });
              onMonthStartDayChange?.(monthStartDayDraft);
              toast.success("Monatsbeginn gespeichert.");
            }}
          >
            Speichern
          </Button>
        </div>
      </div>

    </EditDialog>
  );
}
