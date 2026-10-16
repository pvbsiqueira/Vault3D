/**
 * Página de indicações (links de afiliado).
 *
 * Os dados vêm de indicacoes.json: "produtos" são indicações específicas
 * (aparecem no carrossel de destaque) e "categorias" viram cards que abrem
 * a busca da loja já com a tag de afiliado.
 */

const ICONES = {
  spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
  nozzle: '<path d="M7 3h10v6H7z"/><path d="M9 9h6l-1.5 6h-3z"/><path d="M12 15v3"/><path d="M8 21h8"/>',
  plate: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v10M11 7v10M15 7v10"/>',
  dryer: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="4"/><path d="M8 7h.01"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  glue: '<path d="M9 3h6v4H9z"/><path d="M7 7h10v14H7z"/><path d="M10 12h4"/>'
};

const NOMES_LOJA = { amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee' };

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (html) node.innerHTML = html;
  return node;
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function linkSeguro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function renderCategorias(dados) {
  const lista = document.getElementById('categorias');
  const loja = dados.lojas?.amazon;
  for (const cat of dados.categorias || []) {
    if (!loja) break;
    const href = linkSeguro(loja.busca.replace('{termo}', encodeURIComponent(cat.termo)));
    if (!href) continue;
    const item = el('li');
    const a = el('a', { href, target: '_blank', rel: 'sponsored noopener', class: 'card' });
    a.innerHTML = `
      <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[cat.icone] || ICONES.box}</svg></span>
      <strong>${escapar(cat.titulo)}</strong>
      <span class="txt">${escapar(cat.texto)}</span>
      <span class="ver">Ver na ${escapar(loja.nome)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg></span>`;
    item.append(a);
    lista.append(item);
  }
}

function renderProdutos(dados) {
  const produtos = (dados.produtos || []).filter((p) => linkSeguro(p.url));
  if (!produtos.length) return;
  const secao = document.getElementById('produtos');
  const trilho = document.getElementById('trilho');
  for (const p of produtos) {
    const item = el('li');
    const a = el('a', { href: linkSeguro(p.url), target: '_blank', rel: 'sponsored noopener', class: 'produto' });
    const img = linkSeguro(p.imagem);
    a.innerHTML = `
      ${img ? `<img src="${escapar(img)}" alt="" loading="lazy">` : '<span class="sem-img"></span>'}
      <strong>${escapar(p.titulo)}</strong>
      <span class="meta">${escapar(NOMES_LOJA[p.loja] || p.loja || '')}${p.preco ? ` · ${escapar(p.preco)}` : ''}</span>`;
    item.append(a);
    trilho.append(item);
  }
  secao.hidden = false;
  secao.querySelectorAll('.arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      trilho.scrollBy({ left: Number(btn.dataset.dir) * trilho.clientWidth * 0.9, behavior: 'smooth' });
    });
  });
}

fetch('indicacoes.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((dados) => {
    renderProdutos(dados);
    renderCategorias(dados);
  })
  .catch(() => {
    document.getElementById('categorias').innerHTML = '<li class="erro">Não foi possível carregar as indicações agora.</li>';
  });
