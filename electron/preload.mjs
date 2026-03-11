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

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  // Market Data
  fetchMarketPrices: (assets, baseCurrency) =>
    ipcRenderer.invoke('marketdata:fetchPrices', assets, baseCurrency),
  triggerMarketUpdate: () =>
    ipcRenderer.invoke('marketdata:triggerUpdate'),
  overrideMarketPrice: (symbol, price, currency) =>
    ipcRenderer.invoke('marketdata:overridePrice', symbol, price, currency),
  invalidateMarketCaches: () =>
    ipcRenderer.invoke('marketdata:invalidateCaches'),
  onMarketDataUpdated: (callback) => {
    ipcRenderer.on('marketdata:update-complete', (_event, data) => callback(data));
  },

  // Platform info
  isElectron: true,
});
