/**
 * Página Filamentos: cadastro e controle dos carretéis guardados neste computador.
 * Também diz, no modal do 3MF, se a pessoa tem o material e a cor de cada filamento.
 */
import { brandSuggestions, isKnownBrand, FILAMENT_MATERIALS, FILAMENT_LINES, FILAMENT_COLORS } from './filament-brands.js';
import { normalizeMaterial, normalizeHex, matchFilament, summarizeStock, isEmptySpool } from './filament-match.js';

const STORAGE_KEY = 'vault3d_filament_stock';
const BUY_URL = 'https://vault3d.com.br/indicacoes';
const QUICK_WEIGHTS = [250, 500, 1000, 2000];

let stock = loadStock();
let ui = { container: null, navBadge: null, openExternal: null };
let filter = 'all';
let searchQuery = '';
const listeners = new Set();

function loadStock() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return {
      spools: Array.isArray(raw && raw.spools) ? raw.spools : [],
      customBrands: Array.isArray(raw && raw.customBrands) ? raw.customBrands : []
    };
  } catch {
    return { spools: [], customBrands: [] };
  }
}

function saveStock() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
  } catch (err) {
    console.warn('[Filamentos] Não foi possível salvar o estoque:', err);
  }
  updateNavBadge();
  listeners.forEach(cb => { try { cb(); } catch (e) { console.warn(e); } });
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatGrams(g) {
  const n = Math.max(0, Math.round(Number(g) || 0));
  return n >= 1000 && n % 1000 === 0 ? `${n / 1000} kg` : `${n.toLocaleString('pt-BR')} g`;
}

function formatMoney(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function newId() {
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getSpools() {
  return stock.spools.slice();
}

export function hasSpools() {
  return stock.spools.length > 0;
}

export function onStockChanged(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function spoolLabel(s) {
  return [s.brand, s.material, s.line, s.colorName].filter(Boolean).join(' ');
}

/**
 * Selo ao lado do filamento no modal do 3MF. Vazio quando não há carretéis cadastrados.
 */
export function filamentStatusHtml(filament) {
  if (!stock.spools.length) return '';
  const res = matchFilament(filament, stock.spools);
  if (res.status === 'ok') {
    const s = res.spool;
    const tip = `Você tem: ${spoolLabel(s)} (${formatGrams(s.remainingG)} no carretel)`;
    return `<span class="fil-pill is-ok" title="${esc(tip)}"><i aria-hidden="true">✓</i><span>Tem</span></span>`;
  }
  if (res.status === 'no-color') {
    return `<span class="fil-pill is-miss" title="${esc(`Você tem ${res.material || 'esse material'}, mas não numa cor parecida`)}"><i aria-hidden="true">!</i><span>Sem a cor</span></span>`;
  }
  const mat = res.material || 'o material';
  return `<span class="fil-pill is-none" title="${esc(`Nenhum carretel de ${mat} cadastrado`)}"><i aria-hidden="true">✕</i><span>Sem ${esc(mat)}</span></span>`;
}

function updateNavBadge() {
  if (!ui.navBadge) return;
  const count = stock.spools.length;
  ui.navBadge.textContent = String(count);
  ui.navBadge.hidden = count === 0;
}

export function initFilamentStock({ container, navBadge, openExternal }) {
  ui = { container, navBadge, openExternal };
  updateNavBadge();
  if (!container) return;
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-fil-filter]');
    if (chip) { filter = chip.dataset.filFilter; renderFilamentPage(); return; }
    if (e.target.closest('[data-fil-add]')) { openSpoolDialog(null); return; }
    const card = e.target.closest('.fil-card');
    if (!card) return;
    const spool = stock.spools.find(s => s.id === card.dataset.id);
    if (!spool) return;
    if (e.target.closest('[data-fil-buy]')) {
      if (typeof ui.openExternal === 'function') ui.openExternal(BUY_URL);
      return;
    }
    if (e.target.closest('[data-fil-edit]')) openSpoolDialog(spool, e.target.closest('[data-fil-focus]') ? 'remaining' : null);
  });
}

export function setFilamentSearch(query) {
  searchQuery = String(query || '').toLowerCase().trim();
}

function visibleSpools() {
  return stock.spools
    .filter(s => {
      if (filter !== 'all') return (normalizeMaterial(s.material) || s.material) === filter;
      return true;
    })
    .filter(s => !searchQuery || spoolLabel(s).toLowerCase().includes(searchQuery))
    .sort((a, b) => (isEmptySpool(a) - isEmptySpool(b))
      || String(a.material).localeCompare(String(b.material), 'pt-BR')
      || String(a.brand).localeCompare(String(b.brand), 'pt-BR')
      || String(a.colorName).localeCompare(String(b.colorName), 'pt-BR'));
}

