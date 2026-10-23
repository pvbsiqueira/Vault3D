// Regras de quais caminhos e nomes o processo principal aceita vindos da janela do app.
// O app só trabalha com arquivos 3D: qualquer outro arquivo é recusado antes de ler, abrir ou renomear.
const path = require('path');

const MODEL_EXT_RE = /\.(stl|3mf)$/i;
// Nomes reservados do Windows (CON, PRN, AUX, NUL, COM1..9, LPT1..9), com ou sem extensão
const RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

function isModelFilePath(p) {
  return typeof p === 'string'
    && p.length > 0
    && path.isAbsolute(p)
    && !p.includes('\0')
    && MODEL_EXT_RE.test(p);
}

// Nome novo de um arquivo 3D: só o nome (sem pasta), extensão .stl/.3mf e válido no Windows
function isValidModelFileName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed !== name || trimmed.length > 255) return false;
  if (/[\\/:*?"<>|\0]/.test(trimmed)) return false;
  if (trimmed === '.' || trimmed === '..' || /[. ]$/.test(trimmed)) return false;
  if (RESERVED_NAME_RE.test(trimmed)) return false;
  return MODEL_EXT_RE.test(trimmed);
}

// Pedaço de arquivo pedido pela janela: números inteiros, sem negativo e com limite de tamanho
function isValidChunkRequest(start, length) {
  return Number.isSafeInteger(start) && start >= 0
    && Number.isSafeInteger(length) && length >= 0 && length <= MAX_CHUNK_BYTES;
}

// Só endereços da API pública do MakerOnline podem ser consultados pela janela
function isAllowedMakerOnlineUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.makeronline.com' && u.pathname.startsWith('/api/');
  } catch (_) {
    return false;
  }
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

module.exports = {
  MODEL_EXT_RE,
  MAX_CHUNK_BYTES,
  isModelFilePath,
  isValidModelFileName,
  isValidChunkRequest,
  isAllowedMakerOnlineUrl,
  isHttpUrl
};
