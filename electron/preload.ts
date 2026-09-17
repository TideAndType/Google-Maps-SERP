import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getVersion: () => ipcRenderer.invoke('get-version'),

  onUpdateAvailable: (callback: (_event: any, info: any) => void) => {
    ipcRenderer.on('update-available', callback);
    return () => ipcRenderer.removeListener('update-available', callback);
  },
  onUpdateProgress: (callback: (_event: any, progress: any) => void) => {
    ipcRenderer.on('download-progress', callback);
    return () => ipcRenderer.removeListener('download-progress', callback);
  },
  onUpdateDownloaded: (callback: (_event: any) => void) => {
    ipcRenderer.on('update-downloaded', callback);
    return () => ipcRenderer.removeListener('update-downloaded', callback);
  },

  // Playwright status
  onPlaywrightStatus: (callback: (_event: any, status: any) => void) => {
    ipcRenderer.on('playwright-status', callback);
    return () => ipcRenderer.removeListener('playwright-status', callback);
  },

  // Utility
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),

  // Maintenance
  clearCache: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('clear-cache'),
});
