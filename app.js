import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { generateSTLThumbnail, extract3MFThumbnail, parse3MFGeometry } from './thumbnail-generator.js';
import { parseSTL } from './stl-parser.js';

// Estado global da aplicação
const state = {
  models: [],
  folders: [], // Array de { id, name, handle, count }
  activeFilter: 'all',
  searchQuery: '',
  modalScene: null,
  modalCamera: null,
  modalRenderer: null,
  modalControls: null,
  modalMesh: null,
  modalAnimId: null,
  isAutoRotating: true,
  isWireframe: false,
  activeModel: null,
  activePlateId: 1,
  currentViewerMode: '3d',
  isMeshLoaded: false
};

// Elementos DOM
const btnSelectFolder = document.getElementById('btnSelectFolder');
const btnEmptySelectFolder = document.getElementById('btnEmptySelectFolder');
const folderInputFallback = document.getElementById('folderInputFallback');
const btnLoadSample = document.getElementById('btnLoadSample');
const dropZone = document.getElementById('dropZone');
const savedFoldersCard = document.getElementById('savedFoldersCard');
const savedFoldersCount = document.getElementById('savedFoldersCount');
const savedFoldersPreviewList = document.getElementById('savedFoldersPreviewList');
const btnReconnectAllFolders = document.getElementById('btnReconnectAllFolders');
const btnClearSavedFolders = document.getElementById('btnClearSavedFolders');
const galleryContainer = document.getElementById('galleryContainer');
const favoritesSection = document.getElementById('favoritesSection');
const favoritesGrid = document.getElementById('favoritesGrid');
const favoritesCountBadge = document.getElementById('favoritesCountBadge');
const allSection = document.getElementById('allSection');
const allSectionHeader = document.getElementById('allSectionHeader');
const allCountBadge = document.getElementById('allCountBadge');
const modelsGrid = document.getElementById('modelsGrid');
const subToolbar = document.getElementById('subToolbar');
const foldersChipsList = document.getElementById('foldersChipsList');
const btnAddFolderChip = document.getElementById('btnAddFolderChip');
const fileCountBadge = document.getElementById('fileCountBadge');
const btnFilterDuplicates = document.getElementById('btnFilterDuplicates');
const duplicatesCountBadge = document.getElementById('duplicatesCountBadge');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.pill-btn');

// Modal DOM
const viewerModal = document.getElementById('viewerModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalFileName = document.getElementById('modalFileName');
const modalBadge = document.getElementById('modalBadge');
const modalDuplicateBadge = document.getElementById('modalDuplicateBadge');
const modalCanvas = document.getElementById('modalCanvas');
const btnResetView = document.getElementById('btnResetView');
const btnToggleRotate = document.getElementById('btnToggleRotate');
const btnToggleWireframe = document.getElementById('btnToggleWireframe');

// Elementos de Mesas de Impressão (Plates) e Modos de Visualização
// Elementos de Mesas de Impressão (Plates) e Modos de Visualização
const btnOpen3DView = document.getElementById('btnOpen3DView');
const btnBackToPlate = document.getElementById('btnBackToPlate');
const modalPlateImg = document.getElementById('modalPlateImg');
const viewerLoadingOverlay = document.getElementById('viewerLoadingOverlay');
const viewerLoadingText = document.getElementById('viewerLoadingText');
const viewerControlsBar = document.getElementById('viewerControlsBar');
const modalSidebar = document.getElementById('modalSidebar');
const platesSection = document.getElementById('platesSection');
const platesCount = document.getElementById('platesCount');
const platesList = document.getElementById('platesList');

// Inicialização de Eventos
function init() {
  btnSelectFolder.addEventListener('click', handleChooseFolder);
  btnEmptySelectFolder.addEventListener('click', handleChooseFolder);
  if (btnAddFolderChip) {
    btnAddFolderChip.addEventListener('click', handleChooseFolder);
  }
  folderInputFallback.addEventListener('change', handleFallbackFileSelect);
  btnLoadSample.addEventListener('click', loadSampleModels);

  // Busca e Filtros
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderGallery();
  });

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter;
      renderGallery();
    });
  });

  // Drag & Drop na Dropzone e na página
  setupDragAndDrop();

  // Modal Controls
  modalCloseBtn.addEventListener('click', closeViewerModal);
  viewerModal.addEventListener('click', (e) => {
    if (e.target === viewerModal) closeViewerModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewerModal.classList.contains('active')) {
      closeViewerModal();
    }
  });

  btnResetView.addEventListener('click', resetModalCamera);
  btnToggleRotate.addEventListener('click', () => {
    state.isAutoRotating = !state.isAutoRotating;
    btnToggleRotate.style.color = state.isAutoRotating ? '#38bdf8' : 'var(--text-secondary)';
  });
  btnToggleWireframe.addEventListener('click', () => {
    if (state.modalMesh) {
      state.isWireframe = !state.isWireframe;
      state.modalMesh.material.wireframe = state.isWireframe;
      btnToggleWireframe.style.color = state.isWireframe ? '#38bdf8' : 'var(--text-secondary)';
    }
  });

  // Botões flutuantes: Abrir 3D e Retornar à foto da mesa
  if (btnOpen3DView) {
    btnOpen3DView.addEventListener('click', () => setViewerMode('3d'));
  }
  if (btnBackToPlate) {
    btnBackToPlate.addEventListener('click', () => setViewerMode('plate'));
  }

  // Botões de reconexão de pastas salvas do IndexedDB
  if (btnReconnectAllFolders) {
    btnReconnectAllFolders.addEventListener('click', reconnectAllSavedFolders);
  }
  if (btnClearSavedFolders) {
    btnClearSavedFolders.addEventListener('click', async () => {
      await clearAllFoldersFromDB();
      if (savedFoldersCard) savedFoldersCard.style.display = 'none';
      showToast('Histórico de pastas salvas limpo com sucesso.');
    });
  }

  // Verificar e tentar restaurar pastas salvas do IndexedDB
  checkAndRestoreSavedFolders();
}

/**
 * Abre o seletor de pasta usando File System Access API nativo (Chrome/Edge)
 * ou recorre ao input clássico com suporte a diretório
 */
async function handleChooseFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      if (state.folders.some(f => f.name === dirHandle.name)) {
        showToast(`A pasta "${dirHandle.name}" já está na biblioteca.`, 'warning');
        return;
      }
      const files = await scanDirectoryHandle(dirHandle);
      addFilesToLibrary(files, dirHandle.name, dirHandle);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Erro ao abrir pasta com showDirectoryPicker, tentando fallback:', err);
        folderInputFallback.click();
      }
    }
  } else {
    folderInputFallback.click();
  }
}

/**
 * Varre recursivamente diretórios com a File System Access API
 */
async function scanDirectoryHandle(dirHandle, path = '') {
  let results = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (ext === 'stl' || ext === '3mf') {
        const file = await entry.getFile();
        results.push({
          file,
          name: entry.name,
          size: file.size,
          type: ext,
          path: path ? `${path}/${entry.name}` : entry.name,
          handle: entry,
          parentHandle: dirHandle
        });
      }
    } else if (entry.kind === 'directory') {
      try {
        const subFiles = await scanDirectoryHandle(entry, path ? `${path}/${entry.name}` : entry.name);
        results = results.concat(subFiles);
      } catch (e) {
        console.warn('Não foi possível ler subpasta:', entry.name, e);
      }
    }
  }
  return results;
}

