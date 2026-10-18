/**
 * Vault3D · Fatiadores instalados (processo principal do Electron)
 * Detecta os fatiadores do Windows, guarda o fatiador padrão escolhido pelo usuário
 * e descobre qual fatiador criou um 3MF (metadado "Application" do 3D/3dmodel.model).
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { execFile } = require('child_process');

// Fatiadores conhecidos. "dir" casa com o nome da pasta de instalação, "exe" com o executável
// e "creator" com o metadado Application gravado no 3MF (ex.: "BambuStudio-01.09.07.52").
const KNOWN_SLICERS = [
  { id: 'bambu', name: 'Bambu Studio', dir: /^bambu ?studio/i, exe: ['bambu-studio.exe'], creator: /bambu ?studio/i },
  { id: 'orca', name: 'OrcaSlicer', dir: /^orca ?slicer/i, exe: ['orca-slicer.exe', 'OrcaSlicer.exe'], creator: /^orca ?slicer/i },
  { id: 'prusa', name: 'PrusaSlicer', dir: /^(prusa3d|prusaslicer)/i, exe: ['prusa-slicer.exe'], creator: /prusa ?slicer|slic3r/i },
  { id: 'cura', name: 'UltiMaker Cura', dir: /^(ulti ?maker )?cura/i, exe: ['UltiMaker-Cura.exe', 'Ultimaker-Cura.exe', 'Cura.exe'], creator: /cura/i },
  { id: 'creality', name: 'Creality Print', dir: /^creality/i, exe: ['CrealityPrint.exe', 'Creality Print.exe'], creator: /creality/i },
  // O AnycubicSlicerNext.exe é só um lançador sem ícone próprio: o logo fica nas imagens do programa
  { id: 'anycubic', name: 'Anycubic Slicer Next', dir: /^anycubic ?slicer/i, exe: ['AnycubicSlicerNext.exe', 'anycubicslicernext.exe', 'AnycubicSlicer.exe'], creator: /anycubic/i,
    icons: ['resources/images/AnycubicSlicerNext_256px.png', 'resources/images/AnycubicSlicer_64.png', 'resources/images/AnycubicSlicer.ico'] },
  { id: 'elegoo', name: 'ElegooSlicer', dir: /^elegoo ?slicer/i, exe: ['elegoo-slicer.exe', 'ElegooSlicer.exe'], creator: /elegoo/i },
  { id: 'flashforge', name: 'Orca-Flashforge', dir: /^orca-flashforge/i, exe: ['orca-flashforge.exe', 'Orca-Flashforge.exe'], creator: /flashforge/i },
  { id: 'snapmaker', name: 'Snapmaker Orca', dir: /^snapmaker ?orca/i, exe: ['snapmaker-orca.exe', 'Snapmaker_Orca.exe', 'Snapmaker Orca.exe'], creator: /snapmaker/i },
  { id: 'qidi', name: 'QIDIStudio', dir: /^qidi ?studio/i, exe: ['qidi-studio.exe', 'QIDIStudio.exe'], creator: /qidi/i },
  { id: 'superslicer', name: 'SuperSlicer', dir: /^superslicer/i, exe: ['superslicer.exe'], creator: /superslicer/i }
];

const SYSTEM_ID = 'system';
const SYSTEM_ENTRY = { id: SYSTEM_ID, name: 'Padrão do Windows', exePath: null, custom: false };

let prefsFile = null;
let detectedCache = null;

function init(userDataDir) {
  prefsFile = path.join(userDataDir, 'fatiadores.json');
}

function readPrefs() {
  const base = { defaultId: SYSTEM_ID, matchCreator: true, custom: [] };
  try {
    if (prefsFile && fs.existsSync(prefsFile)) {
      const saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
      return {
        defaultId: typeof saved.defaultId === 'string' ? saved.defaultId : base.defaultId,
        matchCreator: saved.matchCreator !== false,
        custom: Array.isArray(saved.custom) ? saved.custom.filter((c) => c && c.id && c.exePath) : []
      };
    }
  } catch (e) {
    console.warn('Erro ao ler fatiadores.json:', e);
  }
  return base;
}

function writePrefs(prefs) {
  if (!prefsFile) return;
  try {
    fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2), 'utf8');
  } catch (e) {
    console.warn('Erro ao salvar fatiadores.json:', e);
  }
}

/** Procura um dos executáveis dentro da pasta (e em uma subpasta, ex.: Creality\Creality Print 5.1) */
function findExeIn(dir, exeNames, depth = 1) {
  for (const exe of exeNames) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  if (depth <= 0) return null;
  let subs = [];
  try {
    subs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (_) {
    return null;
  }
  // Versão mais nova primeiro (ex.: "UltiMaker Cura 5.8.1" antes de "5.7.0")
  subs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const sub of subs) {
    const found = findExeIn(path.join(dir, sub), exeNames, depth - 1);
    if (found) return found;
  }
  return null;
}

