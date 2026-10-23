/**
 * Favoritos da biblioteca.
 * Cada arquivo é guardado pelo caminho dentro da pasta conectada ("file:pasta/sub/arquivo.stl"),
 * assim dois arquivos com o mesmo nome em pastas diferentes não viram favoritos juntos.
 * Listas antigas guardavam só o nome do arquivo: esses nomes continuam valendo e são
 * convertidos para o caminho na primeira vez que o arquivo aparece na biblioteca.
 */

export const FAVORITES_STORAGE_KEY = 'antigravity_3d_library_favorites';
const FILE_PREFIX = 'file:';

/**
 * Caminho do arquivo relativo à pasta conectada, com barras normais
 */
function relativePathOf(model) {
  let p = String(model.path || model.name || '').replace(/\\/g, '/');
  const folder = String(model.folderName || '').replace(/\\/g, '/');
  if (folder && p.toLowerCase().startsWith(folder.toLowerCase() + '/')) {
    p = p.substring(folder.length + 1);
  }
  return p;
}

/**
 * Chave de favorito de um arquivo (o Windows não diferencia maiúsculas de minúsculas)
 */
export function favoriteKeyOf(model) {
  if (!model) return '';
  return `${FILE_PREFIX}${String(model.folderName || '').toLowerCase()}/${relativePathOf(model).toLowerCase()}`;
}

/**
 * O arquivo é favorito pela chave nova ou por uma chave antiga (nome ou caminho)?
 */
export function isFileFavorite(favs, model) {
  if (!favs || !model) return false;
  return favs.has(favoriteKeyOf(model)) || legacyKeysOf(model).some(k => favs.has(k));
}

function legacyKeysOf(model) {
  return [model.name, model.path].filter(Boolean);
}

/**
 * Marca isFavorite nos modelos e converte as chaves antigas para a nova.
 * Retorna true quando a lista mudou e precisa ser salva.
 */
export function applyFavorites(favs, models) {
  let changed = false;
  (models || []).forEach(model => {
    const key = favoriteKeyOf(model);
    if (favs.has(key)) {
      model.isFavorite = true;
    } else if (legacyKeysOf(model).some(k => favs.has(k))) {
      model.isFavorite = true;
      favs.add(key);
      changed = true;
    } else {
      model.isFavorite = false;
    }
  });
  return changed;
}

export function addFileFavorite(favs, model) {
  favs.add(favoriteKeyOf(model));
}

/**
 * Tira o arquivo dos favoritos, incluindo as chaves antigas que apontavam para ele
 */
export function removeFileFavorite(favs, model) {
  favs.delete(favoriteKeyOf(model));
  legacyKeysOf(model).forEach(k => favs.delete(k));
}

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    console.warn('Erro ao carregar favoritos do localStorage:', e);
    return new Set();
  }
}

export function saveFavorites(favSet) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favSet)));
  } catch (e) {
    console.warn('Erro ao salvar favoritos no localStorage:', e);
  }
}
