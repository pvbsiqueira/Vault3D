const { contextBridge, ipcRenderer } = require('electron');

// Expor API segura para a aplicação renderizada (app.js)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Versão do aplicativo
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Resolução nativa de caminho no disco (dispensa servidor companion no Desktop)
  resolveDiskPath: (folderName, relPath) => ipcRenderer.invoke('resolve-disk-path', { folderName, relPath }),

  // Abrir pasta ou arquivo no Windows Explorer
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),

  // Gerenciamento de Atualização Automática
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  }
});
