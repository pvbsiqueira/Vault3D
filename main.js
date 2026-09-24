const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

app.name = 'Vault3D';

const PROTOCOL_PREFIX = 'vault3d';

// Registrar como handler padrão do protocolo vault3d:// (deep link)
try {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_PREFIX);
  }
} catch (err) {
  console.warn('Aviso ao registrar protocolo:', err);
}

// Configurações do Auto-Updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

let mainWindow = null;

function sendDeepLinkToWindow(url) {
  if (!url || !mainWindow) return;
  mainWindow.webContents.send('auth-deep-link', url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0e17',
    show: true,
    title: 'Vault3D - Gerenciador 3D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Permite carregar recursos remotos (Three.js via CDN) e blobs locais
    }
  });

  // Ocultar barra de menu padrão do Windows para visual limpo estilo app moderno
  mainWindow.setMenuBarVisibility(false);

  // Escutar logs do console da janela para diagnóstico
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Load Error ${errorCode}]: ${errorDescription} (${validatedURL})`);
  });

  // Carregar a aplicação local
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Em ambiente de produção empacotado, verificar atualizações automaticamente na inicialização
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
          console.warn('Verificação de atualização silenciosa:', err ? err.message : err);
        });
      }, 3000); // 3 segundos após abrir para não disputar I/O de inicialização
    }

    // Se o aplicativo foi iniciado diretamente por um link vault3d:// (cold start)
    const initialDeepLink = process.argv.find(arg => arg.startsWith(`${PROTOCOL_PREFIX}://`));
    if (initialDeepLink) {
      setTimeout(() => {
        sendDeepLinkToWindow(initialDeepLink);
      }, 1000);
    }
  });

  // Garantir que a janela seja exibida mesmo em máquinas com renderização atrasada
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1200);

  // Interceptar cliques em links externos para abrir no navegador padrão do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==========================================
// Eventos de Atualização Automática (electron-updater)
// ==========================================
function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', { 
    version: info.version, 
    releaseDate: info.releaseDate 
  });
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus('not-available', { 
    version: info.version 
  });
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus('downloading', {
    percent: Math.round(progressObj.percent || 0),
    transferred: progressObj.transferred,
    total: progressObj.total,
    bytesPerSecond: progressObj.bytesPerSecond
  });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', { 
    version: info.version 
  });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { 
    message: err ? err.message : 'Falha ao verificar atualização.' 
  });
});

// ==========================================
// Handlers IPC (Comunicação com a Interface)
// ==========================================

// 1. Obter a versão do aplicativo
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 2. Forçar verificação de atualizações
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { success: false, message: 'Auto-update desativado em ambiente de desenvolvimento local.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// 3. Reiniciar o app e aplicar a atualização baixada
ipcMain.handle('restart-and-install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

// 4. Abrir no Windows Explorer
ipcMain.handle('open-in-explorer', async (event, targetPath) => {
  if (!targetPath) return false;
  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        shell.showItemInFolder(targetPath);
      } else {
        shell.openPath(targetPath);
      }
      return true;
    }
  } catch (e) {
    console.warn('Erro ao abrir no Explorer:', e);
  }
  return false;
});

// 5. Resolução nativa de caminhos no disco do Windows
ipcMain.handle('resolve-disk-path', async (event, { folderName, relPath }) => {
  if (!folderName) return { success: false };

  const cleanRel = (relPath || '').replace(/\//g, path.sep);
  const home = app.getPath('home');

  // Pastas candidatas comuns no Windows
  const candidateRoots = [
    path.join(home, 'Downloads', folderName),
    path.join(home, 'Desktop', folderName),
    path.join(home, 'Documents', folderName),
    path.join(home, '3D Objects', folderName),
    path.join(home, folderName),
    path.join(process.cwd(), folderName)
  ];

  // Testar primeiro as candidatas diretas
  for (const root of candidateRoots) {
    if (fs.existsSync(root)) {
      const fullPath = cleanRel ? path.join(root, cleanRel) : root;
      return {
        success: true,
        rootFolder: root,
        folderPath: path.dirname(fullPath) + path.sep,
        fullPath: fullPath
      };
    }
  }

  // Tentar raízes de unidades comuns (C:\, D:\, E:\, etc.)
  const letters = ['C', 'D', 'E', 'F', 'G'];
  for (const letter of letters) {
    const rootDrive = `${letter}:\\${folderName}`;
    if (fs.existsSync(rootDrive)) {
      const fullPath = cleanRel ? path.join(rootDrive, cleanRel) : rootDrive;
      return {
        success: true,
        rootFolder: rootDrive,
        folderPath: path.dirname(fullPath) + path.sep,
        fullPath: fullPath
      };
    }
  }

  return { success: false };
});

// ==========================================
// Ciclo de Vida do Aplicativo e Instância Única
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock && app.isPackaged) {
  // Em produção empacotada, encerra a duplicata
  app.quit();
} else {
  // Quando outra instância tenta rodar ou quando o usuário clica num deep link vault3d:// no navegador
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const deepLinkUrl = commandLine.find(arg => arg.startsWith(`${PROTOCOL_PREFIX}://`));
    if (deepLinkUrl) {
      sendDeepLinkToWindow(deepLinkUrl);
    }
  });

  app.whenReady().then(createWindow);
}

// Handler de Deep Link no macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  sendDeepLinkToWindow(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
