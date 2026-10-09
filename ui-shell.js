/**
 * Vault3D · Casca visual do painel
 * Apenas apresentação: mantém o título da página e a trilha de navegação
 * em sincronia com o item ativo da barra lateral, mostra os filtros de formato
 * junto com o Ordenar e adiciona o atalho Ctrl+K
 * para a busca. Não altera estado nem regras da biblioteca (isso fica no app.js).
 */
(function () {
  const title = document.getElementById('shellTitle');
  const crumb = document.getElementById('shellCrumb');
  const nav = document.querySelector('.sidebar-nav');
  const search = document.getElementById('searchInput');

  function syncTitle() {
    const active = nav && nav.querySelector('.sidebar-nav-item.active .nav-label');
    const label = active ? active.textContent.trim() : 'Todos os modelos';
    if (title && title.textContent !== label) title.textContent = label;
    if (crumb && crumb.textContent !== label) crumb.textContent = label;
  }

  if (nav) {
    new MutationObserver(syncTitle).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    syncTitle();
  }

  // Filtros de formato aparecem junto com o Ordenar (só quando há modelos carregados)
  const sortWrap = document.getElementById('sortControlWrap');
  const formatGroup = document.getElementById('formatFilterGroup');
  function syncFormatFilter() {
    if (sortWrap && formatGroup) formatGroup.hidden = sortWrap.style.display === 'none';
  }
  if (sortWrap && formatGroup) {
    new MutationObserver(syncFormatFilter).observe(sortWrap, { attributes: true, attributeFilter: ['style'] });
    syncFormatFilter();
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && search) {
      e.preventDefault();
      search.focus();
      search.select();
    }
  });
})();
