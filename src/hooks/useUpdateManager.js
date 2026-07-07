import { useState, useEffect, useCallback } from "react";
import { useToast } from "../components/Toast.jsx";
import makeLogger from "../utils/logger.js";

const log = makeLogger("useUpdateManager");

/**
 * Single source of truth for the auto-update lifecycle. Owns the only pair of
 * update-event listeners (previously duplicated across useAppSettings and
 * SettingsDialog) and wraps every window.electronAPI update call so that
 * feature components never touch the IPC surface directly.
 *
 * Must be invoked exactly once (in HaushaltsbuchApp); the result is shared with
 * SettingsDialog via props.
 */
// macOS builds are unsigned, so electron-updater cannot apply downloads there
// (Squirrel.Mac rejects unsigned packages). On macOS we therefore skip the
// auto-download entirely and send the user to the GitHub releases page to
// install the new .dmg by hand. Windows keeps the real in-app auto-update.
const isMac = typeof window !== "undefined" && window.electronAPI?.platform === "darwin";

export function useUpdateManager() {
  const toast = useToast();

  // null | { version } — an update is available but not yet downloaded
  const [available, setAvailable] = useState(null);
  // null | { version } — a downloaded update is waiting to be installed
  const [ready, setReady] = useState(null);
  const [downloading, setDownloading] = useState(false);
  // null | "checking" | "up-to-date" | "error" — manual-check feedback only
  const [checkStatus, setCheckStatus] = useState(null);

  // The single listener stack for push events from the main process.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return undefined;
    const removeAvailable = api.onUpdateAvailable((info) => {
      setAvailable({ version: info.version });
      setCheckStatus(null);
    });
    const removeDownloaded = api.onUpdateDownloaded?.((info) => {
      setDownloading(false);
      setAvailable(null);
      setReady({ version: info.version });
    });
    return () => { removeAvailable?.(); removeDownloaded?.(); };
  }, []);

  const checkForUpdates = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.checkForUpdates) return;
    setCheckStatus("checking");
    try {
      const result = await api.checkForUpdates();
      if (result?.status === "available") {
        setAvailable({ version: result.version });
        setCheckStatus(null);
      } else {
        setCheckStatus(result?.status ?? "up-to-date");
      }
    } catch (err) {
      log.error("Update-Prüfung fehlgeschlagen", err);
      setCheckStatus("error");
    }
  }, []);

  const download = useCallback(async () => {
    const api = window.electronAPI;
    // On macOS, open the releases page in the browser instead of downloading
    // in-app (unsigned builds can't be auto-updated).
    if (isMac) {
      try {
        await api?.openReleasesPage?.();
      } catch (err) {
        log.error("Releases-Seite konnte nicht geöffnet werden", err);
        toast.error("Releases-Seite konnte nicht geöffnet werden.");
      }
      return;
    }
    if (!api?.downloadUpdate) return;
    setDownloading(true);
    try {
      await api.downloadUpdate();
      // Success: the onUpdateDownloaded event clears `downloading` and sets `ready`.
    } catch (err) {
      log.error("Update-Download fehlgeschlagen", err);
      toast.error("Download fehlgeschlagen. Bitte später erneut versuchen.");
      setDownloading(false);
    }
  }, [toast]);

  const install = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.installUpdate) return;
    try {
      await api.installUpdate();
    } catch (err) {
      log.error("Update-Installation fehlgeschlagen", err);
      toast.error("Installation fehlgeschlagen.");
    }
  }, [toast]);

  const dismissAvailable = useCallback(() => setAvailable(null), []);
  const dismissReady = useCallback(() => setReady(null), []);

  return {
    available, ready, downloading, checkStatus,
    checkForUpdates, download, install,
    dismissAvailable, dismissReady,
    // true on macOS: `download` opens the GitHub releases page rather than
    // fetching the update in-app, so the UI can adjust its button label.
    manualDownload: isMac,
  };
}