function scanProgramFolders() {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')
  ].filter(Boolean);
  const uniqueRoots = [...new Set(roots.map((r) => r.toLowerCase()))].map((lower) => roots.find((r) => r.toLowerCase() === lower));

  const found = {};
  for (const root of uniqueRoots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (_) {
      continue;
    }
    entries.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const def of KNOWN_SLICERS) {
      if (found[def.id]) continue;
      for (const name of entries) {
        if (!def.dir.test(name)) continue;
        // "OrcaSlicer" não pode capturar a pasta do Orca-Flashforge/Snapmaker e vice-versa
        if (def.id === 'orca' && /flashforge|snapmaker/i.test(name)) continue;
        const exe = findExeIn(path.join(root, name), def.exe, 1);
        if (exe) {
          found[def.id] = exe;
          break;
        }
      }
    }
  }
  return found;
}

/** Lê as instalações registradas no Windows (pega fatiadores instalados fora de Arquivos de Programas) */
function queryUninstallRegistry() {
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ];
  const runOne = (key) => new Promise((resolve) => {
    execFile('reg', ['query', key, '/s'], { windowsHide: true, timeout: 8000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
  return Promise.all(keys.map(runOne)).then((outputs) => {
    const apps = [];
    for (const out of outputs) {
      for (const block of out.split(/\r?\n\r?\n/)) {
        const get = (field) => {
          const m = block.match(new RegExp(`^\\s+${field}\\s+REG_(?:EXPAND_)?SZ\\s+(.+)$`, 'mi'));
          return m ? m[1].trim() : '';
        };
        const displayName = get('DisplayName');
        if (!displayName) continue;
        apps.push({
          displayName,
          installLocation: get('InstallLocation').replace(/^"|"$/g, ''),
          displayIcon: get('DisplayIcon').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '')
        });
      }
    }
    return apps;
  });
}

/** Logo do fatiador dentro da pasta de instalação, quando o .exe não traz o ícone da marca */
function findIconFile(def, exePath) {
  if (!def.icons) return null;
  const dir = path.dirname(exePath);
  for (const rel of def.icons) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function detectInstalled(force = false) {
  if (detectedCache && !force) return detectedCache;
  if (process.platform !== 'win32') {
    detectedCache = [];
    return detectedCache;
  }

  const found = scanProgramFolders();

  const missing = KNOWN_SLICERS.filter((d) => !found[d.id]);
  if (missing.length) {
    try {
      const apps = await queryUninstallRegistry();
      for (const def of missing) {
        if (found[def.id]) continue;
        for (const appInfo of apps) {
          if (!def.dir.test(appInfo.displayName)) continue;
          if (def.id === 'orca' && /flashforge|snapmaker/i.test(appInfo.displayName)) continue;
          const iconExe = appInfo.displayIcon && /\.exe$/i.test(appInfo.displayIcon) && fs.existsSync(appInfo.displayIcon)
            && def.exe.some((e) => e.toLowerCase() === path.basename(appInfo.displayIcon).toLowerCase())
            ? appInfo.displayIcon : null;
          const exe = iconExe || (appInfo.installLocation && fs.existsSync(appInfo.installLocation)
            ? findExeIn(appInfo.installLocation, def.exe, 1) : null);
          if (exe) {
            found[def.id] = exe;
            break;
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao consultar fatiadores no registro:', e);
    }
  }

  detectedCache = KNOWN_SLICERS
    .filter((d) => found[d.id])
    .map((d) => ({ id: d.id, name: d.name, exePath: found[d.id], iconPath: findIconFile(d, found[d.id]), custom: false }));
  return detectedCache;
}

async function listSlicers(force = false) {
  const prefs = readPrefs();
  const detected = await detectInstalled(force);
  const custom = prefs.custom
    .filter((c) => fs.existsSync(c.exePath))
    .map((c) => ({ id: c.id, name: c.name, exePath: c.exePath, custom: true }));
  const slicers = [...detected, ...custom];
  const defaultId = slicers.some((s) => s.id === prefs.defaultId) ? prefs.defaultId : SYSTEM_ID;
  return { slicers, defaultId, matchCreator: prefs.matchCreator, systemName: SYSTEM_ENTRY.name };
}

function setPrefs({ defaultId, matchCreator } = {}) {
  const prefs = readPrefs();
  if (typeof defaultId === 'string') prefs.defaultId = defaultId;
  if (typeof matchCreator === 'boolean') prefs.matchCreator = matchCreator;
  writePrefs(prefs);
  return prefs;
}

function addCustom(exePath) {
  if (!exePath || !fs.existsSync(exePath)) return null;
  const prefs = readPrefs();
  const existing = prefs.custom.find((c) => c.exePath.toLowerCase() === exePath.toLowerCase());
  if (existing) return existing;
  const base = path.basename(exePath, path.extname(exePath));
  const known = KNOWN_SLICERS.find((d) => d.exe.some((e) => e.toLowerCase() === path.basename(exePath).toLowerCase()));
  const entry = { id: `custom-${Date.now().toString(36)}`, name: known ? known.name : base, exePath };
  prefs.custom.push(entry);
  writePrefs(prefs);
  return entry;
}

function removeCustom(id) {
  const prefs = readPrefs();
  prefs.custom = prefs.custom.filter((c) => c.id !== id);
  if (prefs.defaultId === id) prefs.defaultId = SYSTEM_ID;
  writePrefs(prefs);
  return true;
}

/**
 * Lê o metadado "Application" do 3MF sem descompactar o arquivo inteiro:
 * acha 3D/3dmodel.model no diretório central do ZIP e infla só o começo dele.
 */
function readCreatorApplication(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557 + 22);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) return null;

    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
      // ZIP64: o localizador fica 20 bytes antes do EOCD
      const loc = eocd - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) return null;
      const z64Offset = Number(tail.readBigUInt64LE(loc + 8));
      const z64 = Buffer.alloc(56);
      fs.readSync(fd, z64, 0, 56, z64Offset);
      cdSize = Number(z64.readBigUInt64LE(40));
      cdOffset = Number(z64.readBigUInt64LE(48));
    }
    if (cdSize > 64 * 1024 * 1024) return null;

    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);

    const entries = {};
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10);
      let compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (compSize === 0xffffffff || localOffset === 0xffffffff) {
        const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
        let e = 0;
        while (e + 4 <= extra.length) {
          const tag = extra.readUInt16LE(e);
          const len = extra.readUInt16LE(e + 2);
          if (tag === 0x0001) {
            let q = e + 4;
            if (cd.readUInt32LE(p + 24) === 0xffffffff) q += 8;
            if (compSize === 0xffffffff) { compSize = Number(extra.readBigUInt64LE(q)); q += 8; }
            if (localOffset === 0xffffffff) { localOffset = Number(extra.readBigUInt64LE(q)); }
            break;
          }
          e += 4 + len;
        }
      }
      entries[name.replace(/\\/g, '/').toLowerCase()] = { name, method, compSize, localOffset };
      p += 46 + nameLen + extraLen + commentLen;
    }

    const readEntryHead = (entry, maxComp) => {
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, entry.localOffset);
      if (lh.readUInt32LE(0) !== 0x04034b50) return '';
      const dataStart = entry.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const len = Math.min(entry.compSize, maxComp);
      const raw = Buffer.alloc(len);
      fs.readSync(fd, raw, 0, len, dataStart);
      if (entry.method === 0) return raw.toString('utf8');
      if (entry.method !== 8) return '';
      return zlib.inflateRawSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString('utf8');
    };

    const modelEntry = entries['3d/3dmodel.model'];
    if (modelEntry) {
      const head = readEntryHead(modelEntry, 256 * 1024);
      const m = head.match(/<metadata[^>]*name\s*=\s*["']Application["'][^>]*>([^<]+)<\/metadata>/i);
      if (m) return m[1].trim();
    }
    // Sem o metadado: pistas pelos arquivos de configuração de cada fatiador
    if (entries['metadata/slic3r_pe.config']) return 'PrusaSlicer';
    if (Object.keys(entries).some((n) => n.startsWith('cura/'))) return 'Cura';
    return null;
  } catch (e) {
    console.warn('Erro ao ler o fatiador de origem do 3MF:', e.message);
    return null;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

/** Fatiador instalado que corresponde ao texto "Application" do 3MF */
function matchCreator(application, slicers) {
  if (!application) return null;
  // Do mais específico para o mais genérico (Orca-Flashforge antes de OrcaSlicer)
  const order = ['flashforge', 'snapmaker', 'anycubic', 'elegoo', 'creality', 'qidi', 'superslicer', 'bambu', 'orca', 'prusa', 'cura'];
  for (const id of order) {
    const def = KNOWN_SLICERS.find((d) => d.id === id);
    if (def && def.creator.test(application)) {
      const s = slicers.find((x) => x.id === id);
      return s || null;
    }
  }
  return null;
}

/**
 * Decide em qual fatiador abrir: escolha explícita > fatiador que criou o 3MF > padrão do usuário.
 * Retorna null para usar o programa padrão do Windows.
 */
async function resolveSlicerFor(filePath, slicerId) {
  const { slicers, defaultId, matchCreator: useCreator } = await listSlicers();
  if (slicerId === SYSTEM_ID) return { slicer: null, reason: 'explicit' };
  if (slicerId) {
    const chosen = slicers.find((s) => s.id === slicerId);
    if (chosen) return { slicer: chosen, reason: 'explicit' };
  }
  if (useCreator && /\.3mf$/i.test(filePath)) {
    const creator = matchCreator(readCreatorApplication(filePath), slicers);
    if (creator) return { slicer: creator, reason: 'creator' };
  }
  return { slicer: slicers.find((s) => s.id === defaultId) || null, reason: 'default' };
}

module.exports = {
  SYSTEM_ID,
  init,
  listSlicers,
  setPrefs,
  addCustom,
  removeCustom,
  resolveSlicerFor,
  readCreatorApplication,
  matchCreator
};