/**
 * Trata seleção via input fallback (webkitdirectory)
 */
function handleFallbackFileSelect(e) {
  const fileList = Array.from(e.target.files);
  const validFiles = fileList
    .filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ext === 'stl' || ext === '3mf';
    })
    .map(file => ({
      file,
      name: file.name,
      size: file.size,
      type: file.name.split('.').pop().toLowerCase(),
      path: file.webkitRelativePath || file.name
    }));

  const rootName = fileList[0]?.webkitRelativePath?.split('/')[0] || 'Pasta Selecionada';
  if (state.folders.some(f => f.name === rootName)) {
    showToast(`A pasta "${rootName}" já está na biblioteca.`, 'warning');
    e.target.value = '';
    return;
  }
  addFilesToLibrary(validFiles, rootName);
  e.target.value = '';
}

/**
 * Configura suporte a arrastar e soltar pastas
 */
function setupDragAndDrop() {
  ['dragenter', 'dragover'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const files = [];
    let rootName = 'Arquivos Arrastados';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.getAsFileSystemHandle) {
        const handle = await item.getAsFileSystemHandle();
        if (handle.kind === 'directory') {
          rootName = handle.name;
          const scanned = await scanDirectoryHandle(handle);
          files.push(...scanned);
        } else if (handle.kind === 'file') {
          const ext = handle.name.split('.').pop().toLowerCase();
          if (ext === 'stl' || ext === '3mf') {
            const f = await handle.getFile();
            files.push({ file: f, name: handle.name, size: f.size, type: ext, path: handle.name, handle });
          }
        }
      } else {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          rootName = entry.name;
          await scanWebkitEntry(entry, files);
        }
      }
    }

    if (files.length > 0) {
      if (state.folders.some(f => f.name === rootName)) {
        showToast(`A pasta "${rootName}" já está na biblioteca.`, 'warning');
        return;
      }
      addFilesToLibrary(files, rootName);
    }
  });
}

async function scanWebkitEntry(entry, results, path = '') {
  if (entry.isFile) {
    const ext = entry.name.split('.').pop().toLowerCase();
    if (ext === 'stl' || ext === '3mf') {
      const file = await new Promise(resolve => entry.file(resolve));
      results.push({
        file,
        name: entry.name,
        size: file.size,
        type: ext,
        path: path ? `${path}/${entry.name}` : entry.name
      });
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise(resolve => reader.readEntries(resolve));
    for (const sub of entries) {
      await scanWebkitEntry(sub, results, path ? `${path}/${entry.name}` : entry.name);
    }
  }
}

/**
 * Carrega os modelos de exemplo incluídos para teste imediato
 */
async function loadSampleModels(persistToDB = true) {
  btnLoadSample.disabled = true;
  btnLoadSample.textContent = 'Carregando exemplos...';

  try {
    const samples = [
      { name: 'cubo_calibracao_20mm.stl', url: './sample_models/cubo_calibracao_20mm.stl', type: 'stl' },
      { name: 'piramide_teste.stl', url: './sample_models/piramide_teste.stl', type: 'stl' },
      { name: 'caixa_organizadora_fatiada.3mf', url: './sample_models/caixa_organizadora_fatiada.3mf', type: '3mf' }
    ];

    const loadedFiles = [];
    for (const sample of samples) {
      const res = await fetch(sample.url);
      const blob = await res.blob();
      const file = new File([blob], sample.name);
      loadedFiles.push({
        file,
        name: sample.name,
        size: blob.size,
        type: sample.type,
        path: sample.name
      });
    }

    const sampleFolderName = 'Modelos de Exemplo (sample_models)';
    if (state.folders.some(f => f.name === sampleFolderName)) {
      showToast(`A pasta de exemplos já está na biblioteca.`, 'info');
      return;
    }
    await addFilesToLibrary(loadedFiles, sampleFolderName, null, persistToDB, 'sample-models');
  } catch (err) {
    alert('Erro ao carregar arquivos de exemplo: ' + err.message);
  } finally {
    btnLoadSample.disabled = false;
    btnLoadSample.innerHTML = '✨ Testar com Modelos de Exemplo';
  }
}

/**
 * Determina o grupo de ordenação de um nome de arquivo:
 * Grupo 0: Alfabeto padrão ocidental/latino (A-Z, números 0-9, caracteres acentuados usuais pt/en/fr/es)
 * Grupo 1: Escritas e alfabetos não-padrão (Kanji, ideogramas chineses, hiragana, katakana, hangul, etc.)
 */
function getSortGroup(filename) {
  const dotIdx = filename.lastIndexOf('.');
  const baseName = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;

  // Busca a primeira letra ou caractere alfabético no nome do arquivo
  const match = baseName.match(/\p{L}/u);
  if (match) {
    const firstLetter = match[0];
    // Se pertencer ao alfabeto latino (A-Z, a-z, acentuações como á, é, ç, etc.)
    if (/\p{Script=Latin}/u.test(firstLetter)) {
      return 0; // Padrão ocidental
    }
    // Caso seja Kanji, Chinês, Japonês, Coreano, etc.
    return 1; // Fim da lista
  }

  // Se não contiver letras (ex: apenas números '009', '1126' ou símbolos)
  // Verifica se há caracteres CJK ou ideogramas presentes
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(baseName)) {
    return 1;
  }

  // Números e símbolos convencionais pertencem ao grupo padrão
  return 0;
}

/**
 * Comparador alfabético: coloca alfabetos ocidentais (A-Z, números) primeiro
 * e alfabetos com kanjis, ideogramas e desenhos no final da lista.
 */
function compareModelNames(nameA, nameB) {
  const groupA = getSortGroup(nameA);
  const groupB = getSortGroup(nameB);

  // Se estiverem em grupos diferentes, o grupo 0 (padrão) vem antes do 1 (não-padrão)
  if (groupA !== groupB) {
    return groupA - groupB;
  }

  // Dentro do mesmo grupo, aplica ordenação alfabética natural (sensível a números e case-insensitive)
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

const FAVORITES_STORAGE_KEY = 'antigravity_3d_library_favorites';

/**
 * Carrega a lista de nomes/identificadores de favoritos do localStorage
 */
function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    console.warn('Erro ao carregar favoritos do localStorage:', e);
    return new Set();
  }
}

/**
 * Salva a lista de favoritos no localStorage
 */
function saveFavorites(favSet) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favSet)));
  } catch (e) {
    console.warn('Erro ao salvar favoritos no localStorage:', e);
  }
}

/**
 * Alterna o estado de favorito de um modelo
 */
function toggleFavorite(model) {
  const favs = loadFavorites();
  const key = model.name;
  if (favs.has(key)) {
    favs.delete(key);
    model.isFavorite = false;
    showToast(`"${model.name}" removido dos favoritos.`);
  } else {
    favs.add(key);
    model.isFavorite = true;
    showToast(`"${model.name}" adicionado aos favoritos! ⭐`, 'success');
  }
  saveFavorites(favs);
  renderGallery();
}

/**
 * Gera uma impressão digital única (fingerprint SHA-256) do arquivo.
 * Para arquivos pequenos (<= 2MB), processa o buffer completo.
 * Para arquivos grandes (> 2MB), usa amostragem ultra-rápida: tamanho + 64KB início + 64KB meio + 64KB fim.
 */
