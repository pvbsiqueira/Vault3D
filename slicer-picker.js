/**
 * Vault3D · Escolha do fatiador (renderer)
 * - Lista os fatiadores detectados pelo processo principal (slicers.js)
 * - Setinha ▾ ao lado do "Abrir no Fatiador" com um menu para abrir em outro fatiador
 * - Seção "Fatiadores" da página Configurações: fatiador padrão e fatiadores extras
 * Só existe no app Desktop; na Web o botão continua copiando o caminho.
 */

const api = () => (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.listSlicers === 'function')
  ? window.electronAPI
  : null;

const slicerState = {
  loaded: false,
  slicers: [],
  defaultId: 'system',
  systemName: 'Padrão do Windows'
};

const listeners = new Set();

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CARET_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

export function isSlicerChoiceSupported() {
  return Boolean(api());
}

export function getSlicerState() {
  return slicerState;
}

export function onSlicersChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Nomes curtos para caber no botão do card
const SHORT_NAMES = {
  anycubic: 'Slicer Next',
  cura: 'Cura',
  flashforge: 'Orca-Flashforge'
};

/** Nome do fatiador para o botão (curto) e para a dica (completo); null se não estiver instalado */
export function getSlicerNames(id) {
  if (!id || id === 'system') return null;
  const s = slicerState.slicers.find((x) => x.id === id);
  if (!s) return null;
  return { short: SHORT_NAMES[id] || s.name, full: s.name, iconUrl: s.iconUrl || null };
}

const GENERIC_SLICER_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;

/** Ícone da marca (tirado do programa instalado) ou um ícone genérico */
export function slicerIconHtml(iconUrl, size = 16) {
  if (!iconUrl) return `<span class="slicer-brand-icon is-generic" aria-hidden="true">${GENERIC_SLICER_ICON}</span>`;
  return `<img class="slicer-brand-icon" src="${escapeHtml(iconUrl)}" width="${size}" height="${size}" alt="" aria-hidden="true" draggable="false">`;
}

/* Último fatiador usado em cada arquivo (fica salvo neste computador) */
const LAST_USED_KEY = 'vault3d_last_slicer_by_file';
let lastUsedCache = null;

function readLastUsed() {
  if (lastUsedCache) return lastUsedCache;
  try {
    lastUsedCache = JSON.parse(localStorage.getItem(LAST_USED_KEY) || '{}') || {};
  } catch (_) {
    lastUsedCache = {};
  }
  return lastUsedCache;
}

/** Último fatiador que abriu o arquivo, se ele ainda estiver na lista */
export function getLastSlicer(fileKey) {
  if (!fileKey) return null;
  const id = readLastUsed()[fileKey];
  if (!id) return null;
  if (id === 'system') return 'system';
  return slicerState.slicers.some((s) => s.id === id) ? id : null;
}

export function setLastSlicer(fileKey, slicerId) {
  if (!fileKey || !slicerId) return;
  const map = readLastUsed();
  if (map[fileKey] === slicerId) return;
  map[fileKey] = slicerId;
  try {
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Erro ao salvar o último fatiador do arquivo:', e);
  }
}

/** Nome do fatiador usado no clique normal (padrão do usuário) */
export function getDefaultSlicerName() {
  const s = slicerState.slicers.find((x) => x.id === slicerState.defaultId);
  return s ? s.name : null;
}

function applyState(res) {
  if (!res) return;
  slicerState.slicers = Array.isArray(res.slicers) ? res.slicers : [];
  slicerState.defaultId = res.defaultId || 'system';
  if (res.systemName) slicerState.systemName = res.systemName;
  slicerState.loaded = true;
  // A setinha só aparece quando há mais de um fatiador para escolher
  document.body.classList.toggle('has-slicer-choice', slicerState.slicers.length >= 2);
  listeners.forEach((fn) => {
    try { fn(slicerState); } catch (e) { console.warn(e); }
  });
}

export async function loadSlicers(force = false) {
  const a = api();
  if (!a) return slicerState;
  document.body.classList.add('can-pick-slicer');
  try {
    applyState(await a.listSlicers(force));
  } catch (e) {
    console.warn('Erro ao carregar fatiadores:', e);
  }
  return slicerState;
}

/** Botão "Abrir no Fatiador" + setinha. A setinha some via CSS quando não há o que escolher. */
export function slicerSplitHtml(cfg, extraClass = '', fileKey = '') {
  const btn = `
    <button class="btn-open-slicer ${extraClass}" title="${escapeHtml(cfg.title)}" type="button"${fileKey ? ` data-slicer-key="${escapeHtml(fileKey)}"` : ''}>
      ${cfg.icon}
      <span>${escapeHtml(cfg.cardText || cfg.text)}</span>
    </button>`;
  if (!isSlicerChoiceSupported()) return btn;
  return `
    <div class="slicer-split">
      ${btn}
      <button class="btn-slicer-caret" type="button" title="Abrir em outro fatiador" aria-label="Abrir em outro fatiador" aria-haspopup="menu">${CARET_ICON}</button>
    </div>`;
}

/* ---------------------- Menu da setinha ---------------------- */

let menuEl = null;
let menuCleanup = null;

function closeSlicerMenu() {
  if (menuCleanup) menuCleanup();
  menuCleanup = null;
  if (menuEl) menuEl.remove();
  menuEl = null;
}

/**
 * Abre o menu de fatiadores ao lado da setinha.
 * @param {HTMLElement} anchor   a setinha clicada
 * @param {object} opts
 *   onPick: (slicerId) => void               abre o arquivo no fatiador escolhido
 */
