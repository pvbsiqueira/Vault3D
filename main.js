const { app, BrowserWindow, ipcMain, shell, dialog, session, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const slicers = require('./slicers');
const guards = require('./file-guards');

app.name = 'Vault3D';
slicers.init(app.getPath('userData'));

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
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  // Ocultar barra de menu padrão do Windows para visual limpo estilo app moderno
  mainWindow.setMenuBarVisibility(false);

  // Só as permissões que o app usa (copiar texto, tela cheia do visualizador e pastas no modo web)
  const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'fileSystem']);
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => ALLOWED_PERMISSIONS.has(permission));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));

  // Escutar logs do console da janela para diagnóstico
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Load Error ${errorCode}]: ${errorDescription} (${validatedURL})`);
  });

  // Carregar a aplicação local
  mainWindow.loadFile('app.html');

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

  // Links externos abrem no navegador padrão do sistema. Dentro do app só abre janela para
  // PDFs anexados ao 3MF (endereços blob: gerados pelo próprio app), sem acesso às funções do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (guards.isHttpUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (url.startsWith('blob:file://') || url.startsWith('blob:null/')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { preload: undefined, nodeIntegration: false, contextIsolation: true, sandbox: true }
        }
      };
    }
    return { action: 'deny' };
  });

  // A janela principal nunca sai do app: links http(s) vão para o navegador, o resto é bloqueado
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
    if (guards.isHttpUrl(url)) shell.openExternal(url);
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
  // Instalação silenciosa (sem o assistente do Windows) e reabre o app ao terminar
  autoUpdater.quitAndInstall(true, true);
});

// 4. Abrir no Windows Explorer
ipcMain.handle('open-in-explorer', async (event, targetPath) => {
  if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) return false;
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

// Função auxiliar interna para resolução de caminhos de pastas no disco do Windows
function resolveDiskPathInternal(folderName, relPath = '') {
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
    ...['C', 'D', 'E', 'F', 'G'].map(letter => `${letter}:\\${folderName}`)
  ];

  // Só aceita o palpite quando existe exatamente uma pasta com esse nome (e o arquivo está nela):
  // com duas pastas iguais em lugares diferentes não dá para saber qual é a certa.
  const matches = candidateRoots.filter(root => {
    try {
      if (!fs.statSync(root).isDirectory()) return false;
      return !cleanRel || fs.existsSync(path.join(root, cleanRel));
    } catch (_) {
      return false;
    }
  });
  if (matches.length !== 1) return { success: false, ambiguous: matches.length > 1 };

  const root = matches[0];
  const fullPath = cleanRel ? path.join(root, cleanRel) : root;
  return {
    success: true,
    rootFolder: root,
    folderPath: path.dirname(fullPath) + path.sep,
    fullPath,
    fileName: path.basename(fullPath)
  };
}

// Varredura recursiva nativa ultrarrápida com Node.js fs
async function scanDirectoryDiskRecursive(dirPath, rootPath = dirPath) {
  let results = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanDirectoryDiskRecursive(fullPath, rootPath);
        results = results.concat(sub);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase().replace('.', '');
        if (ext === 'stl' || ext === '3mf') {
          const stats = await fs.promises.stat(fullPath);
          const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
          results.push({
            name: entry.name,
            path: relPath,
            size: stats.size,
            lastModified: Math.round(stats.mtimeMs),
            type: ext,
            fullDiskPath: fullPath
          });
        }
      }
    }
  } catch (err) {
    console.warn(`Erro ao ler pasta ${dirPath}:`, err);
  }
  return results;
}

// 5. Resolução nativa de caminhos no disco do Windows
ipcMain.handle('resolve-disk-path', async (event, { folderName, relPath }) => {
  return resolveDiskPathInternal(folderName, relPath);
});

// 5.1. Varredura nativa completa de pasta no disco
ipcMain.handle('scan-folder-disk', async (event, targetPathOrName) => {
  if (!targetPathOrName) return { success: false, message: 'Caminho não fornecido' };

  let targetFolder = targetPathOrName;
  if (!fs.existsSync(targetFolder)) {
    const resolved = resolveDiskPathInternal(targetPathOrName);
    if (resolved.success && resolved.rootFolder) {
      targetFolder = resolved.rootFolder;
    } else {
      return { success: false, message: 'Pasta não encontrada no disco' };
    }
  }

  try {
    const stat = await fs.promises.stat(targetFolder);
    if (!stat.isDirectory()) {
      return { success: false, message: 'O caminho não é uma pasta' };
    }
    const files = await scanDirectoryDiskRecursive(targetFolder, targetFolder);
    return {
      success: true,
      folderPath: targetFolder,
      folderName: path.basename(targetFolder),
      files
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// 5.2. Leitura nativa de arquivo no disco
ipcMain.handle('read-file', async (event, filePath) => {
  if (!guards.isModelFilePath(filePath)) {
    throw new Error('Apenas arquivos STL e 3MF podem ser lidos');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo não encontrado: ' + filePath);
  }
  return await fs.promises.readFile(filePath);
});

// 5.3. Leitura nativa de fatia/chunk de arquivo no disco
ipcMain.handle('read-file-chunk', async (event, { filePath, start, length } = {}) => {
  if (!guards.isModelFilePath(filePath) || !guards.isValidChunkRequest(start, length)) {
    throw new Error('Leitura de arquivo inválida');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error('Arquivo não encontrado: ' + filePath);
  }
  let fileHandle = null;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fileHandle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    if (fileHandle) await fileHandle.close();
  }
});

// 5.4. Diálogo nativo do Windows para seleção de pasta
ipcMain.handle('select-folder-dialog', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar Pasta de Modelos 3D',
    defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : undefined,
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const folderPath = result.filePaths[0];
  return {
    canceled: false,
    folderPath,
    folderName: path.basename(folderPath)
  };
});

// 6. Abrir arquivo 3D no Fatiador: o escolhido no menu do card ou o padrão do usuário.
// Sem fatiador escolhido, usa o programa associado pelo Windows (comportamento original).
ipcMain.handle('open-in-slicer', async (event, targetPath, slicerId) => {
  // Só arquivos 3D: assim o "abrir com o programa padrão" nunca executa outro tipo de arquivo
  if (!guards.isModelFilePath(targetPath)) return { success: false, message: 'Apenas arquivos STL e 3MF podem ser abertos no fatiador' };
  try {
    if (!fs.existsSync(targetPath)) {
      return { success: false, message: 'Arquivo não encontrado no disco local' };
    }
    const { slicer, reason } = await slicers.resolveSlicerFor(targetPath, slicerId);
    if (slicer && slicer.exePath) {
      try {
        const child = spawn(slicer.exePath, [targetPath], {
          detached: true,
          stdio: 'ignore',
          cwd: path.dirname(slicer.exePath),
          windowsHide: false
        });
        child.on('error', (err) => console.warn('Erro ao iniciar o fatiador:', err));
        child.unref();
        return { success: true, slicerId: slicer.id, slicerName: slicer.name, reason };
      } catch (err) {
        console.warn('Falha ao iniciar o fatiador escolhido, usando o padrão do Windows:', err);
      }
    }
    const errorMsg = await shell.openPath(targetPath);
    if (errorMsg) {
      return { success: false, message: errorMsg };
    }
    return { success: true, slicerId: 'system', slicerName: null, reason: 'system' };
  } catch (e) {
    console.warn('Erro ao abrir no fatiador:', e);
    return { success: false, message: e.message };
  }
});

// 6b. Fatiadores instalados e fatiador padrão
// Cada fatiador vem com o ícone do próprio programa instalado, para o botão mostrar a marca.
const slicerIconCache = new Map();
async function getSlicerIcon(slicer) {
  const cacheKey = slicer.iconPath || slicer.exePath;
  if (!cacheKey) return null;
  if (slicerIconCache.has(cacheKey)) return slicerIconCache.get(cacheKey);
  let url = null;
  try {
    if (slicer.iconPath) {
      // Logo da marca guardado na pasta do fatiador (quando o .exe não tem ícone próprio)
      const img = nativeImage.createFromPath(slicer.iconPath);
      if (img && !img.isEmpty()) url = img.resize({ width: 32, height: 32, quality: 'best' }).toDataURL();
    }
    if (!url && slicer.exePath) {
      const img = await app.getFileIcon(slicer.exePath, { size: 'normal' });
      if (img && !img.isEmpty()) url = img.toDataURL();
    }
  } catch (e) {
    console.warn('Ícone do fatiador indisponível:', cacheKey, e.message);
  }
  slicerIconCache.set(cacheKey, url);
  return url;
}

async function listSlicersWithIcons(force) {
  const res = await slicers.listSlicers(Boolean(force));
  res.slicers = await Promise.all(res.slicers.map(async (s) => ({ ...s, iconUrl: await getSlicerIcon(s) })));
  return res;
}

ipcMain.handle('list-slicers', async (event, force) => {
  try {
    return { success: true, ...(await listSlicersWithIcons(force)) };
  } catch (e) {
    console.warn('Erro ao listar fatiadores:', e);
    return { success: false, message: e.message, slicers: [], defaultId: slicers.SYSTEM_ID };
  }
});

ipcMain.handle('set-slicer-prefs', async (event, prefs) => {
  slicers.setPrefs(prefs || {});
  return { success: true, ...(await listSlicersWithIcons()) };
});

ipcMain.handle('add-custom-slicer', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha o programa do fatiador',
    properties: ['openFile'],
    filters: [{ name: 'Programas', extensions: ['exe'] }]
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return { success: false, canceled: true };
  }
  const entry = slicers.addCustom(result.filePaths[0]);
  return { success: Boolean(entry), added: entry, ...(await listSlicersWithIcons()) };
});

ipcMain.handle('remove-custom-slicer', async (event, id) => {
  slicers.removeCustom(id);
  return { success: true, ...(await listSlicersWithIcons()) };
});

// 7. Renomear arquivo diretamente no disco (Windows)
ipcMain.handle('rename-file', async (event, { oldPath, newName } = {}) => {
  if (!guards.isModelFilePath(oldPath) || !guards.isValidModelFileName(newName)) {
    return { success: false, message: 'Nome inválido: use só letras, números e a extensão .stl ou .3mf' };
  }
  if (!fs.existsSync(oldPath)) {
    return { success: false, message: 'Arquivo original não encontrado no disco' };
  }
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    // Mudar só maiúsculas/minúsculas é permitido (no Windows o "existe" seria o próprio arquivo)
    if (fs.existsSync(newPath) && newPath.toLowerCase() !== oldPath.toLowerCase()) {
      return { success: false, message: 'Já existe um arquivo com esse nome nesta pasta' };
    }
    await fs.promises.rename(oldPath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// 7.0 Hash SHA-256 do arquivo inteiro (confirma cópias idênticas antes de excluir duplicados)
ipcMain.handle('hash-file', async (event, filePath) => {
  if (!guards.isModelFilePath(filePath) || !fs.existsSync(filePath)) return null;
  return new Promise((resolve) => {
    const hash = require('crypto').createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', () => resolve(null));
  });
});

// 7.1 Mover arquivos 3D para a Lixeira do Windows (pode ser desfeito pela própria Lixeira)
ipcMain.handle('trash-files', async (event, filePaths) => {
  const list = Array.isArray(filePaths) ? filePaths : [];
  const results = [];
  for (const filePath of list) {
    if (!guards.isModelFilePath(filePath)) {
      results.push({ path: filePath, success: false, message: 'Apenas arquivos STL e 3MF podem ser excluídos' });
      continue;
    }
    if (!fs.existsSync(filePath)) {
      // Já não está no disco: tratamos como excluído para limpar a biblioteca
      results.push({ path: filePath, success: true, missing: true });
      continue;
    }
    try {
      await shell.trashItem(path.normalize(filePath));
      results.push({ path: filePath, success: true });
    } catch (err) {
      results.push({ path: filePath, success: false, message: err.message });
    }
  }
  return results;
});

// 7.2 Mover arquivos 3D entre as pastas conectadas (nunca sobrescreve um arquivo existente)
function nextFreeName(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  return null;
}

async function moveFileAcrossDrives(from, to) {
  // Outra unidade: copia, confere o tamanho e só então apaga o original
  await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
  try {
    const [src, dst] = await Promise.all([fs.promises.stat(from), fs.promises.stat(to)]);
    if (src.size !== dst.size) throw new Error('A cópia ficou incompleta');
  } catch (err) {
    await fs.promises.unlink(to).catch(() => {});
    throw err;
  }
  await fs.promises.unlink(from);
}

ipcMain.handle('move-files', async (event, { items, onConflict } = {}) => {
  const list = Array.isArray(items) ? items : [];
  const results = [];
  for (const item of list) {
    const from = item && typeof item.from === 'string' ? path.normalize(item.from) : '';
    const toDir = item && typeof item.toDir === 'string' ? path.normalize(item.toDir) : '';
    const wanted = item && typeof item.newName === 'string' && item.newName ? item.newName : path.basename(from);
    const result = { from: item && item.from, success: false };
    results.push(result);

    if (!guards.isModelFilePath(from) || !guards.isValidModelFileName(wanted)) {
      result.message = 'Apenas arquivos STL e 3MF podem ser movidos';
      continue;
    }
    if (!toDir || !path.isAbsolute(toDir)) {
      result.message = 'Pasta de destino inválida';
      continue;
    }
    if (!fs.existsSync(from)) {
      result.message = 'Arquivo não encontrado no disco';
      continue;
    }
    try {
      await fs.promises.mkdir(toDir, { recursive: true });
      let newName = wanted;
      let to = path.join(toDir, newName);
      if (to.toLowerCase() === from.toLowerCase()) {
        result.message = 'O arquivo já está nessa pasta';
        continue;
      }
      if (fs.existsSync(to)) {
        if (onConflict !== 'rename') {
          result.skipped = true;
          result.message = 'Já existe um arquivo com esse nome no destino';
          continue;
        }
        newName = nextFreeName(toDir, wanted);
        if (!newName) {
          result.message = 'Não foi possível encontrar um nome livre no destino';
          continue;
        }
        to = path.join(toDir, newName);
      }
      try {
        await fs.promises.rename(from, to);
      } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        await moveFileAcrossDrives(from, to);
      }
      const stats = await fs.promises.stat(to);
      Object.assign(result, {
        success: true,
        newPath: to,
        newName,
        size: stats.size,
        lastModified: Math.round(stats.mtimeMs)
      });
    } catch (err) {
      result.message = err.message;
    }
  }
  return results;
});

// 8. Cópia direta para a Área de Transferência nativa do Windows
ipcMain.handle('copy-to-clipboard', (event, text) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
    return true;
  }
  return false;
});

// 8.1 Consulta à API pública do MakerOnline para os detalhes do 3MF (autor, licença, fotos).
// Feita aqui porque a janela não pode chamar outros sites direto (bloqueio de CORS).
ipcMain.handle('fetch-makeronline-json', async (event, url, options = {}) => {
  if (!guards.isAllowedMakerOnlineUrl(url)) return null;
  const method = options && options.method === 'POST' ? 'POST' : 'GET';
  const body = method === 'POST' && typeof options.body === 'string' ? options.body : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
});

// 9. Busca dos modelos Em Alta (Top 5 em 48h, 7 dias e 15 dias) no MakerWorld e MakerOnline
let trendingCache = null;
let trendingFetchPromise = null;
const TRENDING_CACHE_TTL = 15 * 60 * 1000; // 15 minutos

async function fetchMakerOnlineAllRanges() {
  const emptyRanges = { '48h': [], '7d': [], '15d': [] };
  try {
    const fetchPage = (page) =>
      fetch('https://www.makeronline.com/api/search/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          page,
          page_size: 50,
          keyword: '',
          category_id: 0,
          print_type: 0,
          order: 'submit_at_desc'
        })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j && j.data && Array.isArray(j.data.data) ? j.data.data : []))
        .catch(() => []);

    // Duas ondas paralelas de 35 páginas (3.500 modelos recentes cobrindo ~15 dias)
    const wave1 = await Promise.all(Array.from({ length: 35 }, (_, i) => fetchPage(i + 1)));
    const wave2 = await Promise.all(Array.from({ length: 35 }, (_, i) => fetchPage(i + 36)));
    const pages = [...wave1, ...wave2];

    const seen = new Set();
    const allRecent = [];
    for (const list of pages) {
      for (const item of list) {
        if (!item || !item.mold_id || item.is_adult_nsfw) continue;
        if (seen.has(item.mold_id)) continue;
        seen.add(item.mold_id);
        allRecent.push(item);
      }
    }

    const now = Date.now();
    const parseMoTime = (str) => {
      if (!str || typeof str !== 'string') return 0;
      const iso = str.includes('T') ? str : str.replace(' ', 'T') + '+08:00';
      const t = Date.parse(iso);
      return Number.isNaN(t) ? 0 : t;
    };

    const buildTopForHours = (hours) => {
      const cutoff = now - hours * 3600 * 1000;
      let pool = allRecent.filter((m) => {
        const t = parseMoTime(m.publish_time);
        return t > 0 ? t >= cutoff : true;
      });
      if (pool.length < 25) {
        pool = allRecent;
      }
      const sorted = pool.slice().sort((a, b) =>
        (Number(b.download_num) || 0) - (Number(a.download_num) || 0) ||
        (Number(b.like_num) || 0) - (Number(a.like_num) || 0)
      );
      return sorted.slice(0, 25).map((m, idx) => {
        const pubMs = parseMoTime(m.publish_time);
        const slug = String(m.title || 'model')
          .trim()
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'model';
        return {
          rank: idx + 1,
          id: String(m.mold_id),
          site: 'makeronline',
          title: m.title || `Modelo #${m.mold_id}`,
          cover: m.mold_image || '',
          downloads: Number(m.download_num) || 0,
          likes: Number(m.like_num) || 0,
          prints: 0,
          author: m.user_display_name || m.user_name || 'MakerOnline',
          authorAvatar: m.user_avatar || '',
          publishedAt: pubMs ? new Date(pubMs).toISOString() : '',
          url: m.target_url || `https://www.makeronline.com/en/model/${slug}/${m.mold_id}.html`
        };
      });
    };

    return {
      '48h': buildTopForHours(48),
      '7d': buildTopForHours(7 * 24),
      '15d': buildTopForHours(15 * 24)
    };
  } catch (err) {
    console.warn('Erro ao buscar Em Alta do MakerOnline:', err);
    return emptyRanges;
  }
}