async function computeFileFingerprint(file) {
  if (!file) return null;
  try {
    const CHUNK_SIZE = 64 * 1024; // 64 KB
    let bufferToHash;

    if (file.size <= 2 * 1024 * 1024) {
      bufferToHash = await file.arrayBuffer();
    } else {
      const slice1 = file.slice(0, CHUNK_SIZE);
      const mid = Math.floor(file.size / 2);
      const slice2 = file.slice(mid, mid + CHUNK_SIZE);
      const slice3 = file.slice(file.size - CHUNK_SIZE, file.size);

      const [buf1, buf2, buf3] = await Promise.all([
        slice1.arrayBuffer(),
        slice2.arrayBuffer(),
        slice3.arrayBuffer()
      ]);

      const sizeBuf = new ArrayBuffer(8);
      new DataView(sizeBuf).setBigUint64(0, BigInt(file.size), false);

      const totalLen = 8 + buf1.byteLength + buf2.byteLength + buf3.byteLength;
      const combined = new Uint8Array(totalLen);
      combined.set(new Uint8Array(sizeBuf), 0);
      combined.set(new Uint8Array(buf1), 8);
      combined.set(new Uint8Array(buf2), 8 + buf1.byteLength);
      combined.set(new Uint8Array(buf3), 8 + buf1.byteLength + buf2.byteLength);

      bufferToHash = combined.buffer;
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', bufferToHash);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('Erro ao calcular fingerprint do arquivo:', file.name, err);
    return `fallback-${file.size}-${file.name}`;
  }
}

/**
 * Atualiza o status de arquivos duplicados em toda a coleção
 */
async function updateDuplicatesState() {
  const hashMap = new Map();

  // 1. Garantir que todos os modelos tenham seu fingerprint calculado
  for (const model of state.models) {
    if (!model.fingerprint && model.file) {
      model.fingerprint = await computeFileFingerprint(model.file);
    }
    if (model.fingerprint) {
      if (!hashMap.has(model.fingerprint)) {
        hashMap.set(model.fingerprint, []);
      }
      hashMap.get(model.fingerprint).push(model);
    }
  }

  // 2. Marcar quais modelos são cópias duplicadas
  let totalDuplicatesCount = 0;
  for (const model of state.models) {
    const list = model.fingerprint ? hashMap.get(model.fingerprint) : [];
    if (list && list.length > 1) {
      model.isDuplicate = true;
      const others = list.filter(m => m.id !== model.id);
      model.duplicatesCount = others.length;
      model.duplicateOrigins = others.map(m => `${m.folderName} / ${m.name}`).join(', ');
      totalDuplicatesCount++;
    } else {
      model.isDuplicate = false;
      model.duplicatesCount = 0;
      model.duplicateOrigins = '';
    }
  }

  // 3. Atualizar botão do filtro de duplicados na barra de ferramentas
  updateDuplicatesFilterButton(totalDuplicatesCount);

  // 4. Re-renderizar galeria para refletir selos e filtros
  renderGallery();
}

/**
 * Atualiza a visibilidade e o contador da pílula de duplicados no toolbar
 */
function updateDuplicatesFilterButton(duplicatesCount) {
  if (!btnFilterDuplicates || !duplicatesCountBadge) return;

  if (duplicatesCount > 0) {
    btnFilterDuplicates.style.display = 'inline-flex';
    duplicatesCountBadge.textContent = duplicatesCount;
  } else {
    btnFilterDuplicates.style.display = 'none';
    if (state.activeFilter === 'duplicates') {
      state.activeFilter = 'all';
      filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
      });
    }
  }
}

// ==========================================
// Persistência de Pastas com IndexedDB
// ==========================================
const DB_NAME = 'antigravity_3d_db';
const DB_VERSION = 1;
const STORE_FOLDERS = 'folders';

function openFoldersDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFolderToDB(folderData) {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    const store = tx.objectStore(STORE_FOLDERS);
    store.put({
      id: folderData.id,
      name: folderData.name,
      handle: folderData.handle || null,
      count: folderData.count || 0,
      isSample: !!folderData.isSample,
      savedAt: Date.now()
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao salvar pasta no IndexedDB:', err);
    return false;
  }
}

async function removeFolderFromDB(folderId) {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    const store = tx.objectStore(STORE_FOLDERS);
    store.delete(folderId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao remover pasta do IndexedDB:', err);
    return false;
  }
}

async function clearAllFoldersFromDB() {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    tx.objectStore(STORE_FOLDERS).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao limpar pastas no IndexedDB:', err);
    return false;
  }
}

async function getAllFoldersFromDB() {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readonly');
    const store = tx.objectStore(STORE_FOLDERS);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Erro ao ler pastas do IndexedDB:', err);
    return [];
  }
}

/**
 * Verifica no IndexedDB se há pastas salvas de sessões anteriores
 * e tenta restaurá-las automaticamente ou exibe o card de reconexão.
 */
async function checkAndRestoreSavedFolders() {
  const savedFolders = await getAllFoldersFromDB();
  if (!savedFolders || savedFolders.length === 0) {
    if (savedFoldersCard) savedFoldersCard.style.display = 'none';
    return;
  }

  // Filtrar pastas válidas
  const validSaved = savedFolders.filter(f => f.isSample || (f.handle && typeof f.handle.queryPermission === 'function'));
  if (validSaved.length === 0) {
    if (savedFoldersCard) savedFoldersCard.style.display = 'none';
    return;
  }

  // Verificar se todas as pastas com handle já possuem permissão concedida
  let allGranted = true;
  for (const f of validSaved) {
    if (!f.isSample && f.handle) {
      try {
        const perm = await f.handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          allGranted = false;
        }
      } catch (_) {
        allGranted = false;
      }
    }
  }

  // Se todas já tiverem permissão concedida
  if (allGranted) {
    for (const f of validSaved) {
      if (f.isSample) {
        await loadSampleModels(false);
      } else if (f.handle) {
        try {
          const files = await scanDirectoryHandle(f.handle);
          await addFilesToLibrary(files, f.name, f.handle, false, f.id);
        } catch (err) {
          console.warn('Erro ao restaurar pasta salva:', f.name, err);
        }
      }
    }
    if (state.folders.length > 0) {
      showToast(`Biblioteca restaurada com ${state.folders.length} pasta(s) salva(s)! 🚀`, 'success');
      return;
    }
  }

  // Se precisar de gesto do usuário para solicitar permissão, exibe o card de reconexão
  renderSavedFoldersCard(validSaved);
}

function renderSavedFoldersCard(savedFolders) {
  if (!savedFoldersCard) return;
  savedFoldersCard.style.display = 'block';
  if (savedFoldersCount) savedFoldersCount.textContent = savedFolders.length;

  if (savedFoldersPreviewList) {
    savedFoldersPreviewList.innerHTML = '';
    savedFolders.forEach(f => {
      const item = document.createElement('div');
      item.className = 'saved-folder-preview-item';
      item.innerHTML = `
        <span class="saved-folder-name">
          <span>📁</span>
          <span>${escapeHtml(f.name)}</span>
        </span>
        <span class="saved-folder-meta">${f.count ? `~${f.count} modelos` : 'Pasta local'}</span>
      `;
      savedFoldersPreviewList.appendChild(item);
    });
  }
}

