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

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
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

  // Platform info
  isElectron: true,
});
