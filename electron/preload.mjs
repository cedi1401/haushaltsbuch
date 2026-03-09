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

  // Platform info
  isElectron: true,
});
