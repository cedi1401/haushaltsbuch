import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getDb } from './database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Haushaltsbuch',
    icon: path.join(__dirname, '../public/icon.png'),
  });

  // Dev or production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();
  createWindow();

  // Auto-updates (only in production)
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }
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
    return db.getBooks();
  });

  ipcMain.handle('db:saveBooks', (_event, books) => {
    db.saveBooks(books);
    return true;
  });

  // --- Settings ---
  ipcMain.handle('db:getSetting', (_event, key) => {
    return db.getSetting(key);
  });

  ipcMain.handle('db:setSetting', (_event, key, value) => {
    db.setSetting(key, value);
    return true;
  });

  // --- Backup ---
  ipcMain.handle('backup:export', async (_event, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup exportieren',
      defaultPath: `haushaltsbuch-backup-${formatDate()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const fs = await import('fs/promises');
    await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Backup importieren',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };

    const fs = await import('fs/promises');
    const text = await fs.readFile(result.filePaths[0], 'utf-8');
    return { canceled: false, data: JSON.parse(text) };
  });

  // --- App info ---
  ipcMain.handle('app:version', () => app.getVersion());

  // --- Updates ---
  ipcMain.handle('updates:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { available: !!result?.updateInfo };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('updates:install', () => {
    autoUpdater.quitAndInstall();
  });

  // Forward update events to renderer
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
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