function cardHtml(s) {
  const pct = s.totalG > 0 ? Math.max(0, Math.min(100, Math.round(100 * s.remainingG / s.totalG))) : 0;
  const color = normalizeHex(s.colorHex) || '#5b6878';
  const empty = isEmptySpool(s);
  const sealed = !empty && s.remainingG >= s.totalG;
  const badge = empty ? '<span class="fil-badge is-empty">Acabou</span>'
    : sealed ? '<span class="fil-badge">Lacrado</span>' : '';
  const sub = [s.material, s.line].filter(Boolean).join(' · ');
  return `<article class="fil-card${empty ? ' is-empty' : ''}" data-id="${esc(s.id)}">
    <div class="fil-card-top">
      <span class="fil-ring" style="--p:${pct};--c:${esc(color)}" title="${pct}% restante"><span style="background:${esc(color)}"></span></span>
      <div class="fil-card-text">
        <b title="${esc(s.brand)}">${esc(s.brand)}</b>
        <small>${esc(sub)}</small>
        <small class="fil-card-color">${esc(s.colorName || 'Sem nome')}</small>
      </div>
      ${badge}
    </div>
    <div class="fil-bar"><i style="width:${pct}%;background:${esc(color)}"></i></div>
    <div class="fil-card-foot">
      <button type="button" class="fil-grams" data-fil-edit data-fil-focus title="Atualizar quanto resta"><b>${formatGrams(s.remainingG)}</b> de ${formatGrams(s.totalG)}</button>
      <div class="fil-card-actions">
        <button type="button" class="fil-btn" data-fil-edit>Editar</button>
        <button type="button" class="fil-btn" data-fil-buy title="Ver filamentos indicados (abre no navegador)">Comprar ↗</button>
      </div>
    </div>
  </article>`;
}

export function renderFilamentPage() {
  const root = ui.container;
  if (!root) return;
  const all = stock.spools;
  if (!all.length) {
    root.innerHTML = `<div class="fil-empty">
      <div class="fil-empty-icon" aria-hidden="true">${spoolSvg(40)}</div>
      <h3>Cadastre seus carretéis</h3>
      <p>Anote marca, material, cor e quanto resta em cada carretel. Ao abrir um 3MF, o Vault3D avisa se você tem o material e a cor de cada filamento.</p>
      <button type="button" class="btn-move-confirm" data-fil-add>+ Adicionar carretel</button>
    </div>`;
    return;
  }

  const sum = summarizeStock(all);
  const materials = Array.from(new Set(all.map(s => normalizeMaterial(s.material) || s.material))).sort();
  if (filter !== 'all' && !materials.includes(filter)) filter = 'all';
  const countOf = (m) => all.filter(s => (normalizeMaterial(s.material) || s.material) === m).length;
  const chip = (key, label, count, extra = '') =>
    `<button type="button" class="fil-chip${filter === key ? ' active' : ''}${extra}" data-fil-filter="${esc(key)}">${esc(label)} <span>${count}</span></button>`;

  const list = visibleSpools();
  root.innerHTML = `
    <div class="fil-stats">
      <div class="fil-stat"><span>Carretéis</span><b>${sum.count}</b></div>
      <div class="fil-stat"><span>Em estoque</span><b>${(sum.grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</b></div>
      <div class="fil-stat"><span>Valor guardado</span><b>${sum.value > 0 ? formatMoney(sum.value) : '—'}</b></div>
    </div>
    <div class="fil-toolbar">
      <div class="fil-chips">
        ${chip('all', 'Todos', all.length)}
        ${materials.map(m => chip(m, m, countOf(m))).join('')}
      </div>
      <button type="button" class="btn-move-confirm fil-add" data-fil-add>+ Adicionar carretel</button>
    </div>
    ${list.length
      ? `<div class="fil-grid">${list.map(cardHtml).join('')}</div>`
      : `<div class="fil-none">Nenhum carretel encontrado${searchQuery ? ` para "${esc(searchQuery)}"` : ''}.</div>`}`;
}

function spoolSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>`;
}

/* ---------- Janela de adicionar / editar carretel ---------- */

let dialog = null;

function buildDialog() {
  const el = document.createElement('dialog');
  el.className = 'fil-dialog';
  el.setAttribute('aria-labelledby', 'filDialogTitle');
  el.innerHTML = `
    <form method="dialog" class="fil-form" novalidate>
      <div class="fil-form-head">
        <h3 id="filDialogTitle">Adicionar carretel</h3>
        <button type="button" class="fil-x" data-close title="Fechar (Esc)" aria-label="Fechar">&times;</button>
      </div>
      <div class="fil-form-grid">
        <label class="fil-field">
          <span>Marca</span>
          <input name="brand" list="filBrandList" autocomplete="off" spellcheck="false" maxlength="40" placeholder="Ex.: Bambu Lab, Voolt3D…">
          <small class="fil-hint" data-brand-hint>Não achou? Digite o nome, ela fica salva na sua lista.</small>
          <datalist id="filBrandList"></datalist>
        </label>
        <label class="fil-field">
          <span>Material</span>
          <select name="material">${FILAMENT_MATERIALS.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>
        </label>
        <label class="fil-field">
          <span>Linha <em>(opcional)</em></span>
          <input name="line" list="filLineList" autocomplete="off" maxlength="40" placeholder="Ex.: Matte, Silk, Basic">
          <datalist id="filLineList">${FILAMENT_LINES.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
        </label>
        <label class="fil-field">
          <span>Preço pago <em>(opcional)</em></span>
          <div class="fil-input-unit is-prefix"><i>R$</i><input name="price" type="number" min="0" step="0.01" placeholder="0,00"></div>
        </label>
        <div class="fil-field fil-span-2">
          <span>Cor</span>
          <div class="fil-colors" role="radiogroup" aria-label="Cor">
            ${FILAMENT_COLORS.map(c => `<button type="button" class="fil-swatch" role="radio" data-hex="${c.hex}" data-name="${esc(c.name)}" title="${esc(c.name)}" style="background:${c.hex}"></button>`).join('')}
            <label class="fil-swatch fil-swatch-custom" title="Outra cor"><input type="color" name="colorHex" value="#1f1f1f" aria-label="Outra cor"></label>
            <input name="colorName" class="fil-color-name" maxlength="30" placeholder="Nome da cor" aria-label="Nome da cor">
          </div>
        </div>
        <label class="fil-field">
          <span>Peso do carretel</span>
          <div class="fil-input-unit"><input name="totalG" type="number" min="1" step="1" value="1000"><i>g</i></div>
          <div class="fil-quick">${QUICK_WEIGHTS.map(w => `<button type="button" data-weight="${w}">${formatGrams(w)}</button>`).join('')}</div>
        </label>
        <label class="fil-field">
          <span>Quanto resta</span>
          <div class="fil-input-unit"><input name="remainingG" type="number" min="0" step="1" value="1000"><i>g</i></div>
          <div class="fil-quick"><button type="button" data-full>Lacrado (cheio)</button><button type="button" data-empty>Acabou</button></div>
        </label>
        <label class="fil-field" data-qty-field>
          <span>Quantidade <em>(carretéis iguais)</em></span>
          <input name="qty" type="number" min="1" max="50" step="1" value="1">
        </label>
      </div>
      <p class="fil-error" data-error hidden></p>
      <div class="fil-form-foot">
        <button type="button" class="fil-delete" data-delete hidden>Excluir carretel</button>
        <span class="fil-foot-spacer"></span>
        <button type="button" class="btn-cancel-logout" data-close>Cancelar</button>
        <button type="submit" class="btn-move-confirm" data-save>Salvar</button>
      </div>
    </form>`;
  document.body.appendChild(el);

  const form = el.querySelector('form');
  const f = form.elements;
  const swatches = Array.from(el.querySelectorAll('.fil-swatch[data-hex]'));
  const presetNames = FILAMENT_COLORS.map(c => c.name);

  const selectColor = (hex, name) => {
    f.colorHex.value = hex;
    swatches.forEach(b => b.setAttribute('aria-checked', String(b.dataset.hex === hex)));
    const custom = el.querySelector('.fil-swatch-custom');
    const isCustom = !swatches.some(b => b.dataset.hex === hex);
    custom.classList.toggle('is-active', isCustom);
    custom.style.background = isCustom ? hex : '';
    if (name != null) f.colorName.value = name;
  };
  el._selectColor = selectColor;

  swatches.forEach(b => b.addEventListener('click', () => {
    const keepName = f.colorName.value.trim() && !presetNames.includes(f.colorName.value.trim());
    selectColor(b.dataset.hex, keepName ? null : b.dataset.name);
  }));
  f.colorHex.addEventListener('input', () => {
    const name = f.colorName.value.trim();
    selectColor(f.colorHex.value, presetNames.includes(name) ? '' : null);
    if (!f.colorName.value.trim()) f.colorName.focus();
  });
  el.querySelectorAll('[data-weight]').forEach(b => b.addEventListener('click', () => {
    const wasFull = Number(f.remainingG.value) === Number(f.totalG.value);
    f.totalG.value = b.dataset.weight;
    if (wasFull || !el._editing) f.remainingG.value = b.dataset.weight;
  }));
  el.querySelector('[data-full]').addEventListener('click', () => { f.remainingG.value = f.totalG.value; });
  el.querySelector('[data-empty]').addEventListener('click', () => { f.remainingG.value = 0; });
  f.brand.addEventListener('input', () => {
    const name = f.brand.value.trim();
    const hint = el.querySelector('[data-brand-hint]');
    const isNew = name && !isKnownBrand(name, stock.customBrands);
    hint.textContent = isNew ? `"${name}" é nova: vai ficar salva na sua lista de marcas.` : 'Não achou? Digite o nome, ela fica salva na sua lista.';
    hint.classList.toggle('is-new', !!isNew);
  });
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => el.close()));
  el.addEventListener('click', (e) => { if (e.target === el) el.close(); });

  const delBtn = el.querySelector('[data-delete]');
  delBtn.addEventListener('click', () => {
    if (!el._editing) return;
    if (!delBtn.classList.contains('is-confirm')) {
      delBtn.classList.add('is-confirm');
      delBtn.textContent = 'Clique de novo para excluir';
      return;
    }
    stock.spools = stock.spools.filter(s => s.id !== el._editing.id);
    saveStock();
    el.close();
    renderFilamentPage();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = el.querySelector('[data-error]');
    const brand = f.brand.value.trim().replace(/\s+/g, ' ');
    const totalG = Math.round(Number(f.totalG.value));
    let remainingG = Math.round(Number(f.remainingG.value));
    const showError = (msg, field) => { err.textContent = msg; err.hidden = false; if (field) field.focus(); };
    if (!brand) return showError('Escreva a marca do filamento.', f.brand);
    if (!(totalG > 0)) return showError('Informe o peso do carretel em gramas.', f.totalG);
    if (!(remainingG >= 0)) return showError('Informe quanto resta, em gramas.', f.remainingG);
    remainingG = Math.min(remainingG, totalG);
    err.hidden = true;

    const known = brandSuggestions(stock.customBrands).find(b => b.toLowerCase() === brand.toLowerCase());
    if (!known) stock.customBrands.push(brand);
    const data = {
      brand: known || brand,
      material: f.material.value,
      line: f.line.value.trim(),
      colorHex: normalizeHex(f.colorHex.value) || '#5b6878',
      colorName: f.colorName.value.trim(),
      totalG,
      remainingG,
      price: f.price.value === '' ? null : Math.max(0, Number(f.price.value) || 0),
      updatedAt: Date.now()
    };
    if (el._editing) {
      Object.assign(el._editing, data);
    } else {
      const qty = Math.max(1, Math.min(50, Math.round(Number(f.qty.value) || 1)));
      for (let i = 0; i < qty; i++) stock.spools.push({ id: newId(), createdAt: Date.now(), ...data });
    }
    saveStock();
    el.close();
    renderFilamentPage();
  });

  return el;
}

function openSpoolDialog(spool, focus) {
  if (!dialog) dialog = buildDialog();
  const el = dialog;
  const f = el.querySelector('form').elements;
  el._editing = spool;
  el.querySelector('#filDialogTitle').textContent = spool ? 'Editar carretel' : 'Adicionar carretel';
  el.querySelector('[data-qty-field]').hidden = !!spool;
  const delBtn = el.querySelector('[data-delete]');
  delBtn.hidden = !spool;
  delBtn.classList.remove('is-confirm');
  delBtn.textContent = 'Excluir carretel';
  el.querySelector('[data-error]').hidden = true;
  el.querySelector('#filBrandList').innerHTML = brandSuggestions(stock.customBrands).map(b => `<option value="${esc(b)}">`).join('');

  const last = stock.spools[stock.spools.length - 1];
  const src = spool || { brand: last ? last.brand : '', material: last ? last.material : 'PLA', line: '', totalG: 1000, remainingG: 1000, price: null, colorHex: FILAMENT_COLORS[0].hex, colorName: FILAMENT_COLORS[0].name };
  f.brand.value = src.brand || '';
  f.brand.dispatchEvent(new Event('input'));
  f.material.value = FILAMENT_MATERIALS.includes(src.material) ? src.material : 'Outro';
  f.line.value = src.line || '';
  f.qty.value = 1;
  f.totalG.value = src.totalG;
  f.remainingG.value = src.remainingG;
  f.price.value = src.price == null ? '' : src.price;
  el._selectColor(normalizeHex(src.colorHex) || FILAMENT_COLORS[0].hex, src.colorName || '');

  el.showModal();
  const target = focus === 'remaining' ? f.remainingG : (spool ? null : f.brand);
  if (target) { target.focus(); if (target.select) target.select(); }
}
