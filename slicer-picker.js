/**
 * Vault3D · Escolha do fatiador (renderer)
 * - Lista os fatiadores detectados pelo processo principal (slicers.js)
 * - Setinha ▾ ao lado do "Abrir no Fatiador" com um menu para abrir em outro fatiador
 * - Modal "Fatiadores": fatiador padrão, abrir 3MF no fatiador que criou o arquivo e fatiadores extras
 * Só existe no app Desktop; na Web o botão continua copiando o caminho.
 */

const api = () => (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.listSlicers === 'function')
  ? window.electronAPI
  : null;

const slicerState = {
  loaded: false,
  slicers: [],
  defaultId: 'system',
  matchCreator: true,
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
  return { short: SHORT_NAMES[id] || s.name, full: s.name };
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
  slicerState.matchCreator = res.matchCreator !== false;
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
      <span>${escapeHtml(cfg.text)}</span>
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
 *   getFullPath: () => Promise<string|null>  caminho do arquivo (para marcar quem criou o 3MF)
 *   onPick: (slicerId) => void               abre o arquivo no fatiador escolhido
 */
export function openSlicerMenu(anchor, { getFullPath, onPick } = {}) {
  if (menuEl && menuEl.dataset.anchorId === anchor.dataset.slicerMenuId) {
    closeSlicerMenu();
    return;
  }
  closeSlicerMenu();
  if (!anchor.dataset.slicerMenuId) anchor.dataset.slicerMenuId = `sm-${Math.random().toString(36).slice(2)}`;

  const items = [
    ...slicerState.slicers.map((s) => ({ id: s.id, name: s.name })),
    { id: 'system', name: slicerState.systemName }
  ];

  menuEl = document.createElement('div');
  menuEl.className = 'slicer-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.dataset.anchorId = anchor.dataset.slicerMenuId;
  menuEl.innerHTML = `
    <div class="slicer-menu-head">Abrir com</div>
    ${items.map((it) => `
      <button class="slicer-menu-item" type="button" role="menuitem" data-slicer-id="${escapeHtml(it.id)}">
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

  // Marca o fatiador que criou o 3MF (quando instalado)
  const a = api();
  const currentMenu = menuEl;
  if (a && typeof a.get3mfCreator === 'function' && typeof getFullPath === 'function') {
    Promise.resolve(getFullPath()).then((fullPath) => {
      if (!fullPath || !/\.3mf$/i.test(fullPath)) return null;
      return a.get3mfCreator(fullPath);
    }).then((res) => {
      if (!res || !res.slicerId || menuEl !== currentMenu) return;
      const tag = currentMenu.querySelector(`[data-tag-for="${CSS.escape(res.slicerId)}"]`);
      if (tag) tag.textContent = tag.textContent ? `${tag.textContent} · criou o arquivo` : 'criou o arquivo';
    }).catch(() => {});
  }
}

/* ---------------------- Modal "Fatiadores" ---------------------- */

let modalBuilt = false;

function buildModal() {
  if (modalBuilt) return document.getElementById('slicerSettingsModal');
  modalBuilt = true;
  const modal = document.createElement('div');
  modal.className = 'modal move-modal slicer-settings-modal';
  modal.id = 'slicerSettingsModal';
  modal.style.display = 'none';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'slicerSettingsTitle');
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="move-card slicer-settings-card">
      <div class="move-card-head">
        <h3 class="move-card-title" id="slicerSettingsTitle">Fatiadores</h3>
        <p class="move-card-sub">Escolha qual fatiador o botão Abrir no Fatiador usa</p>
      </div>
      <ul class="slicer-list" id="slicerSettingsList" role="radiogroup" aria-label="Fatiador padrão"></ul>
      <label class="slicer-toggle">
        <input type="checkbox" id="slicerMatchCreator">
        <span class="slicer-toggle-track" aria-hidden="true"></span>
        <span class="slicer-toggle-text">
          <strong>Abrir 3MF no fatiador que criou o arquivo</strong>
          <small>Um 3MF do Bambu Studio abre no Bambu Studio, mesmo com outro padrão. STL usa o padrão.</small>
        </span>
      </label>
      <div class="move-card-footer">
        <button type="button" class="btn-move-new" id="btnAddCustomSlicer">+ Adicionar outro fatiador</button>
        <div class="move-card-footer-right">
          <button type="button" class="btn-move-confirm" data-close>Concluir</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) {
      closeSlicerSettings();
      return;
    }
    const remove = e.target.closest('.slicer-remove');
    if (remove) {
      e.preventDefault();
      e.stopPropagation();
      applyState(await api().removeCustomSlicer(remove.dataset.id));
      renderModalList();
      return;
    }
    const row = e.target.closest('.slicer-row');
    if (row && row.dataset.id !== slicerState.defaultId) {
      applyState(await api().setSlicerPrefs({ defaultId: row.dataset.id }));
      renderModalList();
    }
  });

  modal.querySelector('#slicerMatchCreator').addEventListener('change', async (e) => {
    applyState(await api().setSlicerPrefs({ matchCreator: e.target.checked }));
  });

  modal.querySelector('#btnAddCustomSlicer').addEventListener('click', async () => {
    const res = await api().addCustomSlicer();
    if (res && !res.canceled) {
      applyState(res);
      renderModalList();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      e.stopPropagation();
      closeSlicerSettings();
    }
  }, true);

  return modal;
}

function renderModalList() {
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
        <span class="slicer-row-name">${escapeHtml(s.name)}</span>
        ${s.system ? '<span class="slicer-row-tag">programa associado no Windows</span>' : ''}
        ${s.custom ? `<button type="button" class="slicer-remove" data-id="${escapeHtml(s.id)}" title="Remover da lista" aria-label="Remover ${escapeHtml(s.name)}">&times;</button>` : ''}
      </li>`;
  }).join('');
  if (!slicerState.slicers.length) {
    list.insertAdjacentHTML('afterbegin', '<li class="slicer-empty">Nenhum fatiador encontrado automaticamente. Use "Adicionar outro fatiador" para escolher o programa.</li>');
  }
  const toggle = document.getElementById('slicerMatchCreator');
  if (toggle) toggle.checked = slicerState.matchCreator;
}

export async function openSlicerSettings() {
  if (!api()) return;
  const modal = buildModal();
  renderModalList();
  modal.style.display = 'flex';
  // Detecta de novo ao abrir: pega fatiadores instalados depois que o app abriu
  await loadSlicers(true);
  renderModalList();
}

export function closeSlicerSettings() {
  const modal = document.getElementById('slicerSettingsModal');
  if (modal) modal.style.display = 'none';
}

export function initSlicerPicker() {
  if (!api()) return;
  loadSlicers();
  const nav = document.getElementById('navSlicers');
  if (nav) nav.addEventListener('click', openSlicerSettings);
  // Enter/Espaço escolhe a linha no modal
  document.addEventListener('keydown', (e) => {
    const row = e.target && e.target.closest && e.target.closest('.slicer-row');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      row.click();
    }
  });
}
