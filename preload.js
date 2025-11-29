const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer (if needed)
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (msg) => ipcRenderer.send('message', msg),
  onMessage: (callback) => ipcRenderer.on('message', (event, msg) => callback(msg)),
});
