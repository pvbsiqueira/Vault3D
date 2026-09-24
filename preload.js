const { contextBridge, ipcRenderer } = require('electron');

// Expor API segura para a aplicação renderizada (app.js)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Versão do aplicativo
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Resolução nativa de caminho no disco (dispensa servidor companion no Desktop)
  resolveDiskPath: (folderName, relPath) => ipcRenderer.invoke('resolve-disk-path', { folderName, relPath }),

  // Varredura nativa completa de pasta no disco
  scanFolderDisk: (folderPathOrName) => ipcRenderer.invoke('scan-folder-disk', folderPathOrName),

  // Leitura nativa de arquivo no disco
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // Leitura nativa de fatia/chunk de arquivo no disco
  readFileChunk: (filePath, start, length) => ipcRenderer.invoke('read-file-chunk', { filePath, start, length }),

  // Diálogo nativo de seleção de pasta no Windows
  selectFolderDialog: (defaultPath) => ipcRenderer.invoke('select-folder-dialog', defaultPath),

  // Abrir pasta ou arquivo no Windows Explorer
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),

  // Abrir arquivo 3D diretamente no Fatiador associado (Bambu Studio, OrcaSlicer, Cura, etc.)
  openInSlicer: (filePath) => ipcRenderer.invoke('open-in-slicer', filePath),

  // Gerenciamento de Atualização Automática
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartAndInstallUpdate: () => ipcRenderer.invoke('restart-and-install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },

  // Ouvinte de Deep Links para login automático (vault3d://)
  onAuthDeepLink: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (event, url) => callback(url);
    ipcRenderer.on('auth-deep-link', listener);
    return () => ipcRenderer.removeListener('auth-deep-link', listener);
  }
});