async function reconnectAllSavedFolders() {
  const savedFolders = await getAllFoldersFromDB();
  if (!savedFolders || savedFolders.length === 0) return;

  btnReconnectAllFolders.disabled = true;
  btnReconnectAllFolders.innerHTML = '<span>Reconectando...</span>';

  let reconnectedCount = 0;

  for (const f of savedFolders) {
    if (f.isSample) {
      await loadSampleModels(false);
      reconnectedCount++;
    } else if (f.handle) {
      try {
        let perm = await f.handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          perm = await f.handle.requestPermission({ mode: 'read' });
        }
        if (perm === 'granted') {
          const files = await scanDirectoryHandle(f.handle);
          await addFilesToLibrary(files, f.name, f.handle, false, f.id);
          reconnectedCount++;
        } else {
          showToast(`Permissão não concedida para "${f.name}".`, 'warning');
        }
      } catch (err) {
        console.warn('Erro ao reconectar pasta:', f.name, err);
        showToast(`Não foi possível abrir "${f.name}": ${err.message}`, 'error');
      }
    }
  }

  btnReconnectAllFolders.disabled = false;
  btnReconnectAllFolders.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
    </svg>
    <span>Reconectar Pastas Salvas</span>
  `;

  if (reconnectedCount > 0) {
    if (savedFoldersCard) savedFoldersCard.style.display = 'none';
    showToast(`Biblioteca restaurada com ${reconnectedCount} pasta(s)! ⭐`, 'success');
  }
}

/**
 * Adiciona uma pasta e seus arquivos 3D à biblioteca existente (suporte a múltiplas pastas)
 */
async function addFilesToLibrary(files, folderName, dirHandle = null, persistToDB = true, existingFolderId = null) {
  if (!files || files.length === 0) {
    showToast(`Nenhum arquivo 3D (.STL ou .3MF) foi encontrado em "${folderName}".`, 'warning');
    return;
  }

  const folderId = existingFolderId || ('folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5));
  const savedFavs = loadFavorites();

  const newModels = files.map((item, index) => ({
    id: `model-${folderId}-${index}-${Date.now()}`,
    folderId,
    folderName,
    file: item.file,
    name: item.name,
    size: item.size,
    type: item.type,
    path: item.path,
    handle: item.handle || null,
    parentHandle: item.parentHandle || null,
    isFavorite: savedFavs.has(item.name) || (item.path && savedFavs.has(item.path)),
    thumbnailUrl: null,
    metadata: null,
    slicerData: null,
    plates: [],
    loadingThumbnail: false,
    fingerprint: null,
    isDuplicate: false,
    duplicatesCount: 0,
    duplicateOrigins: ''
  }));

  // Registrar a pasta no estado
  state.folders.push({
    id: folderId,
    name: folderName,
    handle: dirHandle,
    count: newModels.length
  });

  // Salvar no IndexedDB se solicitado
  if (persistToDB) {
    await saveFolderToDB({
      id: folderId,
      name: folderName,
      handle: dirHandle,
      count: newModels.length,
      isSample: folderName.includes('sample_models')
    });
  }

  // Acrescentar modelos ao acervo global
  state.models.push(...newModels);

  // Ordenar todos os modelos alfabeticamente (A-Z ocidentais primeiro, Kanjis/CJK ao final)
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  // Atualizar visualização para exibir a galeria
  dropZone.style.display = 'none';
  galleryContainer.style.display = 'block';
  subToolbar.style.display = 'flex';

  renderFolderChips();
  updateStatsBadge();
  renderGallery();
  processThumbnailQueue();

  // Calcular impressões digitais e detectar duplicatas em background
  updateDuplicatesState();

  showToast(`Pasta "${folderName}" adicionada com ${newModels.length} modelo(s)!`, 'success');
}

/**
 * Remove uma pasta específica e todos os seus modelos associados da biblioteca
 */
async function removeFolder(folderId) {
  const folderIndex = state.folders.findIndex(f => f.id === folderId);
  if (folderIndex === -1) return;

  const folderName = state.folders[folderIndex].name;

  // Revogar URLs de miniaturas criadas para os modelos dessa pasta
  const modelsToRemove = state.models.filter(m => m.folderId === folderId);
  modelsToRemove.forEach(m => {
    if (m.thumbnailUrl && m.thumbnailUrl.startsWith('blob:')) {
      URL.revokeObjectURL(m.thumbnailUrl);
    }
  });

  // Remover pasta e modelos do estado
  state.folders.splice(folderIndex, 1);
  state.models = state.models.filter(m => m.folderId !== folderId);

  // Remover do IndexedDB
  await removeFolderFromDB(folderId);

  // Se o modelo ativo no modal pertencia a essa pasta, fechar modal
  if (state.activeModel && state.activeModel.folderId === folderId) {
    closeViewerModal();
  }

  showToast(`Pasta "${folderName}" removida da biblioteca.`);

  // Se não houver mais pastas conectadas, volta para a tela inicial vazia
  if (state.folders.length === 0) {
    dropZone.style.display = 'block';
    galleryContainer.style.display = 'none';
    subToolbar.style.display = 'none';
    favoritesGrid.innerHTML = '';
    modelsGrid.innerHTML = '';
    if (foldersChipsList) foldersChipsList.innerHTML = '';
    updateDuplicatesFilterButton(0);

    const remainingSaved = await getAllFoldersFromDB();
    if (remainingSaved.length > 0) {
      renderSavedFoldersCard(remainingSaved);
    } else if (savedFoldersCard) {
      savedFoldersCard.style.display = 'none';
    }
    return;
  }

  renderFolderChips();
  updateStatsBadge();
  renderGallery();
  updateDuplicatesState();
}

/**
 * Renderiza os chips de pastas conectadas no sub-toolbar
 */
function renderFolderChips() {
  if (!foldersChipsList) return;
  foldersChipsList.innerHTML = '';

  state.folders.forEach(folder => {
    const chip = document.createElement('div');
    chip.className = 'folder-chip';
    chip.title = `${folder.name} (${folder.count} arquivos)`;

    chip.innerHTML = `
      <span class="folder-chip-icon">📁</span>
      <span class="folder-chip-name">${escapeHtml(folder.name)}</span>
      <span class="folder-chip-count">(${folder.count})</span>
      <button class="btn-remove-folder" title="Remover pasta '${escapeHtml(folder.name)}' da biblioteca" aria-label="Remover pasta">
        &times;
      </button>
    `;

    const btnRemove = chip.querySelector('.btn-remove-folder');
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFolder(folder.id);
    });

    foldersChipsList.appendChild(chip);
  });
}

function updateStatsBadge() {
  if (!fileCountBadge) return;
  const stlCount = state.models.filter(m => m.type === 'stl').length;
  const tmfCount = state.models.filter(m => m.type === '3mf').length;
  const foldersCount = state.folders.length;
  const folderText = foldersCount === 1 ? '1 pasta' : `${foldersCount} pastas`;
  fileCountBadge.textContent = `(${state.models.length} modelos em ${folderText}: ${stlCount} STL, ${tmfCount} 3MF)`;
}

/**
 * Notificação visual Toast flutuante
 */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'warning') icon = '🔔';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

/**
 * Renomeia o arquivo do modelo tanto no disco (via File System Access API) quanto no estado da aplicação.
 * A extensão é fixada e preservada automaticamente.
 */
async function renameModelFile(model, newBaseName) {
  let cleanBase = (newBaseName || '').trim();

  if (!cleanBase) {
    showToast('O nome do arquivo não pode ficar vazio.', 'error');
    return false;
  }

  // Caracteres proibidos no Windows / macOS / Linux: \ / : * ? " < > |
  if (/[\\/:*?"<>|]/.test(cleanBase)) {
    showToast('O nome não pode conter nenhum dos caracteres: \\ / : * ? " < > |', 'error');
    return false;
  }

  const dotIdx = model.name.lastIndexOf('.');
  const ext = dotIdx !== -1 ? model.name.substring(dotIdx) : `.${model.type}`;
  const oldBaseName = dotIdx !== -1 ? model.name.substring(0, dotIdx) : model.name;

  // Se o usuário digitou acidentalmente a extensão no final, removemos para não duplicar (.3mf.3mf)
  if (cleanBase.toLowerCase().endsWith(ext.toLowerCase())) {
    cleanBase = cleanBase.substring(0, cleanBase.length - ext.length).trim();
  }

  if (!cleanBase) {
    showToast('O nome do arquivo não pode ficar vazio.', 'error');
    return false;
  }

  if (cleanBase === oldBaseName) {
    return true; // Sem alterações
  }

  const newFullName = `${cleanBase}${ext}`;

  // Verificar duplicidade no diretório atual
  const exists = state.models.some(m => m.id !== model.id && m.name.toLowerCase() === newFullName.toLowerCase());
  if (exists) {
    showToast(`Já existe um arquivo chamado "${newFullName}" nesta pasta.`, 'error');
    return false;
  }

  // Se tiver FileSystemFileHandle, renomear fisicamente no disco
  if (model.handle) {
    try {
      // 1. Obter permissão de gravação se ainda não tiver
      let hasPerm = false;
      if (typeof model.handle.queryPermission === 'function') {
        const status = await model.handle.queryPermission({ mode: 'readwrite' });
        if (status === 'granted') {
          hasPerm = true;
        } else if (typeof model.handle.requestPermission === 'function') {
          const req = await model.handle.requestPermission({ mode: 'readwrite' });
          if (req === 'granted') hasPerm = true;
        }
      }

      if (!hasPerm && model.parentHandle && typeof model.parentHandle.requestPermission === 'function') {
        const req = await model.parentHandle.requestPermission({ mode: 'readwrite' });
        if (req === 'granted') hasPerm = true;
      }

      // 2. Renomear o arquivo no sistema operacional
      if (typeof model.handle.move === 'function') {
        await model.handle.move(newFullName);
      } else if (model.parentHandle) {
        // Fallback: criar novo arquivo, escrever dados e remover arquivo antigo
        const newFileHandle = await model.parentHandle.getFileHandle(newFullName, { create: true });
        const writable = await newFileHandle.createWritable();
        const currentBlob = await model.handle.getFile();
        await writable.write(currentBlob);
        await writable.close();
        await model.parentHandle.removeEntry(model.name);
        model.handle = newFileHandle;
      } else {
        throw new Error('Navegador não possui suporte nativo para mover arquivos.');
      }

      // 3. Atualizar o objeto File local
      if (typeof model.handle.getFile === 'function') {
        try {
          model.file = await model.handle.getFile();
        } catch (_) {}
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        showToast('Permissão de gravação negada. O arquivo não foi alterado.', 'warning');
        return false;
      }
      console.error('Erro ao renomear arquivo no disco:', err);
      showToast('Erro ao renomear no disco: ' + err.message, 'error');
      return false;
    }
  } else {
    // Modelos carregados sem FileSystemFileHandle (ex: sample_models ou fallback)
    showToast('Nome atualizado na tela (para renomear no disco, use a pasta aberta nativamente).', 'info');
  }

  // Se o modelo era favorito, atualizar o nome nos favoritos
  const favs = loadFavorites();
  if (favs.has(model.name)) {
    favs.delete(model.name);
    favs.add(newFullName);
    saveFavorites(favs);
  }

  // Atualizar dados em memória
  model.name = newFullName;
  if (model.path) {
    model.path = model.path.includes('/')
      ? model.path.substring(0, model.path.lastIndexOf('/') + 1) + newFullName
      : newFullName;
  }

  // Se o modal estiver aberto exibindo este mesmo modelo, atualizar o título do modal
  if (state.activeModel && state.activeModel.id === model.id) {
    if (modalFileName) modalFileName.textContent = newFullName;
  }

  // Reordenar a lista global após renomear
  state.models.sort((a, b) => compareModelNames(a.name, b.name));

  showToast(`Arquivo renomeado para "${newFullName}" com sucesso!`, 'success');
  return true;
}

/**
 * Cria e configura um elemento de card para um modelo 3D
 */
function createModelCard(model) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.dataset.id = model.id;

  const formattedSize = formatBytes(model.size);
  const badgeClass = model.type === 'stl' ? 'stl format-stl' : '3mf format-3mf';
  const isSliced = model.slicerData && model.slicerData.isSliced;

  const dotIdx = model.name.lastIndexOf('.');
  const ext = dotIdx !== -1 ? model.name.substring(dotIdx) : `.${model.type}`;
  const baseName = dotIdx !== -1 ? model.name.substring(0, dotIdx) : model.name;

  card.innerHTML = `
    <div class="card-thumbnail-wrapper">
      <span class="badge-format ${badgeClass}">.${model.type.toUpperCase()}</span>
      ${isSliced ? `<span class="badge-sliced-card">Fatiado</span>` : ''}
      ${model.isDuplicate ? `
        <span class="badge-duplicate" title="Arquivo idêntico encontrado em: ${escapeHtml(model.duplicateOrigins)}">
          ⚠️ Duplicado
        </span>
      ` : ''}
      <button class="btn-favorite ${model.isFavorite ? 'active' : ''}" title="${model.isFavorite ? 'Remover dos favoritos' : 'Favoritar modelo'}" aria-label="Favoritar modelo" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${model.isFavorite ? '#fbbf24' : 'none'}" stroke="${model.isFavorite ? '#fbbf24' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
      ${model.thumbnailUrl 
        ? `<img class="card-thumbnail" src="${model.thumbnailUrl}" alt="${escapeHtml(model.name)}" loading="lazy">` 
        : `
          <div class="thumb-loader">
            <div class="spinner"></div>
            <span>Gerando miniatura...</span>
          </div>
        `
      }
      <div class="card-quick-preview">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="10 8 16 12 10 16 10 8"></polygon>
        </svg>
        Girar 3D
      </div>
    </div>
    <div class="card-body">
      <div class="card-title-row">
        <div class="card-title" title="${escapeHtml(model.name)}" data-fullname="${escapeHtml(model.name)}">
          <span class="card-title-base">${escapeHtml(baseName)}</span><span class="card-title-ext">${escapeHtml(ext)}</span>
        </div>
        <button class="btn-card-rename" title="Renomear arquivo" aria-label="Renomear arquivo" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </button>
      </div>
      ${isSliced ? `
        <div class="card-slicer-info">
          ${model.slicerData.printTimeFormatted ? `<span>⏱️ ${model.slicerData.printTimeFormatted}</span>` : ''}
          ${model.slicerData.filamentGrams ? `<span>🧵 ${model.slicerData.filamentGrams}g ${model.slicerData.filamentType || ''}</span>` : ''}
        </div>
      ` : ''}
      <div class="card-meta">
        <span>${formattedSize}</span>
        ${model.metadata?.dimensions ? `
          <span class="card-dimensions">${Math.round(model.metadata.dimensions.x)}×${Math.round(model.metadata.dimensions.y)}×${Math.round(model.metadata.dimensions.z)} mm</span>
        ` : ''}
      </div>
      ${model.isDuplicate ? `
        <div class="card-duplicate-info" title="Cópia de: ${escapeHtml(model.duplicateOrigins)}">
          <span class="card-duplicate-icon">⚠️</span>
          <span>Cópia de: <strong>${escapeHtml(model.duplicateOrigins)}</strong></span>
        </div>
      ` : ''}
    </div>
  `;

  // Evento de Favoritar
  const btnFav = card.querySelector('.btn-favorite');
  if (btnFav) {
    btnFav.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(model);
    });
  }

  // Eventos de Renomear e Título
  const titleRow = card.querySelector('.card-title-row');

  const setupTitleRowEvents = () => {
    const btnRename = titleRow.querySelector('.btn-card-rename');
    const titleEl = titleRow.querySelector('.card-title');

    if (btnRename) {
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        enterRenameMode();
      });
    }

    if (titleEl) {
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        enterRenameMode();
      });
    }
  };

  const enterRenameMode = () => {
    const curDot = model.name.lastIndexOf('.');
    const curExt = curDot !== -1 ? model.name.substring(curDot) : `.${model.type}`;
    const curBase = curDot !== -1 ? model.name.substring(0, curDot) : model.name;

    titleRow.innerHTML = `
      <div class="card-rename-box">
        <div class="card-rename-input-wrapper">
          <input type="text" class="card-rename-input" value="${escapeHtml(curBase)}" spellcheck="false" autocomplete="off" />
          <span class="card-rename-ext-locked" title="A extensão é protegida e não pode ser alterada">${escapeHtml(curExt)}</span>
        </div>
        <div class="card-rename-actions">
          <button class="btn-rename-action btn-rename-confirm" title="Salvar (Enter)" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
          <button class="btn-rename-action btn-rename-cancel" title="Cancelar (Esc)" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
    `;

    const renameBox = titleRow.querySelector('.card-rename-box');
    const input = titleRow.querySelector('.card-rename-input');
    const btnConfirm = titleRow.querySelector('.btn-rename-confirm');
    const btnCancel = titleRow.querySelector('.btn-rename-cancel');

    renameBox.addEventListener('click', (ev) => ev.stopPropagation());

    input.focus();
    input.select();

    let isSaving = false;

    const handleSave = async () => {
      if (isSaving) return;
      isSaving = true;
      const newBase = input.value;
      input.disabled = true;
      btnConfirm.disabled = true;
      btnCancel.disabled = true;

      const success = await renameModelFile(model, newBase);
      if (success) {
        renderGallery();
      } else {
        isSaving = false;
        input.disabled = false;
        btnConfirm.disabled = false;
        btnCancel.disabled = false;
        input.focus();
      }
    };

    const exitRenameMode = () => {
      const nextDot = model.name.lastIndexOf('.');
      const nextExt = nextDot !== -1 ? model.name.substring(nextDot) : `.${model.type}`;
      const nextBase = nextDot !== -1 ? model.name.substring(0, nextDot) : model.name;

      titleRow.innerHTML = `
        <div class="card-title" title="${escapeHtml(model.name)}" data-fullname="${escapeHtml(model.name)}">
          <span class="card-title-base">${escapeHtml(nextBase)}</span><span class="card-title-ext">${escapeHtml(nextExt)}</span>
        </div>
        <button class="btn-card-rename" title="Renomear arquivo" aria-label="Renomear arquivo" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
          </svg>
        </button>
      `;
      setupTitleRowEvents();
    };

    btnConfirm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleSave();
    });

    btnCancel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      exitRenameMode();
    });

    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        handleSave();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        exitRenameMode();
      }
    });
  };

  setupTitleRowEvents();

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-rename-box') || e.target.closest('.btn-card-rename') || e.target.closest('.btn-favorite')) {
      return;
    }
    openViewerModal(model);
  });

  return card;
}

/**
 * Renderiza a galeria com suporte à seção Favoritos e seção Todos
 */
function renderGallery() {
  const filtered = state.models
    .filter(model => {
      // Filtro por tipo ou duplicatas
      if (state.activeFilter === 'duplicates') {
        if (!model.isDuplicate) return false;
      } else if (state.activeFilter !== 'all' && model.type !== state.activeFilter) {
        return false;
      }
      // Filtro por nome
      if (state.searchQuery && !model.name.toLowerCase().includes(state.searchQuery)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => compareModelNames(a.name, b.name));

  favoritesGrid.innerHTML = '';
  modelsGrid.innerHTML = '';

  if (filtered.length === 0) {
    favoritesSection.style.display = 'none';
    allSectionHeader.style.display = 'none';
    modelsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        Nenhum arquivo corresponde aos filtros aplicados.
      </div>
    `;
    return;
  }

  const favorites = filtered.filter(m => m.isFavorite);

  if (favorites.length > 0) {
    // Exibir seção de Favoritos
    favoritesSection.style.display = 'block';
    favoritesCountBadge.textContent = favorites.length;
    favorites.forEach(model => {
      favoritesGrid.appendChild(createModelCard(model));
    });

    // Exibir cabeçalho de Todos
    allSectionHeader.style.display = 'flex';
    allCountBadge.textContent = filtered.length;
  } else {
    // Ocultar seção de Favoritos e cabeçalho de Todos
    favoritesSection.style.display = 'none';
    allSectionHeader.style.display = 'none';
  }

  // Renderizar a lista completa em Todos
  filtered.forEach(model => {
    modelsGrid.appendChild(createModelCard(model));
  });
}

