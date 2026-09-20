import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Books (full JSON, same structure as localStorage)
  getBooks: () => ipcRenderer.invoke('db:getBooks'),
  saveBooks: (books) => ipcRenderer.invoke('db:saveBooks', books),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
  setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),

  // Backup (native file dialogs)
  exportBackup: (data) => ipcRenderer.invoke('backup:export', data),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  createAutoBackup: (booksJson) => ipcRenderer.invoke('backup:autoBackup', booksJson),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Logging (fire-and-forget: renderer errors forwarded to a file for diagnostics)
  logError: (entry) => ipcRenderer.send('log:error', entry),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  openReleasesPage: () => ipcRenderer.invoke('updates:openReleasesPage'),
  getDownloadedUpdate: () => ipcRenderer.invoke('updates:getDownloaded'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  // Marktdaten — Abruf läuft bewusst im Main-Prozess:
  // im Renderer blockiert die Production-CSP externe Requests und der
  // nötige User-Agent-Header lässt sich dort nicht setzen.
  marketdata: {
    quote: (symbol, targetCurrency, options) => ipcRenderer.invoke('market:quote', symbol, targetCurrency, options),
    quotes: (symbols, targetCurrency, options) => ipcRenderer.invoke('market:quotes', symbols, targetCurrency, options),
    history: (symbol, options) => ipcRenderer.invoke('market:history', symbol, options),
    search: (query) => ipcRenderer.invoke('market:search', query),
  },

  // Platform info
  isElectron: true,
  platform: process.platform,
});
