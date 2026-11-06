const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleExpand: (expand) => ipcRenderer.invoke('toggle-expand', expand),
  dragStart: () => ipcRenderer.invoke('drag-start'),
  dragEnd: () => ipcRenderer.invoke('drag-end'),
  onViewChange: (callback) => ipcRenderer.on('view-change', (event, view) => callback(view)),
  quitApp: () => ipcRenderer.invoke('quit-app'),
});