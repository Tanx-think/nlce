const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleExpand: (expand) => ipcRenderer.invoke('toggle-expand', expand),
  dragStart: () => ipcRenderer.invoke('drag-start'),
  dragEnd: () => ipcRenderer.invoke('drag-end'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  checkConfig: () => ipcRenderer.invoke('check-config'),
  checkEda: () => ipcRenderer.invoke('check-eda'),
  saveAndTestConfig: (config) => ipcRenderer.invoke('save-and-test-config', config),
  startBackend: () => ipcRenderer.invoke('start-backend'),
  resizeWindow: (mode) => ipcRenderer.invoke('resize-window', mode),
  onViewChange: (callback) => ipcRenderer.on('view-change', (event, view) => callback(view)),
});