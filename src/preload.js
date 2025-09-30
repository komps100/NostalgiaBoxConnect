const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectOutputPath: () => ipcRenderer.invoke('select-output-path'),
  updateNamingConvention: (convention) => ipcRenderer.invoke('update-naming-convention', convention),
  updateRouterIP: (ip) => ipcRenderer.invoke('update-router-ip', ip),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  captureStill: () => ipcRenderer.invoke('capture-still'),
  switchInput: (input, output) => ipcRenderer.invoke('switch-input', input, output),
  detectDevices: () => ipcRenderer.invoke('detect-devices'),
  selectDevice: (device) => ipcRenderer.invoke('select-device', device),
  setFramerate: (framerate) => ipcRenderer.invoke('set-framerate', framerate)
});