async function fetchMakerWorldAllRanges() {
  const emptyRanges = { '48h': [], '7d': [], '15d': [] };
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1100,
      height: 750,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    win.webContents.setAudioMuted(true);

    const domReadyPromise = new Promise((resolve) => {
      win.webContents.once('dom-ready', resolve);
    });

    const loadPromise = win.loadURL('https://makerworld.com/pt/3d-models', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }).catch(() => {});

    await Promise.race([
      domReadyPromise,
      loadPromise,
      new Promise((resolve) => setTimeout(resolve, 7500))
    ]);

    // Pequena pausa para garantir que __NEXT_DATA__ esteja disponível no DOM
    await new Promise((r) => setTimeout(r, 700));

    const rawList = await Promise.race([
      win.webContents.executeJavaScript(`
        (async () => {
          const collected = [];
          try {
            const ndDesigns = window.__NEXT_DATA__?.props?.pageProps?.designs;
            if (Array.isArray(ndDesigns)) collected.push(...ndDesigns);
          } catch (_) {}
          const fetchPage = async (url) => {
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 2800);
              const r = await fetch(url, { signal: ctrl.signal });
              clearTimeout(timer);
              if (!r.ok) return [];
              const j = await r.json();
              return Array.isArray(j?.hits) ? j.hits : [];
            } catch (_) {
              return [];
            }
          };
          const [hot0, hot1, new0, new1] = await Promise.all([
            fetchPage('/api/v1/search-service/select/design2?orderBy=hotScore&limit=100&offset=0'),
            fetchPage('/api/v1/search-service/select/design2?orderBy=hotScore&limit=100&offset=100'),
            fetchPage('/api/v1/search-service/select/design2?orderBy=newUploads&limit=100&offset=0'),
            fetchPage('/api/v1/search-service/select/design2?orderBy=newUploads&limit=100&offset=100')
          ]);
          collected.push(...hot0, ...hot1, ...new0, ...new1);
          return collected;
        })()
      `),
      new Promise((resolve) => setTimeout(() => resolve([]), 5000))
    ]);

    const seen = new Set();
    const items = [];
    for (const entry of Array.isArray(rawList) ? rawList : []) {
      const d = entry && entry.design ? entry.design : entry;
      if (!d || !d.id || d.nsfw) continue;
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      items.push(d);
    }

    const now = Date.now();
    const buildTopForHours = (hours) => {
      const cutoff = now - hours * 3600 * 1000;
      let pool = items.filter((d) => {
        const t = d.createTime ? Date.parse(d.createTime) : 0;
        return t > 0 && t >= cutoff;
      });
      if (pool.length < 25) {
        const fallbackCutoff = now - Math.max(hours * 2, 96) * 3600 * 1000;
        const poolFallback = items.filter((d) => {
          const t = d.createTime ? Date.parse(d.createTime) : 0;
          return t > 0 && t >= fallbackCutoff;
        });
        pool = poolFallback.length >= 25 ? poolFallback : items;
      }

      const sorted = pool.slice().sort((a, b) =>
        (Number(b.downloadCount) || 0) - (Number(a.downloadCount) || 0) ||
        (Number(b.likeCount) || 0) - (Number(a.likeCount) || 0)
      );

      return sorted.slice(0, 25).map((d, idx) => {
        const slugPart = d.slug ? `-${d.slug}` : '';
        return {
          rank: idx + 1,
          id: String(d.id),
          site: 'makerworld',
          title: d.titleTranslated || d.title || `Modelo #${d.id}`,
          originalTitle: d.title || '',
          cover: d.cover || d.coverPortrait || '',
          downloads: Number(d.downloadCount) || 0,
          likes: Number(d.likeCount) || 0,
          prints: Number(d.printCount) || 0,
          author: (d.designCreator && (d.designCreator.name || d.designCreator.handle)) || 'MakerWorld',
          authorAvatar: (d.designCreator && d.designCreator.avatar) || '',
          publishedAt: d.createTime || '',
          url: `https://makerworld.com/pt/models/${d.id}${slugPart}`
        };
      });
    };

    return {
      '48h': buildTopForHours(48),
      '7d': buildTopForHours(7 * 24),
      '15d': buildTopForHours(15 * 24)
    };
  } catch (err) {
    console.warn('Erro ao buscar Em Alta do MakerWorld:', err);
    return emptyRanges;
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

ipcMain.handle('fetch-trending-models', async (event, options = {}) => {
  const force = Boolean(options && options.force);
  const reqRange = ['48h', '7d', '15d'].includes(options?.range) ? options.range : '48h';

  if (!force && trendingCache && Date.now() - trendingCache.updatedAt < TRENDING_CACHE_TTL) {
    const rData = trendingCache.ranges?.[reqRange] || {
      makerWorld: trendingCache.makerWorld || [],
      makerOnline: trendingCache.makerOnline || []
    };
    return {
      ...trendingCache,
      makerWorld: rData.makerWorld,
      makerOnline: rData.makerOnline,
      makerworld: rData.makerWorld,
      makeronline: rData.makerOnline
    };
  }

  if (trendingFetchPromise) {
    return trendingFetchPromise;
  }

  trendingFetchPromise = (async () => {
    try {
      const [mwRanges, moRanges] = await Promise.all([
        fetchMakerWorldAllRanges(),
        fetchMakerOnlineAllRanges()
      ]);
      const ranges = {
        '48h': { makerWorld: mwRanges['48h'] || [], makerOnline: moRanges['48h'] || [] },
        '7d': { makerWorld: mwRanges['7d'] || [], makerOnline: moRanges['7d'] || [] },
        '15d': { makerWorld: mwRanges['15d'] || [], makerOnline: moRanges['15d'] || [] }
      };
      const active = ranges[reqRange] || ranges['48h'];
      const result = {
        success: active.makerWorld.length > 0 || active.makerOnline.length > 0,
        ranges,
        makerWorld: active.makerWorld,
        makerOnline: active.makerOnline,
        makerworld: active.makerWorld,
        makeronline: active.makerOnline,
        updatedAt: Date.now()
      };
      if (result.success) {
        trendingCache = result;
      }
      return result;
    } finally {
      trendingFetchPromise = null;
    }
  })();

  return trendingFetchPromise;
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