/**
 * Fila concorrente para geração de miniaturas sem travar a interface
 */
async function processThumbnailQueue() {
  const pending = state.models.filter(m => !m.thumbnailUrl && !m.loadingThumbnail);
  const concurrency = 2; // Processar 2 por vez para máxima suavidade

  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(batch.map(async (model) => {
      model.loadingThumbnail = true;
      try {
        const buffer = await model.file.arrayBuffer();
        if (model.type === 'stl') {
          const res = await generateSTLThumbnail(buffer);
          model.thumbnailUrl = res.thumbnailUrl;
          model.metadata = res.metadata;
        } else if (model.type === '3mf') {
          const res = await extract3MFThumbnail(buffer);
          model.thumbnailUrl = res.thumbnailUrl;
          model.metadata = res.metadata;
          model.slicerData = res.slicerData;
          model.plates = res.plates || [];
        }
      } catch (err) {
        console.warn(`Erro ao gerar miniatura de ${model.name}:`, err);
        model.thumbnailUrl = generatePlaceholderThumb(model.name, model.type);
      } finally {
        model.loadingThumbnail = false;
        updateCardThumbnail(model);
      }
    }));
  }
}

/**
 * Atualiza todas as instâncias do card com a miniatura gerada sem recriar todo o DOM
 */
