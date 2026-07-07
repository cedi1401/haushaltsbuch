import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getDb, closeDatabase } from './database/db.js';
import { validateBook, isValidSetting } from './ipcValidation.js';

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let downloadedUpdateInfo = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1200,
    minWidth: 1200,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Haushaltsbuch',
    icon: path.join(__dirname, process.platform === 'win32' ? '../dist/icon.ico' : '../dist/icon.png'),
  });

  mainWindow.maximize();

  // Dev or production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Block navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL
      ? url.startsWith(process.env.VITE_DEV_SERVER_URL)
      : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();

  // Content Security Policy (production only — dev server requires looser rules)
  if (!process.env.VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'"
          ],
        },
      });
    });
  }

  createWindow();

  // Auto-updates (only in production) — check only, no auto-download
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] checkForUpdates failed:', err);
    });
  }
});

app.on('before-quit', () => {
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================
// IPC Handlers — bridge between renderer and DB
// ============================================

function registerIpcHandlers() {
  const db = getDb();

  // --- Books ---
  ipcMain.handle('db:getBooks', () => {
    try {
      return db.getBooks();
    } catch (err) {
      console.error('[ipc] db:getBooks failed:', err);
      return [];
    }
  });

  ipcMain.handle('db:saveBooks', (_event, books) => {
    if (!Array.isArray(books) || !books.every(validateBook)) return false;
    try {
      db.saveBooks(books);
      return true;
    } catch (err) {
      console.error('[ipc] db:saveBooks failed:', err);
      return false;
    }
  });

  // --- Settings ---
  ipcMain.handle('db:getSetting', (_event, key) => {
    if (typeof key !== 'string') return null;
    try {
      return db.getSetting(key);
    } catch (err) {
      console.error('[ipc] db:getSetting failed:', err);
      return null;
    }
  });

  ipcMain.handle('db:setSetting', (_event, key, value) => {
    if (!isValidSetting(key, value)) return false;
    try {
      db.setSetting(key, value);
      return true;
    } catch (err) {
      console.error('[ipc] db:setSetting failed:', err);
      return false;
    }
  });

  // --- Backup ---
  ipcMain.handle('backup:autoBackup', async (_event, booksJson) => {
    try {
      const fs = await import('fs/promises');
      const backupsDir = path.join(app.getPath('userData'), 'backups');
      await fs.mkdir(backupsDir, { recursive: true });
      const filePath = path.join(backupsDir, `auto-migration-${formatDate()}.json`);
      await fs.writeFile(filePath, booksJson, 'utf-8');
      return { ok: true, filePath };
    } catch (err) {
      console.error('[ipc] backup:autoBackup failed:', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:export', async (_event, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup exportieren',
      defaultPath: `haushaltsbuch-backup-${formatDate()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    try {
      const fs = await import('fs/promises');
      await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { canceled: false, filePath: result.filePath };
    } catch (err) {
      return { canceled: false, error: `Backup konnte nicht gespeichert werden: ${err.message}` };
    }
  });

  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Backup importieren',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };

    try {
      const fs = await import('fs/promises');
      const text = await fs.readFile(result.filePaths[0], 'utf-8');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { canceled: false, error: 'Backup-Datei enthält ungültiges JSON.' };
      }
      return { canceled: false, data: parsed };
    } catch (err) {
      return { canceled: false, error: `Backup-Datei konnte nicht gelesen werden: ${err.message}` };
    }
  });

  // --- App info ---
  ipcMain.handle('app:version', () => app.getVersion());

  // --- Logging ---
  // Renderer errors are forwarded here (fire-and-forget) and appended to a log
  // file under userData/logs, so issues in the packaged app remain diagnosable
  // without an open DevTools console. Never throws — logging must not crash anything.
  ipcMain.on('log:error', async (_event, entry) => {
    try {
      const { context = '', msg = '', extra = '' } = entry || {};
      const fs = await import('fs/promises');
      const logsDir = path.join(app.getPath('userData'), 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      const line = `${new Date().toISOString()} [${context}] ${String(msg)}${extra ? ` ${extra}` : ''}\n`;
      await fs.appendFile(path.join(logsDir, 'renderer-errors.log'), line, 'utf-8');
    } catch (err) {
      console.error('[ipc] log:error failed:', err);
    }
  });

  // --- Updates ---
  ipcMain.handle('updates:check', () => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve({ status: 'error', message: 'Zeitüberschreitung' });
      }, 30000);

      const onAvailable = (info) => {
        clearTimeout(timer);
        cleanup();
        resolve({ status: 'available', version: info.version });
      };
      const onNotAvailable = (info) => {
        clearTimeout(timer);
        cleanup();
        resolve({ status: 'up-to-date', version: info.version });
      };
      const onError = (err) => {
        clearTimeout(timer);
        cleanup();
        resolve({ status: 'error', message: err.message });
      };

      function cleanup() {
        autoUpdater.removeListener('update-available', onAvailable);
        autoUpdater.removeListener('update-not-available', onNotAvailable);
        autoUpdater.removeListener('error', onError);
      }

      autoUpdater.once('update-available', onAvailable);
      autoUpdater.once('update-not-available', onNotAvailable);
      autoUpdater.once('error', onError);

      autoUpdater.checkForUpdates().catch((err) => onError(err));
    });
  });

  ipcMain.handle('updates:getDownloaded', () => {
    return downloadedUpdateInfo ? { version: downloadedUpdateInfo.version } : null;
  });

  ipcMain.handle('updates:download', () => {
    return autoUpdater.downloadUpdate();
  });

  ipcMain.handle('updates:install', () => {
    autoUpdater.quitAndInstall();
  });

  // macOS cannot auto-update without a signed/notarized build (Squirrel.Mac
  // requires a valid code signature). Instead of a download that would always
  // fail there, the renderer sends the user to the GitHub releases page to grab
  // the new .dmg manually.
  ipcMain.handle('updates:openReleasesPage', () => {
    return shell.openExternal('https://github.com/cedi1401/haushaltsbuch/releases');
  });

  // Forward update events to renderer
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdateInfo = info;
    mainWindow?.webContents.send('update-downloaded', info);
  });

}

function formatDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}
