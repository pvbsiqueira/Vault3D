/**
 * Persistência local da biblioteca no IndexedDB: pastas conectadas e cache de miniaturas/metadados.
 */
const DB_NAME = 'antigravity_3d_db';
const DB_VERSION = 2;
const STORE_FOLDERS = 'folders';
const STORE_THUMBS = 'thumbnails_cache';

export function openFoldersDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_THUMBS)) {
        db.createObjectStore(STORE_THUMBS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gera uma chave única e determinística para o arquivo no cache do IndexedDB
 */
export function getModelCacheKey(model) {
  const lastMod = model.file?.lastModified || 0;
  // 3MF ganhou leitura de tempo/filamento, autor, impressora e anexos: prefixo força uma nova leitura uma única vez
  const version = model.type === '3mf' ? 's4:' : '';
  return `${version}${model.folderName || ''}:${model.path || model.name}:${model.size}:${lastMod}`;
}

/**
 * Recupera miniatura e metadados persistidos do IndexedDB
 */
export async function getCachedThumbnail(key) {
  if (!key) return null;
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return null;
    const tx = db.transaction(STORE_THUMBS, 'readonly');
    const store = tx.objectStore(STORE_THUMBS);
    const req = store.get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Erro ao ler thumbnail do cache IndexedDB:', err);
    return null;
  }
}

/**
 * Salva miniatura e metadados no cache persistente do IndexedDB
 */
export async function saveCachedThumbnail(key, data) {
  if (!key || !data || !data.thumbnailUrl) return false;
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return false;
    const tx = db.transaction(STORE_THUMBS, 'readwrite');
    const store = tx.objectStore(STORE_THUMBS);
    store.put({
      key,
      thumbnailUrl: data.thumbnailUrl,
      defaultThumbnailUrl: data.defaultThumbnailUrl || data.thumbnailUrl || null,
      coverSource: data.coverSource || 'auto',
      customCoverUrl: data.customCoverUrl || null,
      metadata: data.metadata || null,
      slicerData: data.slicerData || null,
      plates: data.plates || [],
      extras: data.extras || null,
      cachedAt: Date.now()
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao salvar thumbnail no cache IndexedDB:', err);
    return false;
  }
}

/**
 * Limpa todo o cache de miniaturas do IndexedDB
 */
export async function clearThumbnailCache() {
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return true;
    const tx = db.transaction(STORE_THUMBS, 'readwrite');
    tx.objectStore(STORE_THUMBS).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao limpar cache de thumbnails:', err);
    return false;
  }
}

export async function saveFolderToDB(folderData) {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readwrite');
    const store = tx.objectStore(STORE_FOLDERS);

    // Evitar duplicar registros para o mesmo nome de pasta
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const all = getAllReq.result || [];
      for (const item of all) {
        if (item.name && folderData.name && item.name.toLowerCase() === folderData.name.toLowerCase() && item.id !== folderData.id) {
          store.delete(item.id);
        }
      }
      store.put({
        id: folderData.id,
        name: folderData.name,
        handle: folderData.handle || null,
        count: folderData.count || 0,
        isSample: !!folderData.isSample,
        diskPath: folderData.diskPath || null,
        savedAt: Date.now()
      });
    };

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Erro ao salvar pasta no IndexedDB:', err);
    return false;
  }
}

export async function removeFolderFromDB(folderId) {
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

export async function clearAllFoldersFromDB() {
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

export async function getAllFoldersFromDB() {
  try {
    const db = await openFoldersDB();
    const tx = db.transaction(STORE_FOLDERS, 'readonly');
    const store = tx.objectStore(STORE_FOLDERS);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const raw = req.result || [];
        // Deduplicar pastas salvas por nome
        const unique = [];
        const seenNames = new Set();
        for (const item of raw) {
          const key = (item.name || '').trim().toLowerCase();
          if (key && !seenNames.has(key)) {
            seenNames.add(key);
            unique.push(item);
          }
        }
        resolve(unique);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('Erro ao ler pastas do IndexedDB:', err);
    return [];
  }
}

/**
 * Apaga do cache as miniaturas que não pertencem mais a nenhum arquivo (arquivo editado, movido,
 * renomeado ou apagado). Só mexe nas entradas das pastas carregadas agora, para não perder as
 * miniaturas de uma pasta num HD externo desconectado. Retorna quantas entradas saíram.
 */
export async function pruneThumbnailCache(validKeys, loadedFolderNames) {
  const valid = new Set(validKeys || []);
  const folders = (loadedFolderNames || []).filter(Boolean);
  if (folders.length === 0) return 0;
  const belongsToLoadedFolder = (key) => {
    const rest = key.replace(/^s\d+:/, '');
    return folders.some(name => key.startsWith(name + ':') || rest.startsWith(name + ':'));
  };
  try {
    const db = await openFoldersDB();
    if (!db.objectStoreNames.contains(STORE_THUMBS)) return 0;
    const tx = db.transaction(STORE_THUMBS, 'readwrite');
    const store = tx.objectStore(STORE_THUMBS);
    let removed = 0;
    const req = store.openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = String(cursor.key);
      if (!valid.has(key) && belongsToLoadedFolder(key)) {
        store.delete(cursor.primaryKey);
        removed++;
      }
      cursor.continue();
    };
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => resolve(0);
    });
  } catch (err) {
    console.warn('Erro ao limpar miniaturas antigas do cache:', err);
    return 0;
  }
}