function updateCardThumbnail(model) {
  const cards = document.querySelectorAll(`.model-card[data-id="${model.id}"]`);
  if (!cards || cards.length === 0) return;

  cards.forEach(card => {
    const wrapper = card.querySelector('.card-thumbnail-wrapper');
    if (!wrapper) return;

    const existingThumb = wrapper.querySelector('.card-thumbnail');
    if (existingThumb) {
      existingThumb.src = model.thumbnailUrl;
    } else {
      const loader = wrapper.querySelector('.thumb-loader');
      if (loader) loader.remove();

      const img = document.createElement('img');
      img.className = 'card-thumbnail';
      img.src = model.thumbnailUrl;
      img.alt = model.name;
      img.loading = 'lazy';
      wrapper.appendChild(img);
    }

    // Atualizar dados de fatiamento se existirem
    if (model.slicerData && model.slicerData.isSliced) {
      if (!wrapper.querySelector('.badge-sliced-card')) {
        const slicedBadge = document.createElement('span');
        slicedBadge.className = 'badge-sliced-card';
        slicedBadge.textContent = 'Fatiado';
        wrapper.appendChild(slicedBadge);
      }
      const cardBody = card.querySelector('.card-body');
      if (cardBody && !cardBody.querySelector('.card-slicer-info')) {
        const slicerDiv = document.createElement('div');
        slicerDiv.className = 'card-slicer-info';
        slicerDiv.innerHTML = `
          ${model.slicerData.printTimeFormatted ? `<span>⏱️ ${model.slicerData.printTimeFormatted}</span>` : ''}
          ${model.slicerData.filamentGrams ? `<span>🧵 ${model.slicerData.filamentGrams}g ${model.slicerData.filamentType || ''}</span>` : ''}
        `;
        const meta = cardBody.querySelector('.card-meta');
        if (meta) {
          cardBody.insertBefore(slicerDiv, meta);
        } else {
          cardBody.appendChild(slicerDiv);
        }
      }
    }

    // Atualizar dimensões se calculadas
    if (model.metadata?.dimensions) {
      const metaDiv = card.querySelector('.card-meta');
      if (metaDiv && !card.querySelector('.card-dimensions')) {
        const span = document.createElement('span');
        span.className = 'card-dimensions';
        span.textContent = `${Math.round(model.metadata.dimensions.x)}×${Math.round(model.metadata.dimensions.y)}×${Math.round(model.metadata.dimensions.z)} mm`;
        metaDiv.appendChild(span);
      }
    }
  });
}

