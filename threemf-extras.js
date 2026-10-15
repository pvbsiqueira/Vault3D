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
  if (/printables/i.test(host)) return 'printables';
  if (/thingiverse/i.test(host)) return 'thingiverse';
  if (/cults3d/i.test(host)) return 'cults3d';
  if (/myminifactory/i.test(host)) return 'myminifactory';
  if (/thangs/i.test(host)) return 'thangs';
  return 'web';
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
  const result = { plates: new Map(), usedExtruders: new Set(), objectCount: 0 };
  if (!file) return result;
  let text = '';
  try { text = await file.async('string'); } catch (_) { return result; }

  const metaValue = (block, key) => {
    const m = block.match(new RegExp(`<metadata\\s+[^>]*?key=["']${key}["'][^>]*?value=["']([^"']*)["']`, 'i'));
    return m ? m[1] : null;
  };

  const objectExtruders = new Map();
  const objectRe = /<object\s+id=["'](\d+)["'][^>]*>([\s\S]*?)<\/object>/gi;
  let m;
  while ((m = objectRe.exec(text))) {
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
    filaments: [], pieces: null, attachments: []
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
