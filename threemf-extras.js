/**
 * Vault3D · Informações extras do 3MF
 * Lê de dentro do pacote 3MF o que os fatiadores e os sites de modelos gravam além da malha:
 * autor, licença e origem (3D/3dmodel.model), impressora e perfil (project_settings.config ou
 * Slic3r_PE.config), filamentos e cores, peças por mesa (model_settings.config) e os anexos
 * do autor (pasta Auxiliaries). Tudo é opcional: campos ausentes ficam nulos.
 */

const MAX_ATTACHMENTS = 30;

function findFile(zip, path) {
  const direct = zip.file(path);
  if (direct) return direct;
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[\\\\/]');
  return zip.file(new RegExp(`^${escaped}$`, 'i'))[0] || null;
}

function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Converte a descrição (que no Bambu vem em HTML) em texto corrido */
function htmlToText(html) {
  const decoded = decodeEntities(html);
  return decoded
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Lê só o começo do 3dmodel.model (até <resources>), onde ficam os <metadata>.
 * Evita descompactar malhas enormes só para pegar o nome do autor.
 */
function readModelHeader(file) {
  return new Promise((resolve) => {
    let text = '';
    let done = false;
    const decoder = new TextDecoder('utf-8');
    const finish = () => {
      if (done) return;
      done = true;
      resolve(text);
    };
    try {
      const stream = file.internalStream('uint8array');
      stream
        .on('data', (chunk) => {
          if (done) return;
          text += decoder.decode(chunk, { stream: true });
          const cut = text.search(/<resources\b/i);
          if (cut !== -1 || text.length > 4 * 1024 * 1024) {
            if (cut !== -1) text = text.slice(0, cut);
            try { stream.pause(); } catch (_) {}
            finish();
          }
        })
        .on('error', finish)
        .on('end', finish)
        .resume();
    } catch (_) {
      finish();
    }
  });
}

function parseModelMetadata(headerText) {
  const meta = {};
  // Valores vêm escapados (sem "<"), então [^<]* não engole a tag seguinte quando uma vem vazia
  const re = /<metadata\s+name=["']([^"']+)["'][^>]*?(?:\/>|>([^<]*)<\/metadata>)/gi;
  let m;
  while ((m = re.exec(headerText))) {
    meta[m[1].trim()] = (m[2] || '').trim();
  }
  return meta;
}

function pickMeta(meta, ...keys) {
  for (const key of keys) {
    const found = Object.keys(meta).find(k => k.toLowerCase() === key.toLowerCase());
    if (!found || !meta[found]) continue;
    // Bambu grava listas vazias como "[]" (às vezes com aspas escapadas)
    const value = decodeEntities(decodeEntities(meta[found])).replace(/^"|"$/g, '').trim();
    if (value && value !== '[]') return value;
  }
  return null;
}

/** Descobre de qual site o arquivo veio e monta o link da página, quando possível */
function detectSource(meta) {
  const modelId = pickMeta(meta, 'DesignModelId');
  const profileId = pickMeta(meta, 'DesignProfileId');
  if (modelId && /^\d+$/.test(modelId)) {
    return {
      site: 'makerworld',
      url: `https://makerworld.com/models/${modelId}${profileId && /^\d+$/.test(profileId) ? `#profileId-${profileId}` : ''}`
    };
  }
  const candidates = [pickMeta(meta, 'Origin'), pickMeta(meta, 'Source'), pickMeta(meta, 'URL')].filter(Boolean);
  for (const c of candidates) {
    const url = (c.match(/https?:\/\/[^\s"'<>]+/i) || [])[0];
    if (url) return { site: siteFromUrl(url), url };
  }
  // MakerWorld novo: DesignModelId vem como código (ex.: USba2e42ffa38e4e), que não forma o endereço
  // da página. Nesse caso o botão abre a busca do MakerWorld pelo título do modelo.
  if (modelId || profileId || pickMeta(meta, 'DesignerUserId', 'ProfileUserId')) {
    const title = pickMeta(meta, 'Title');
    return title
      ? { site: 'makerworld', url: `https://makerworld.com/en/search/models?keyword=${encodeURIComponent(title)}`, search: true }
      : { site: 'makerworld', url: null };
  }
  return null;
}

export function siteFromUrl(url) {
  if (!url) return null;
  const host = (url.match(/^https?:\/\/([^/]+)/i) || [])[1] || '';
  if (/makerworld/i.test(host)) return 'makerworld';
  if (/makeronline/i.test(host)) return 'makeronline';
  if (/printables/i.test(host)) return 'printables';
  if (/thingiverse/i.test(host)) return 'thingiverse';
  if (/cults3d/i.test(host)) return 'cults3d';
  if (/myminifactory/i.test(host)) return 'myminifactory';
  if (/thangs/i.test(host)) return 'thangs';
  return 'web';
}

const MAKERONLINE_LICENSES = {
  1: 'CC BY',
  2: 'CC BY-SA',
  3: 'CC BY-NC',
  4: 'CC BY-NC-SA',
  5: 'CC BY-ND',
  6: 'CC BY-NC-ND',
  7: 'CC0',
  8: 'Standard Digital File License'
};

/** Lê Metadata/source_info.config gravado pelo MakerOnline / Anycubic Slicer Next */
async function readSourceInfo(zip) {
  const file = findFile(zip, 'Metadata/source_info.config');
  if (!file) return null;
  try {
    const data = JSON.parse(await file.async('string'));
    const moFileId = Number(data && data.mo_file_id);
    if (moFileId > 0) {
      return { moFileId, fileSource: data.file_source ?? null };
    }
  } catch (_) {}
  return null;
}

/** Lê as configurações do projeto: JSON (Bambu/Orca) ou linhas "; chave = valor" (Prusa) */
async function readProjectSettings(zip) {
  const bambu = findFile(zip, 'Metadata/project_settings.config');
  if (bambu) {
    try {
      return JSON.parse(await bambu.async('string'));
    } catch (_) { /* segue para o formato INI */ }
  }
  const prusa = findFile(zip, 'Metadata/Slic3r_PE.config') || findFile(zip, 'Metadata/PrusaSlicer.config');
  const file = prusa || bambu;
  if (!file) return null;
  try {
    const text = await file.async('string');
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^;?\s*([a-z0-9_]+)\s*=\s*(.*)$/i);
      if (m) out[m[1]] = m[2].trim();
    }
    // Prusa guarda listas separadas por ";"
    for (const key of ['filament_colour', 'extruder_colour', 'filament_type', 'filament_settings_id', 'nozzle_diameter']) {
      if (typeof out[key] === 'string' && out[key].includes(';')) out[key] = out[key].split(';').map(v => v.replace(/^"|"$/g, '').trim());
    }
    return out;
  } catch (_) {
    return null;
  }
}

const asList = (v) => Array.isArray(v) ? v : (v === undefined || v === null || v === '' ? [] : [v]);
const first = (v) => asList(v)[0];

function cleanProfileName(name) {
  if (!name) return null;
  return String(name).replace(/^"|"$/g, '').replace(/\s*@.*$/, '').trim() || null;
}

function formatMm(value) {
  const n = parseFloat(value);
  if (!n) return null;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm`;
}

function describeSupport(settings) {
  const enabled = settings.enable_support ?? settings.support_material;
  if (enabled === undefined) return null;
  if (String(enabled) === '0' || String(enabled).toLowerCase() === 'false') return 'Sem suporte';
  const type = String(settings.support_type || settings.support_material_style || '').toLowerCase();
  if (type.includes('tree') || type.includes('organic')) return 'Árvore';
  if (type) return 'Normal';
  return 'Com suporte';
}

const INFILL_PATTERNS = {
  grid: 'grade', gyroid: 'giroide', honeycomb: 'colmeia', cubic: 'cúbico', line: 'linhas',
  rectilinear: 'retilíneo', triangles: 'triângulos', 'adaptivecubic': 'cúbico adaptativo',
  lightning: 'relâmpago', crosshatch: 'cruzado', zigzag: 'zigue-zague', concentric: 'concêntrico'
};

function describeInfill(settings) {
  const density = settings.sparse_infill_density ?? settings.fill_density;
  if (density === undefined || density === null || density === '') return null;
  const pct = String(density).includes('%') ? String(density) : `${Math.round(parseFloat(density) * (parseFloat(density) <= 1 ? 100 : 1))}%`;
  const pattern = String(settings.sparse_infill_pattern || settings.fill_pattern || '').toLowerCase();
  const label = INFILL_PATTERNS[pattern] || INFILL_PATTERNS[pattern.replace(/[^a-z]/g, '')] || '';
  return label ? `${pct} ${label}` : pct;
}

/**
 * model_settings.config: quais objetos estão em cada mesa e com qual filamento (extrusora)
 * cada objeto/parte foi pintado. Retorna { plates: Map(id -> {objects, extruders:Set}), usedExtruders:Set, objectCount }
 */
async function readModelSettings(zip) {
  const file = findFile(zip, 'Metadata/model_settings.config');
  const result = { plates: new Map(), usedExtruders: new Set(), objectCount: 0, searchHints: [] };
  if (!file) return result;
  let text = '';
  try { text = await file.async('string'); } catch (_) { return result; }

  const metaValue = (block, key) => {
    const m = block.match(new RegExp(`<metadata\\s+[^>]*?key=["']${key}["'][^>]*?value=["']([^"']*)["']`, 'i'));
    return m ? m[1] : null;
  };

  const rawNames = [];
  const objectExtruders = new Map();
  const objectRe = /<object\s+id=["'](\d+)["'][^>]*>([\s\S]*?)<\/object>/gi;
  let m;
  while ((m = objectRe.exec(text))) {
    const objName = metaValue(m[2], 'name');
    if (objName) rawNames.push(decodeEntities(objName));
    const set = new Set();
    const extRe = /key=["']extruder["']\s+value=["'](\d+)["']/gi;
    let e;
    while ((e = extRe.exec(m[2]))) {
      const n = parseInt(e[1], 10);
      if (n > 0) set.add(n);
    }
    if (set.size === 0) set.add(1);
    objectExtruders.set(m[1], set);
  }
  result.objectCount = objectExtruders.size;

  const genericRe = /^(object|part|cube|cylinder|sphere|cone|torus|mesh|default|box|plate|model|item|stl|step|stp|obj|3mf|\d+)([_\s-]*\d+)*$/i;
  const cleanedNames = [];
  for (const n of rawNames) {
    const clean = n
      .replace(/\.(stl|step|stp|obj|3mf)$/i, '')
      .replace(/[_\s-]+(\d+|part\s*\d+|copy)$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length >= 3 && !genericRe.test(clean) && !cleanedNames.some(x => x.toLowerCase() === clean.toLowerCase())) {
      cleanedNames.push(clean);
    }
  }
  // Se vários objetos compartilham uma primeira palavra significativa (ex.: "Ornstein base", "Ornstein body" -> "Ornstein")
  if (cleanedNames.length >= 2) {
    const firstWord = cleanedNames[0].split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3 && !genericRe.test(firstWord)) {
      const sharedCount = cleanedNames.filter(c => c.toLowerCase().startsWith(firstWord.toLowerCase())).length;
      if (sharedCount >= 2 && !cleanedNames.some(x => x.toLowerCase() === firstWord.toLowerCase())) {
        cleanedNames.unshift(firstWord);
      }
    }
  }
  result.searchHints = cleanedNames.slice(0, 6);

  const plateBlocks = text.match(/<plate\b[\s\S]*?<\/plate>/gi) || [];
  plateBlocks.forEach((block, i) => {
    const id = parseInt(metaValue(block, 'plater_id'), 10) || (i + 1);
    const instances = block.match(/<model_instance\b[\s\S]*?<\/model_instance>/gi) || [];
    const extruders = new Set();
    instances.forEach(inst => {
      const objId = metaValue(inst, 'object_id');
      const set = objectExtruders.get(objId);
      if (set) set.forEach(x => { extruders.add(x); result.usedExtruders.add(x); });
    });
    result.plates.set(id, { objects: instances.length, extruders });
  });

  if (plateBlocks.length === 0) {
    objectExtruders.forEach(set => set.forEach(x => result.usedExtruders.add(x)));
  }
  return result;
}

function normalizeColor(c) {
  if (!c) return null;
  const m = String(c).match(/#([0-9a-f]{6})/i);
  return m ? `#${m[1].toLowerCase()}` : null;
}

function rgbStringToHex(paintColor) {
  if (!paintColor) return null;
  const direct = normalizeColor(paintColor);
  if (direct) return direct;
  const parts = String(paintColor).split(',').map(x => parseInt(x.trim(), 10));
  if (parts.length >= 3 && parts.slice(0, 3).every(n => !isNaN(n) && n >= 0 && n <= 255)) {
    return '#' + parts.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('').toLowerCase();
  }
  return null;
}

function parseTimeLabelToSeconds(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return Math.round(timeStr);
  const str = String(timeStr).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const d = (str.match(/(\d+)\s*d/i) || [])[1];
  const h = (str.match(/(\d+)\s*h/i) || [])[1];
  const m = (str.match(/(\d+)\s*m/i) || [])[1];
  const s = (str.match(/(\d+)\s*s/i) || [])[1];
  let total = 0;
  if (d) total += parseInt(d, 10) * 86400;
  if (h) total += parseInt(h, 10) * 3600;
  if (m) total += parseInt(m, 10) * 60;
  if (s) total += parseInt(s, 10);
  return total;
}

function formatSeconds(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)} min`;
}

function listAttachments(zip) {
  const items = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir || items.length >= MAX_ATTACHMENTS) return;
    const norm = relPath.replace(/\\/g, '/');
    if (!/^Auxiliaries\//i.test(norm)) return;
    const parts = norm.split('/');
    const name = parts[parts.length - 1];
    if (!name || name.startsWith('.') || parts.some(p => p.startsWith('.'))) return;
    const ext = (name.split('.').pop() || '').toLowerCase();
    const kind = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) ? 'image' : (ext === 'pdf' ? 'pdf' : 'file');
    const size = entry._data && entry._data.uncompressedSize ? entry._data.uncompressedSize : null;
    items.push({ path: relPath, name, ext, kind, size, group: parts.length > 2 ? parts[1] : '' });
  });
  // Fotos primeiro, depois PDFs e demais arquivos
  const order = { image: 0, pdf: 1, file: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

/**
 * Reúne tudo num objeto simples (vai para o cache do IndexedDB).
 * `plates` recebe as cores e a contagem de peças de cada mesa.
 * `sliceInfo` é o Map de readSliceInfoPlates (tempo/filamento por mesa quando fatiado).
 */
export async function extract3MFExtras(zip, plates = [], sliceInfo = new Map()) {
  const extras = {
    title: null, designer: null, description: null, license: null, copyright: null,
    created: null, application: null, source: null,
    printer: null, printerFull: null, nozzle: null, layerHeight: null, infill: null, support: null, profile: null,
    filaments: [], pieces: null, attachments: [],
    moFileId: null, moResolved: false, moChecked: false, searchHints: []
  };

  // 1. Autor, licença e origem
  const modelFile = findFile(zip, '3D/3dmodel.model');
  if (modelFile) {
    const meta = parseModelMetadata(await readModelHeader(modelFile));
    extras.title = pickMeta(meta, 'Title', 'ProfileTitle');
    extras.designer = pickMeta(meta, 'Designer', 'ProfileUserName', 'Author');
    const desc = pickMeta(meta, 'Description', 'ProfileDescription');
    extras.description = desc ? htmlToText(desc).slice(0, 1200) : null;
    extras.license = pickMeta(meta, 'License');
    extras.copyright = pickMeta(meta, 'Copyright');
    extras.created = pickMeta(meta, 'CreationDate');
    extras.application = pickMeta(meta, 'Application');
    extras.source = detectSource(meta);
  }

  // 1b. MakerOnline / Anycubic Slicer Next: verificar Metadata/source_info.config
  const sourceInfo = await readSourceInfo(zip);
  if (sourceInfo && sourceInfo.moFileId) {
    extras.moFileId = sourceInfo.moFileId;
    if (!extras.source) {
      extras.source = {
        site: 'makeronline',
        url: null,
        moFileId: sourceInfo.moFileId
      };
    }
  } else {
    extras.moChecked = true;
  }

  // 2. Impressora e perfil
  const settings = await readProjectSettings(zip);
  const filamentColors = settings ? asList(settings.filament_colour || settings.extruder_colour).map(normalizeColor) : [];
  const filamentTypes = settings ? asList(settings.filament_type) : [];
  const filamentNames = settings ? asList(settings.filament_settings_id).map(cleanProfileName) : [];
  if (settings) {
    const printerFull = (first(settings.printer_model) || cleanProfileName(first(settings.printer_settings_id)) || '').replace(/\s*\d+(\.\d+)?\s*nozzle$/i, '').trim();
    extras.printerFull = printerFull || null;
    extras.printer = printerFull ? printerFull.replace(/^Bambu Lab\s+/i, '').replace(/^Original\s+Prusa\s+/i, 'Prusa ') : null;
    extras.nozzle = formatMm(first(settings.nozzle_diameter));
    extras.layerHeight = formatMm(first(settings.layer_height));
    extras.infill = describeInfill(settings);
    extras.support = describeSupport(settings);
    extras.profile = cleanProfileName(first(settings.print_settings_id)) || null;
  }

  // 3. Peças e filamentos usados por mesa
  const ms = await readModelSettings(zip);
  if (ms.objectCount) extras.pieces = ms.objectCount;
  if (ms.searchHints && ms.searchHints.length) extras.searchHints = ms.searchHints;

  const filamentInfo = (index) => ({
    color: filamentColors[index - 1] || null,
    type: filamentTypes[index - 1] || null,
    name: filamentNames[index - 1] || null
  });

  const slicedTotals = new Map();
  sliceInfo.forEach(info => {
    (info.filaments || []).forEach(f => {
      const key = f.id || `${f.type}-${f.color}`;
      const prev = slicedTotals.get(key) || { id: f.id, type: f.type, color: normalizeColor(f.color), grams: 0 };
      prev.grams += f.usedG || 0;
      slicedTotals.set(key, prev);
    });
  });

  if (slicedTotals.size > 0) {
    extras.filaments = Array.from(slicedTotals.values())
      .filter(f => f.grams > 0)
      .map(f => {
        const base = f.id ? filamentInfo(f.id) : {};
        return { color: f.color || base.color, type: f.type || base.type, name: base.name, grams: Math.round(f.grams * 10) / 10 };
      })
      .sort((a, b) => b.grams - a.grams);
  } else if (filamentColors.length > 0) {
    const used = ms.usedExtruders.size ? Array.from(ms.usedExtruders).sort((a, b) => a - b) : [1];
    extras.filaments = used
      .filter(i => i <= Math.max(filamentColors.length, filamentTypes.length))
      .map(i => ({ ...filamentInfo(i), grams: null }));
  }

  // Cores e peças em cada mesa
  (plates || []).forEach(plate => {
    if (plate.isCustomCover) return;
    const fromSlice = sliceInfo.get(plate.id);
    let colors = [];
    if (fromSlice && fromSlice.filaments && fromSlice.filaments.length) {
      colors = fromSlice.filaments.filter(f => f.usedG > 0 || !f.usedG).map(f => normalizeColor(f.color) || filamentInfo(f.id || 1).color);
    } else if (ms.plates.has(plate.id)) {
      colors = Array.from(ms.plates.get(plate.id).extruders).sort((a, b) => a - b).map(i => filamentInfo(i).color);
    }
    plate.colors = Array.from(new Set(colors.filter(Boolean)));
    if (ms.plates.has(plate.id)) plate.objectCount = ms.plates.get(plate.id).objects;
  });

  // 4. Anexos do autor
  extras.attachments = listAttachments(zip);

  return extras;
}

// Cache em memória da sessão para evitar buscas repetidas do mesmo mo_file_id
const moSessionCache = new Map();

function buildMakerOnlineKeywords(fileName, extras) {
  const candidates = [];
  const addKw = (raw) => {
    if (!raw) return;
    const clean = String(raw)
      .replace(/\.(3mf|stl|step|stp|obj)$/i, '')
      .replace(/\s*\(\d+\)\s*$/g, '')
      .replace(/\s*-\s*(copy|cópia|copia).*$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length >= 2 && !candidates.some(c => c.toLowerCase() === clean.toLowerCase())) {
      candidates.push(clean);
    }
  };

  if (fileName) {
    addKw(fileName);
    const base = String(fileName)
      .replace(/\.(3mf|stl|step|stp|obj)$/i, '')
      .replace(/\s*\(\d+\)\s*$/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = base.split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      addKw(words.slice(0, -1).join(' '));
      addKw(words.slice(0, 2).join(' '));
    }
    if (words.length >= 2 && words[0].length >= 3) {
      addKw(words[0]);
    }
  }

  if (extras && extras.title) addKw(extras.title);
  if (extras && Array.isArray(extras.searchHints)) {
    for (const h of extras.searchHints) {
      addKw(h);
      const w = String(h).split(/\s+/)[0];
      if (w && w.length >= 3) addKw(w);
    }
  }

  return candidates.slice(0, 6);
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta a API pública do MakerOnline usando `extras.moFileId` (de Metadata/source_info.config)
 * para recuperar autor, título, licença, link direto da página, tempo/gramas por mesa e fotos/PDFs do modelo.
 */
export async function enrichFromMakerOnline(extras, plates = [], slicerData = null, fileName = '') {
  if (!extras || !extras.moFileId) return false;
  if (extras.moResolved) return true;

  const targetMoFileId = Number(extras.moFileId);
  const keywords = buildMakerOnlineKeywords(fileName, extras);

  let matchedDetail = null;
  let matchedProfile = null;

  if (moSessionCache.has(targetMoFileId)) {
    const cached = moSessionCache.get(targetMoFileId);
    matchedDetail = cached.detail;
    matchedProfile = cached.profile;
  } else {
    const checkedMoldIds = new Set();

    for (const kw of keywords) {
      if (matchedDetail) break;
      const searchRes = await fetchJsonWithTimeout('https://www.makeronline.com/api/search/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, print_type: 0, page: 1, page_size: 12 })
      });

      const rows = (searchRes && searchRes.data && Array.isArray(searchRes.data.data)) ? searchRes.data.data : [];
      const moldIds = rows
        .map(r => Number(r.mold_id || r.id))
        .filter(id => id > 0 && !checkedMoldIds.has(id));

      moldIds.forEach(id => checkedMoldIds.add(id));

      // Consulta detalhes em pequenos lotes paralelos de até 4 modelos
      for (let i = 0; i < moldIds.length; i += 4) {
        const batch = moldIds.slice(i, i + 4);
        const details = await Promise.all(
          batch.map(id => fetchJsonWithTimeout(`https://www.makeronline.com/api/mold/detail?id=${id}`))
        );

        for (const dRes of details) {
          const d = dRes && dRes.data;
          if (!d || !Array.isArray(d.print_profiles)) continue;
          const prof = d.print_profiles.find(p =>
            Number(p && p.download && p.download.id) === targetMoFileId ||
            Number(p && p.id) === targetMoFileId
          );
          if (prof) {
            matchedDetail = d;
            matchedProfile = prof;
            break;
          }
        }
        if (matchedDetail) break;
      }
    }

    if (matchedDetail) {
      moSessionCache.set(targetMoFileId, { detail: matchedDetail, profile: matchedProfile });
    }
  }

  if (!matchedDetail) {
    // Mesmo que não tenha encontrado o perfil exato, configura o botão de busca no MakerOnline
    const kw = keywords[0] || '';
    if (!extras.source || !extras.source.url) {
      extras.source = {
        site: 'makeronline',
        url: kw
          ? `https://www.makeronline.com/en/model/list.html?keyword=${encodeURIComponent(kw)}`
          : 'https://www.makeronline.com',
        search: true,
        moFileId: targetMoFileId
      };
    }
    extras.moChecked = true;
    return false;
  }

  // 1. Autor, título, licença, data e link direto da página no MakerOnline
  extras.title = matchedDetail.title || extras.title;
  extras.designer = matchedDetail.user_display_name || matchedDetail.user_name || extras.designer;
  if (matchedDetail.license && MAKERONLINE_LICENSES[matchedDetail.license]) {
    extras.license = MAKERONLINE_LICENSES[matchedDetail.license];
  }
  if (matchedDetail.created_time && !extras.created) {
    extras.created = matchedDetail.created_time;
  }
  if (matchedDetail.description && !extras.description) {
    extras.description = htmlToText(matchedDetail.description).slice(0, 1200);
  }

  const slug = (matchedDetail.title || 'model').trim().replace(/\s+/g, ' ');
  extras.source = {
    site: 'makeronline',
    url: `https://www.makeronline.com/en/model/${encodeURIComponent(slug)}/${matchedDetail.id}.html`,
    moFileId: targetMoFileId,
    moldId: matchedDetail.id
  };

  // 2. Tempos e pesos por mesa de impressão + filamentos
  const profile = matchedProfile || (Array.isArray(matchedDetail.print_profiles) ? matchedDetail.print_profiles[0] : null);
  if (profile) {
    const profileFiles = Array.isArray(profile.files) ? profile.files : [];
    (plates || []).forEach((plate, idx) => {
      if (plate.isCustomCover) return;
      const pf = profileFiles.find(f => Number(f.id) === Number(plate.id)) || profileFiles[idx];
      if (!pf) return;

      const sec = parseTimeLabelToSeconds(pf.print_time);
      if (sec > 0 && !plate.printTimeSeconds) {
        plate.printTimeSeconds = sec;
        plate.printTimeFormatted = formatSeconds(sec);
      }

      if (Array.isArray(pf.materials) && pf.materials.length > 0) {
        const grams = pf.materials.reduce((sum, m) => sum + (parseFloat(m.filament_used_g) || 0), 0);
        if (grams > 0 && !plate.filamentGrams) {
          plate.filamentGrams = Math.round(grams * 10) / 10;
        }
        const types = Array.from(new Set(pf.materials.map(m => m.material_type).filter(Boolean)));
        if (types.length) plate.filamentType = types.join(' + ');

        if (!plate.colors || plate.colors.length === 0) {
          plate.colors = Array.from(new Set(pf.materials.map(m => rgbStringToHex(m.paint_color)).filter(Boolean)));
        }
      }

      if (!extras.layerHeight && pf.layer) {
        extras.layerHeight = formatMm(pf.layer);
      }
    });

    // Filamentos com gramas (materials_label traz o consolidado por cor/material do perfil)
    const matLabels = Array.isArray(profile.materials_label) ? profile.materials_label : [];
    if (matLabels.length > 0) {
      const existingByColor = new Map();
      (extras.filaments || []).forEach(f => {
        if (f.color) existingByColor.set(f.color.toLowerCase(), f);
      });

      const enrichedFilaments = matLabels
        .map((m, i) => {
          const hex = rgbStringToHex(m.paint_color);
          const grams = Math.round((parseFloat(m.filament_used_g) || 0) * 10) / 10;
          const prev = (hex && existingByColor.get(hex)) || (extras.filaments && extras.filaments[i]) || {};
          return {
            color: hex || prev.color || null,
            type: m.material_type || prev.type || null,
            name: prev.name || m.material_type || null,
            grams: grams > 0 ? grams : (prev.grams || null)
          };
        })
        .sort((a, b) => (b.grams || 0) - (a.grams || 0));

      extras.filaments = enrichedFilaments;
    }

    // Atualizar slicerData total do modelo (exibido no card e no cabeçalho do modal)
    const totalSeconds = parseTimeLabelToSeconds(profile.print_time_label) ||
      (plates || []).reduce((sum, p) => sum + (p.printTimeSeconds || 0), 0);
    const totalGrams = (extras.filaments || []).reduce((sum, f) => sum + (f.grams || 0), 0) ||
      (plates || []).reduce((sum, p) => sum + (p.filamentGrams || 0), 0);

    if (slicerData && (totalSeconds > 0 || totalGrams > 0)) {
      if (totalSeconds > 0) {
        slicerData.printTimeSeconds = totalSeconds;
        slicerData.printTimeFormatted = formatSeconds(totalSeconds);
      }
      if (totalGrams > 0) {
        slicerData.filamentGrams = Math.round(totalGrams * 10) / 10;
      }
      const types = Array.from(new Set((extras.filaments || []).map(f => f.type).filter(Boolean)));
      if (types.length) slicerData.filamentType = types.join(' + ');
      slicerData.isSliced = true;
    }
  }

  // 3. Anexos do autor (fotos reais do modelo + guias de montagem em PDF)
  if (!extras.attachments || extras.attachments.length === 0) {
    const attachments = [];
    const imgs = Array.isArray(matchedDetail.images) ? [...matchedDetail.images] : [];
    imgs.sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0));

    imgs.forEach((img, idx) => {
      if (attachments.length >= MAX_ATTACHMENTS) return;
      const url = img && (img.url || img.thumbnail_url);
      if (!url) return;
      const cleanUrl = url.split('?')[0];
      const ext = (cleanUrl.split('.').pop() || 'webp').toLowerCase();
      attachments.push({
        path: url,
        remoteUrl: url,
        thumbnailUrl: img.thumbnail_url || url,
        name: `Foto ${idx + 1}.${ext}`,
        ext,
        kind: 'image',
        size: null,
        group: 'Model Pictures'
      });
    });

    const docs = Array.isArray(matchedDetail.docs) ? matchedDetail.docs : [];
    const modelPageUrl = (extras.source && extras.source.url) || 'https://www.makeronline.com';
    docs.forEach((doc, idx) => {
      if (attachments.length >= MAX_ATTACHMENTS) return;
      if (!doc || !doc.url) return;
      const name = doc.file_name || `Guia ${idx + 1}.pdf`;
      const ext = (name.split('.').pop() || 'pdf').toLowerCase();
      const kind = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image' : (ext === 'pdf' ? 'pdf' : 'file');
      const isPrivateS3 = /acop-prod-private\.s3/i.test(doc.url);
      attachments.push({
        path: doc.url,
        remoteUrl: isPrivateS3 ? modelPageUrl : doc.url,
        externalPageUrl: isPrivateS3 ? modelPageUrl : null,
        name,
        ext,
        kind,
        size: doc.file_size || null,
        group: 'Assembly Guide'
      });
    });

    extras.attachments = attachments;
  }

  extras.moResolved = true;
  extras.moChecked = true;
  return true;
}