function generatePlaceholderThumb(name, type) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(type.toUpperCase(), 100, 100);
  ctx.font = '12px sans-serif';
  ctx.fillText('Prévia indisponível', 100, 130);
  return canvas.toDataURL();
}

/**
 * Alterna entre a visualização 2D da Mesa de Impressão e o Visualizador 3D
 */
function setViewerMode(mode) {
  state.currentViewerMode = mode;

  if (mode === 'plate') {
    modalPlateImg.style.display = 'block';
    modalCanvas.style.display = 'none';
    viewerControlsBar.style.display = 'none';

    // Se o modelo tiver mesas, mostrar o botão flutuante 'Visualizar 3D'
    if (state.activeModel && state.activeModel.plates && state.activeModel.plates.length > 0) {
      if (btnOpen3DView) btnOpen3DView.style.display = 'inline-flex';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
    } else {
      if (btnOpen3DView) btnOpen3DView.style.display = 'none';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
    }
  } else {
    modalPlateImg.style.display = 'none';
    modalCanvas.style.display = 'block';
    viewerControlsBar.style.display = 'flex';

    // Se o modelo tiver fotos de mesa, permitir retornar à foto
    if (state.activeModel && state.activeModel.plates && state.activeModel.plates.length > 0) {
      if (btnOpen3DView) btnOpen3DView.style.display = 'none';
      if (btnBackToPlate) btnBackToPlate.style.display = 'inline-flex';
    } else {
      if (btnOpen3DView) btnOpen3DView.style.display = 'none';
      if (btnBackToPlate) btnBackToPlate.style.display = 'none';
    }

    initModalThree();
    onModalResize();

    // Carregar a malha 3D da mesa atualmente selecionada
    if (state.activeModel) {
      loadModelIntoModal(state.activeModel, state.activePlateId);
    }
  }
}

/**
 * Renderiza os seletores de mesas de impressão em grade 3 por linha
 */
function renderPlatesList(plates) {
  platesList.innerHTML = '';
  if (!plates || plates.length === 0) {
    if (modalSidebar) modalSidebar.style.display = 'none';
    return;
  }

  if (modalSidebar) modalSidebar.style.display = 'flex';
  if (platesSection) platesSection.style.display = 'flex';
  if (platesCount) platesCount.textContent = plates.length;

  plates.forEach(plate => {
    const card = document.createElement('div');
    card.className = `plate-square-card ${plate.id === state.activePlateId ? 'active' : ''}`;
    card.dataset.plateId = plate.id;
    card.title = `${plate.name}${plate.printTimeFormatted ? ' (' + plate.printTimeFormatted + ')' : ''}`;

    card.innerHTML = `
      <span class="plate-square-num">${plate.id}</span>
      ${plate.imageUrl 
        ? `<img class="plate-square-img" src="${plate.imageUrl}" alt="${escapeHtml(plate.name)}">`
        : `<div style="font-size: 1.8rem; color: #64748b;">🖨️</div>`
      }
      <span class="plate-square-label">${escapeHtml(plate.name)}</span>
    `;

    card.addEventListener('click', () => {
      selectPlate(plate);
    });

    platesList.appendChild(card);
  });
}

function selectPlate(plate) {
  state.activePlateId = plate.id;

  // Atualizar estilo ativo nos cards quadrados
  document.querySelectorAll('.plate-square-card').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.plateId, 10) === plate.id);
  });

  if (plate.imageUrl) {
    modalPlateImg.src = plate.imageUrl;
  }

  // Se já estiver visualizando em 3D, carrega a malha 3D da nova mesa selecionada
  if (state.currentViewerMode === '3d') {
    loadModelIntoModal(state.activeModel, plate.id);
  } else {
    setViewerMode('plate');
  }
}

/**
 * Modal Interativo (Three.js + Visualizador de Mesas)
 */