export function openSlicerMenu(anchor, { onPick } = {}) {
  if (menuEl && menuEl.dataset.anchorId === anchor.dataset.slicerMenuId) {
    closeSlicerMenu();
    return;
  }
  closeSlicerMenu();
  if (!anchor.dataset.slicerMenuId) anchor.dataset.slicerMenuId = `sm-${Math.random().toString(36).slice(2)}`;

  const items = [
    ...slicerState.slicers.map((s) => ({ id: s.id, name: s.name, iconUrl: s.iconUrl })),
    { id: 'system', name: slicerState.systemName, iconUrl: null }
  ];

  menuEl = document.createElement('div');
  menuEl.className = 'slicer-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.dataset.anchorId = anchor.dataset.slicerMenuId;
  menuEl.innerHTML = `
    <div class="slicer-menu-head">Abrir com</div>
    ${items.map((it) => `
      <button class="slicer-menu-item" type="button" role="menuitem" data-slicer-id="${escapeHtml(it.id)}">
        ${slicerIconHtml(it.iconUrl, 18)}
        <span class="slicer-menu-name">${escapeHtml(it.name)}</span>
        <span class="slicer-menu-tag" data-tag-for="${escapeHtml(it.id)}">${it.id === slicerState.defaultId ? 'padrão' : ''}</span>
      </button>`).join('')}
    <div class="slicer-menu-sep"></div>
    <button class="slicer-menu-item slicer-menu-config" type="button" role="menuitem" data-action="config">Configurar fatiadores…</button>
  `;
  document.body.appendChild(menuEl);

  // Posiciona acima ou abaixo da setinha, sempre dentro da janela (sem rolagem)
  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth;
  const mh = menuEl.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw));
  const below = r.bottom + 6 + mh <= window.innerHeight - 8;
  const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - mh);
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
  anchor.classList.add('is-open');

  menuEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('.slicer-menu-item');
    if (!btn) return;
    if (btn.dataset.action === 'config') {
      closeSlicerMenu();
      openSlicerSettings();
      return;
    }
    const id = btn.dataset.slicerId;
    closeSlicerMenu();
    if (onPick) onPick(id);
  });

  const onDocDown = (e) => {
    if (menuEl && !menuEl.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeSlicerMenu();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeSlicerMenu(); } };
  const onScroll = () => closeSlicerMenu();
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onScroll);
  document.addEventListener('scroll', onScroll, true);
  menuCleanup = () => {
    anchor.classList.remove('is-open');
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onScroll);
    document.removeEventListener('scroll', onScroll, true);
  };

}

/* ---------------------- Seção "Fatiadores" da página Configurações ---------------------- */

function renderSettingsList() {
  const list = document.getElementById('slicerSettingsList');
  if (!list) return;
  const rows = [
    ...slicerState.slicers,
    { id: 'system', name: slicerState.systemName, system: true }
  ];
  list.innerHTML = rows.map((s) => {
    const selected = s.id === slicerState.defaultId;
    return `
      <li class="slicer-row ${selected ? 'is-selected' : ''}" data-id="${escapeHtml(s.id)}" role="radio" aria-checked="${selected}" tabindex="0"
          title="${escapeHtml(s.system ? 'Usa o programa que o Windows associa a arquivos .stl e .3mf' : s.exePath || '')}">
        <span class="slicer-row-radio" aria-hidden="true">${selected ? CHECK_ICON : ''}</span>
        ${slicerIconHtml(s.iconUrl, 18)}
        <span class="slicer-row-name">${escapeHtml(s.name)}</span>
        ${s.system ? '<span class="slicer-row-tag">programa associado no Windows</span>' : ''}
        ${s.custom ? `<button type="button" class="slicer-remove" data-id="${escapeHtml(s.id)}" title="Remover da lista" aria-label="Remover ${escapeHtml(s.name)}">&times;</button>` : ''}
      </li>`;
  }).join('');
  if (!slicerState.slicers.length) {
    list.insertAdjacentHTML('afterbegin', '<li class="slicer-empty">Nenhum fatiador encontrado automaticamente. Use "Adicionar outro fatiador" para escolher o programa.</li>');
  }
}

/** Atualiza a seção Fatiadores (detecta de novo: pega fatiadores instalados depois que o app abriu) */
export async function refreshSlicerSettings() {
  if (!api()) return;
  renderSettingsList();
  await loadSlicers(true);
  renderSettingsList();
}

/** "Configurar fatiadores…" no menu leva para a página Configurações (app.js escuta este evento) */
export function openSlicerSettings() {
  document.dispatchEvent(new CustomEvent('vault3d:open-settings', { detail: { section: 'slicers' } }));
}

function bindSettingsSection() {
  const list = document.getElementById('slicerSettingsList');
  if (list) {
    list.addEventListener('click', async (e) => {
      const remove = e.target.closest('.slicer-remove');
      if (remove) {
        e.preventDefault();
        e.stopPropagation();
        applyState(await api().removeCustomSlicer(remove.dataset.id));
        renderSettingsList();
        return;
      }
      const row = e.target.closest('.slicer-row');
      if (row && row.dataset.id !== slicerState.defaultId) {
        applyState(await api().setSlicerPrefs({ defaultId: row.dataset.id }));
        renderSettingsList();
      }
    });
    // Enter/Espaço escolhe a linha
    list.addEventListener('keydown', (e) => {
      const row = e.target.closest && e.target.closest('.slicer-row');
      if (row && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        row.click();
      }
    });
  }
  const btnAdd = document.getElementById('btnAddCustomSlicer');
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const res = await api().addCustomSlicer();
      if (res && !res.canceled) {
        applyState(res);
        renderSettingsList();
      }
    });
  }
}

export function initSlicerPicker() {
  if (!api()) return;
  loadSlicers();
  bindSettingsSection();
}
