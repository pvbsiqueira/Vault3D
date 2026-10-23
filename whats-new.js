/**
 * Janela "Novidades": abre sozinha uma vez por versão depois de uma atualização
 * e pelo botão de presente ao lado de "Cards". A pessoa pode desligar a abertura automática.
 */
import { CHANGELOG } from './changelog.js';

const STORAGE_KEY = 'vault3d_whats_new';

/** -1, 0 ou 1 comparando "1.4.10" com "1.5.0" */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Versões mais novas que a última vista (todas, da mais nova para a mais antiga) */
export function unseenEntries(changelog, lastSeen) {
  if (!lastSeen) return changelog.slice(0, 1);
  return changelog.filter(e => compareVersions(e.version, lastSeen) > 0);
}

/**
 * Quem acabou de instalar não vê a janela: só quem já usava o app e atualizou.
 * prefs = { lastSeen, autoOpen }, existingUser = já tinha dados do app antes desta versão
 */
export function shouldAutoOpen(changelog, prefs, existingUser) {
  if (!changelog.length || prefs.autoOpen === false) return false;
  if (!prefs.lastSeen) return existingUser;
  return unseenEntries(changelog, prefs.lastSeen).length > 0;
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return { lastSeen: raw && raw.lastSeen || null, autoOpen: !(raw && raw.autoOpen === false) };
  } catch {
    return { lastSeen: null, autoOpen: true };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* sem armazenamento */ }
}

function hasOtherAppData() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== STORAGE_KEY && /^(antigravity_|vault3d_)/.test(key)) return true;
    }
  } catch { /* sem armazenamento */ }
  return false;
}

function esc(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ICONS = {
  spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  palette: '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  offline: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 4.1"/><circle cx="12" cy="20" r="1"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  rename: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.gift}</svg>`;
}

const ACTION_LABELS = { filaments: 'Abrir Filamentos', settings: 'Abrir Configurações' };

let prefs = loadPrefs();
// Lido ao carregar o módulo, antes de o app gravar qualquer coisa nesta sessão
const EXISTING_USER = hasOtherAppData();
let dialog = null;
let pages = [];
let pageIndex = 0;
let button = null;

function updateDot() {
  if (!button || !CHANGELOG.length) return;
  const unseen = !prefs.lastSeen || compareVersions(CHANGELOG[0].version, prefs.lastSeen) > 0;
  button.classList.toggle('has-news', unseen);
  button.title = unseen ? `Novidades da versão ${CHANGELOG[0].version}` : 'Novidades';
}

function markSeen() {
  if (!CHANGELOG.length) return;
  prefs.lastSeen = CHANGELOG[0].version;
  savePrefs(prefs);
  updateDot();
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
}

function buildDialog() {
  const el = document.createElement('dialog');
  el.className = 'wn-dialog';
  el.setAttribute('aria-labelledby', 'wnTitle');
  el.innerHTML = `
    <div class="wn-head">
      <span class="wn-head-icon">${icon('gift', 20)}</span>
      <div class="wn-head-text">
        <span class="wn-eyebrow" data-eyebrow></span>
        <h3 id="wnTitle" data-title></h3>
      </div>
      <button type="button" class="wn-x" data-close title="Fechar (Esc)" aria-label="Fechar">&times;</button>
    </div>
    <ul class="wn-items" data-items></ul>
    <div class="wn-foot">
      <label class="wn-check"><input type="checkbox" data-auto> Não mostrar as novidades automaticamente</label>
      <div class="wn-nav" data-nav>
        <button type="button" class="wn-arrow" data-next title="Versão anterior" aria-label="Versão anterior">‹</button>
        <span data-count></span>
        <button type="button" class="wn-arrow" data-prev title="Versão mais nova" aria-label="Versão mais nova">›</button>
      </div>
      <button type="button" class="btn-move-confirm wn-ok" data-close autofocus>Entendi</button>
    </div>`;
  document.body.appendChild(el);

  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => el.close()));
  el.addEventListener('click', (e) => { if (e.target === el) el.close(); });
  el.addEventListener('close', markSeen);
  el.querySelector('[data-next]').addEventListener('click', () => { if (pageIndex < pages.length - 1) { pageIndex++; renderPage(); } });
  el.querySelector('[data-prev]').addEventListener('click', () => { if (pageIndex > 0) { pageIndex--; renderPage(); } });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') el.querySelector('[data-next]').click();
    if (e.key === 'ArrowRight') el.querySelector('[data-prev]').click();
  });
  el.querySelector('[data-auto]').addEventListener('change', (e) => {
    prefs.autoOpen = !e.target.checked;
    savePrefs(prefs);
  });
  el.querySelector('[data-items]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    el.close();
    document.dispatchEvent(new CustomEvent('vault3d:navigate', { detail: { section: btn.dataset.action } }));
  });
  return el;
}

function renderPage() {
  const entry = pages[pageIndex];
  if (!entry || !dialog) return;
  dialog.querySelector('[data-eyebrow]').textContent = `Versão ${entry.version}${entry.date ? ` · ${formatDate(entry.date)}` : ''}`;
  dialog.querySelector('[data-title]').textContent = entry.title || 'Novidades';
  dialog.querySelector('[data-items]').innerHTML = entry.items.map(it => `
    <li class="wn-item">
      <span class="wn-item-icon">${icon(it.icon)}</span>
      <div class="wn-item-text">
        <b>${esc(it.title)}</b>
        <p>${esc(it.text)}</p>
      </div>
      ${it.action && ACTION_LABELS[it.action] ? `<button type="button" class="wn-item-go" data-action="${esc(it.action)}">${ACTION_LABELS[it.action]} →</button>` : ''}
    </li>`).join('');
  const nav = dialog.querySelector('[data-nav]');
  nav.hidden = pages.length < 2;
  dialog.querySelector('[data-count]').textContent = `${pageIndex + 1} / ${pages.length}`;
  dialog.querySelector('[data-next]').disabled = pageIndex >= pages.length - 1;
  dialog.querySelector('[data-prev]').disabled = pageIndex === 0;
}

/** Abre a janela. Sem argumento, mostra o histórico inteiro começando pela versão atual. */
export function openWhatsNew(entries = CHANGELOG) {
  if (!entries.length) return;
  if (!dialog) dialog = buildDialog();
  pages = entries;
  pageIndex = 0;
  dialog.querySelector('[data-auto]').checked = prefs.autoOpen === false;
  renderPage();
  if (!dialog.open) dialog.showModal();
}

export function initWhatsNew({ button: btn, isAppVisible }) {
  const existingUser = EXISTING_USER;
  button = btn;
  if (button) button.addEventListener('click', () => openWhatsNew());
  updateDot();

  if (!shouldAutoOpen(CHANGELOG, prefs, existingUser)) {
    // Primeira instalação: as novidades desta versão já contam como vistas
    if (!prefs.lastSeen && !existingUser) markSeen();
    return;
  }
  const entries = unseenEntries(CHANGELOG, prefs.lastSeen);
  // Espera o painel aparecer (depois do login) e não abre por cima de outra janela
  const tryOpen = () => {
    if (!isAppVisible()) return false;
    if (document.querySelector('dialog[open], .update-installing, .modal.active')) return false;
    openWhatsNew(entries);
    return true;
  };
  const timer = setInterval(() => { if (tryOpen()) clearInterval(timer); }, 1500);
}