async function openViewerModal(model) {
  viewerModal.classList.add('active');
  state.activeModel = model;
  state.isMeshLoaded = false;
  modalFileName.textContent = model.name;
  modalBadge.textContent = model.type.toUpperCase();
  modalBadge.className = `badge-format ${model.type} format-${model.type}`;

  if (modalDuplicateBadge) {
    if (model.isDuplicate) {
      modalDuplicateBadge.style.display = 'inline-flex';
      modalDuplicateBadge.title = `Arquivo idêntico encontrado em: ${model.duplicateOrigins}`;
      modalDuplicateBadge.textContent = `⚠️ Cópia Duplicada (${model.duplicatesCount})`;
    } else {
      modalDuplicateBadge.style.display = 'none';
    }
  }

  // Resetar valores enquanto carrega
  modalPlateImg.src = '';
  if (state.modalMesh) {
    state.modalScene.remove(state.modalMesh);
    if (state.modalMesh.geometry) state.modalMesh.geometry.dispose();
    state.modalMesh = null;
  }

  // Garantir que plates foram extraídos se for 3MF
  if (model.type === '3mf' && (!model.plates || model.plates.length === 0)) {
    try {
      const buffer = await model.file.arrayBuffer();
      const res = await extract3MFThumbnail(buffer);
      model.plates = res.plates || [];
      if (!model.slicerData) model.slicerData = res.slicerData;
    } catch (e) {
      console.warn('Erro ao extrair metadados e mesas do 3MF:', e);
    }
  }

  // Se houver mesas de impressão no arquivo (Bambu / OrcaSlicer)
  if (model.plates && model.plates.length > 0) {
    state.activePlateId = model.plates[0].id;
    renderPlatesList(model.plates);
    selectPlate(model.plates[0]);
    // Abre no modo foto da mesa com o botão flutuante 'Visualizar 3D'
    setViewerMode('plate');
  } else {
    if (modalSidebar) modalSidebar.style.display = 'none';
    setViewerMode('3d');
  }
}

function initModalThree() {
  if (state.modalRenderer) return;

  const width = modalCanvas.parentElement.clientWidth || 600;
  const height = modalCanvas.parentElement.clientHeight || 500;

  state.modalRenderer = new THREE.WebGLRenderer({
    canvas: modalCanvas,
    antialias: true,
    alpha: true
  });
  state.modalRenderer.setSize(width, height);
  state.modalRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.modalRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.modalRenderer.toneMappingExposure = 1.2;

  state.modalScene = new THREE.Scene();

  // Grid e Piso de referência
  const gridHelper = new THREE.GridHelper(200, 20, 0x334155, 0x1e293b);
  gridHelper.position.y = 0;
  state.modalScene.add(gridHelper);

  // Iluminação
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  state.modalScene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(100, 150, 100);
  state.modalScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.8);
  fillLight.position.set(-100, 50, -100);
  state.modalScene.add(fillLight);

  state.modalCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);

  state.modalControls = new OrbitControls(state.modalCamera, state.modalRenderer.domElement);
  state.modalControls.enableDamping = true;
  state.modalControls.dampingFactor = 0.05;

  // Animação contínua
  function animate() {
    state.modalAnimId = requestAnimationFrame(animate);
    if (state.isAutoRotating && state.modalMesh && state.currentViewerMode === '3d') {
      state.modalMesh.rotation.y += 0.005;
    }
    if (state.currentViewerMode === '3d') {
      state.modalControls.update();
      state.modalRenderer.render(state.modalScene, state.modalCamera);
    }
  }
  animate();

  window.addEventListener('resize', onModalResize);
}

function onModalResize() {
  if (!state.modalRenderer || !viewerModal.classList.contains('active')) return;
  const container = modalCanvas.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w > 0 && h > 0) {
    state.modalCamera.aspect = w / h;
    state.modalCamera.updateProjectionMatrix();
    state.modalRenderer.setSize(w, h);
  }
}

async function loadModelIntoModal(model, plateId = null) {
  const currentPlate = plateId || state.activePlateId || 1;

  // Limpar malha anterior
  if (state.modalMesh) {
    state.modalScene.remove(state.modalMesh);
    if (state.modalMesh.geometry) state.modalMesh.geometry.dispose();
    state.modalMesh = null;
  }

  const plateLabel = (model.plates && model.plates.length > 0) ? ` (Mesa ${currentPlate})` : '';
  viewerLoadingOverlay.style.display = 'flex';
  viewerLoadingText.textContent = `Carregando malha 3D de ${model.name}${plateLabel}...`;

  try {
    const buffer = await model.file.arrayBuffer();
    let geometry = null;
    let dimensions = { x: 0, y: 0, z: 0 };
    let volumeCm3 = 0;
    let triangleCount = 0;

    if (model.type === 'stl') {
      const parsed = parseSTL(buffer);
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
      if (parsed.normals.length === parsed.positions.length) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(parsed.normals, 3));
      } else {
        geometry.computeVertexNormals();
      }
      dimensions = parsed.bounds.size;
      volumeCm3 = parsed.volumeCm3;
      triangleCount = parsed.triangleCount;
    } else if (model.type === '3mf') {
      // Cache de malhas por mesa para alternância instantânea
      if (!model._geometryCache) model._geometryCache = {};

      if (model._geometryCache[currentPlate]) {
        const cached = model._geometryCache[currentPlate];
        geometry = cached.geometry;
        dimensions = cached.dimensions;
        volumeCm3 = cached.volumeCm3;
        triangleCount = cached.triangleCount;
      } else {
        try {
          const parsed3MF = await parse3MFGeometry(buffer, currentPlate);
          geometry = parsed3MF.geometry;
          dimensions = parsed3MF.dimensions;
          volumeCm3 = parsed3MF.volumeCm3;
          triangleCount = parsed3MF.triangleCount;
          model._geometryCache[currentPlate] = parsed3MF;
        } catch (e3d) {
          console.warn('Erro ao extrair malha 3D do 3MF para a mesa:', currentPlate, e3d);
        }
      }
    }

    if (!geometry) {
      console.warn('Geometria não pôde ser gerada para este modelo');
      return;
    }

    // Centralizar e apoiar no chão da grade (Y = 0)
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    geometry.center();
    geometry.computeBoundingBox();
    const yOffset = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2;

    const material = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.35,
      metalness: 0.15,
      wireframe: state.isWireframe
    });

    state.modalMesh = new THREE.Mesh(geometry, material);
    state.modalMesh.position.y = yOffset;
    state.modalScene.add(state.modalMesh);

    // Ajustar câmera
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 25;
    const dist = (radius / Math.sin((45 * Math.PI) / 360)) * 1.5;
    state.modalCamera.near = Math.max(0.1, radius / 100);
    state.modalCamera.far = Math.max(2000, dist * 10);
    state.modalCamera.updateProjectionMatrix();

    state.modalCamera.position.set(dist * 0.8, dist * 0.7, dist * 0.9);
    state.modalControls.target.set(0, yOffset, 0);
    state.modalControls.update();

    state.isMeshLoaded = true;

  } catch (err) {
    console.error('Erro ao carregar modelo no visualizador:', err);
  } finally {
    viewerLoadingOverlay.style.display = 'none';
  }
}

function resetModalCamera() {
  if (!state.modalMesh) return;
  const geometry = state.modalMesh.geometry;
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 25;
  const dist = (radius / Math.sin((45 * Math.PI) / 360)) * 1.5;
  const yOffset = state.modalMesh.position.y;

  state.modalCamera.near = Math.max(0.1, radius / 100);
  state.modalCamera.far = Math.max(2000, dist * 10);
  state.modalCamera.updateProjectionMatrix();

  state.modalCamera.position.set(dist * 0.8, dist * 0.7, dist * 0.9);
  state.modalControls.target.set(0, yOffset, 0);
  state.modalMesh.rotation.set(0, 0, 0);
  state.modalControls.update();
}

function closeViewerModal() {
  viewerModal.classList.remove('active');
  if (state.modalMesh) {
    state.modalScene.remove(state.modalMesh);
    if (state.modalMesh.geometry) state.modalMesh.geometry.dispose();
    state.modalMesh = null;
  }
}

// Utilitários
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inicializar aplicação
window.addEventListener('DOMContentLoaded', init);
