/**
 * Vault3D · Fatiadores instalados (processo principal do Electron)
 * Detecta os fatiadores do Windows e guarda o fatiador padrão escolhido pelo usuário.
 */
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// Fatiadores conhecidos. "dir" casa com o nome da pasta de instalação e "exe" com o executável.
const KNOWN_SLICERS = [
  { id: 'bambu', name: 'Bambu Studio', dir: /^bambu ?studio/i, exe: ['bambu-studio.exe'] },
  { id: 'orca', name: 'OrcaSlicer', dir: /^orca ?slicer/i, exe: ['orca-slicer.exe', 'OrcaSlicer.exe'] },
  { id: 'prusa', name: 'PrusaSlicer', dir: /^(prusa3d|prusaslicer)/i, exe: ['prusa-slicer.exe'] },
  { id: 'cura', name: 'UltiMaker Cura', dir: /^(ulti ?maker )?cura/i, exe: ['UltiMaker-Cura.exe', 'Ultimaker-Cura.exe', 'Cura.exe'] },
  { id: 'creality', name: 'Creality Print', dir: /^creality/i, exe: ['CrealityPrint.exe', 'Creality Print.exe'] },
  // O AnycubicSlicerNext.exe é só um lançador sem ícone próprio: o logo fica nas imagens do programa
  { id: 'anycubic', name: 'Anycubic Slicer Next', dir: /^anycubic ?slicer/i, exe: ['AnycubicSlicerNext.exe', 'anycubicslicernext.exe', 'AnycubicSlicer.exe'],
    icons: ['resources/images/AnycubicSlicerNext_256px.png', 'resources/images/AnycubicSlicer_64.png', 'resources/images/AnycubicSlicer.ico'] },
  { id: 'elegoo', name: 'ElegooSlicer', dir: /^elegoo ?slicer/i, exe: ['elegoo-slicer.exe', 'ElegooSlicer.exe'] },
  { id: 'flashforge', name: 'Orca-Flashforge', dir: /^orca-flashforge/i, exe: ['orca-flashforge.exe', 'Orca-Flashforge.exe'] },
  { id: 'snapmaker', name: 'Snapmaker Orca', dir: /^snapmaker ?orca/i, exe: ['snapmaker-orca.exe', 'Snapmaker_Orca.exe', 'Snapmaker Orca.exe'] },
  { id: 'qidi', name: 'QIDIStudio', dir: /^qidi ?studio/i, exe: ['qidi-studio.exe', 'QIDIStudio.exe'] },
  { id: 'superslicer', name: 'SuperSlicer', dir: /^superslicer/i, exe: ['superslicer.exe'] }
];

const SYSTEM_ID = 'system';
const SYSTEM_ENTRY = { id: SYSTEM_ID, name: 'Padrão do Windows', exePath: null, custom: false };

let prefsFile = null;
let detectedCache = null;

function init(userDataDir) {
  prefsFile = path.join(userDataDir, 'fatiadores.json');
}

function readPrefs() {
  const base = { defaultId: SYSTEM_ID, custom: [] };
  try {
    if (prefsFile && fs.existsSync(prefsFile)) {
      const saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
      return {
        defaultId: typeof saved.defaultId === 'string' ? saved.defaultId : base.defaultId,
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
  return { slicers, defaultId, systemName: SYSTEM_ENTRY.name };
}

function setPrefs({ defaultId } = {}) {
  const prefs = readPrefs();
  if (typeof defaultId === 'string') prefs.defaultId = defaultId;
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
 * Decide em qual fatiador abrir: escolha explícita (menu da setinha) > padrão do usuário.
 * Retorna slicer null para usar o programa padrão do Windows.
 */
async function resolveSlicerFor(filePath, slicerId) {
  const { slicers, defaultId } = await listSlicers();
  if (slicerId === SYSTEM_ID) return { slicer: null, reason: 'explicit' };
  if (slicerId) {
    const chosen = slicers.find((s) => s.id === slicerId);
    if (chosen) return { slicer: chosen, reason: 'explicit' };
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
  resolveSlicerFor
};
