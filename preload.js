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
  // slicerId opcional: fatiador escolhido no menu do card (sem ele, vale o padrão configurado)
  openInSlicer: (filePath, slicerId) => ipcRenderer.invoke('open-in-slicer', filePath, slicerId),

  // Fatiadores instalados e preferências de qual usar
  listSlicers: (force) => ipcRenderer.invoke('list-slicers', force),
  setSlicerPrefs: (prefs) => ipcRenderer.invoke('set-slicer-prefs', prefs),
  addCustomSlicer: () => ipcRenderer.invoke('add-custom-slicer'),
  removeCustomSlicer: (id) => ipcRenderer.invoke('remove-custom-slicer', id),

  // Renomear arquivo diretamente no disco (Windows)
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', { oldPath, newName }),

  // Mover arquivos para a Lixeira do Windows
  trashFiles: (filePaths) => ipcRenderer.invoke('trash-files', filePaths),
  hashFile: (filePath) => ipcRenderer.invoke('hash-file', filePath),

  // Mover arquivos 3D entre as pastas conectadas
  moveFiles: (items, onConflict) => ipcRenderer.invoke('move-files', { items, onConflict }),

  // Cópia nativa direta para a Área de Transferência do Windows
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Busca nativa dos modelos Em Alta (MakerWorld + MakerOnline)
  fetchTrendingModels: (options) => ipcRenderer.invoke('fetch-trending-models', options),

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
