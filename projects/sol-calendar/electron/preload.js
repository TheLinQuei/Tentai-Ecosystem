// Electron preload script - Bridge between main and renderer
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  saveFile: (filename, content) => ipcRenderer.invoke('save-file', { filename, content }),
  openFile: () => ipcRenderer.invoke('open-file'),
  
  // Navigation listeners
  onNavigateTo: (callback) => ipcRenderer.on('navigate-to', (event, view) => callback(view)),
  onTriggerExport: (callback) => ipcRenderer.on('trigger-export', callback),
  onTriggerImport: (callback) => ipcRenderer.on('trigger-import', callback),
  
  // Platform info
  platform: process.platform,
  isElectron: true
});
