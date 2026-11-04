// Teste de fumaça: abre o app Electron de verdade pela pasta do projeto, em modo de teste,
// conecta a Pasta conectada de exemplo e confere a Biblioteca pelo que o usuário vê.
// Roda com `npm run test:smoke` (fica fora do `npm test`, que é rápido).
// Os testes abaixo são passos de uma mesma sessão do app e rodam em ordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launchVault3D, SAMPLE_FOLDER, SAMPLE_MODELS } from './vault3d-app.mjs';

const SAMPLE_STLS = SAMPLE_MODELS.filter(name => /\.stl$/i.test(name));
const MULTI_PLATE_3MF = 'caixa_organizadora_fatiada.3mf';
const MULTI_PLATE_3MF_PLATE_IDS = ['1', '2'];
const CJK_STL = '龙猫模型_テスト.stl'; // conteúdo próprio, para não virar duplicado de outro STL
// O pré-carregamento do Em Alta começa 3,5 s depois do login: esperamos além disso
const NETWORK_QUIET_MS = 5000;

const vault = await launchVault3D();
const { window, consoleErrors, consoleWarnings } = vault;
after(() => vault.close());

// JSON.stringify põe o nome entre aspas com escape, o que também vale como texto de seletor CSS
const cardOf = name => window.locator('#modelsGrid .model-card').filter({
  has: window.locator(`.card-title[data-fullname=${JSON.stringify(name)}]`)
});
const cardTitleOf = name => cardOf(name).locator('.card-title');
const openViewer = window.locator('#viewerModal.active');

// Abre o Modelo pelo card, confere o nome no modal e sempre fecha o modal no fim do passo
async function withModelOpen(name, step) {
  await cardTitleOf(name).click();
  await openViewer.waitFor({ state: 'visible' });
  try {
    assert.equal((await window.locator('#modalPathName').textContent()).trim(), name);
    await step();
  } finally {
    await window.locator('#modalCloseBtn').click();
    await openViewer.waitFor({ state: 'hidden' });
  }
}

test('Abre pela pasta em modo de teste, sem login real, com dados numa pasta temporária', async () => {
  assert.equal(await window.evaluate(() => window.electronAPI.isTestMode), true);
  assert.match(path.basename(vault.userDataDir), /^vault3d-test-/);
  await vault.waitForLibrary();
  assert.equal(await window.locator('#authContainer').isVisible(), false);
});

test('Conecta a Pasta conectada de exemplo e mostra um card para cada Modelo', async () => {
  assert.ok(SAMPLE_STLS.length >= 2, 'a pasta de exemplo precisa de pelo menos dois STL');
  await vault.connectFolder(SAMPLE_FOLDER);

  const cards = window.locator('#modelsGrid .model-card');
  await cards.nth(SAMPLE_MODELS.length - 1).waitFor({ state: 'visible' });
  assert.equal(await cards.count(), SAMPLE_MODELS.length);

  const names = await window.locator('#modelsGrid .model-card .card-title').evaluateAll(
    els => els.map(el => el.dataset.fullname)
  );
  assert.deepEqual(names.sort(), [...SAMPLE_MODELS].sort());
});

test('O 3MF e o Modelo de nome oriental aparecem como cards com o nome certo', async () => {
  for (const name of [MULTI_PLATE_3MF, CJK_STL]) {
    // Nome e extensão ficam em pedaços separados no card: juntos formam o nome do arquivo
    assert.equal((await cardTitleOf(name).textContent()).trim(), name);
  }
});

test('Abre o 3MF e mostra as duas Mesas no modal', async () => {
  await withModelOpen(MULTI_PLATE_3MF, async () => {
    // Só as Mesas de verdade: uma capa personalizada também vira um quadrado na lista
    const plates = window.locator('#platesList .plate-square-card:not(:has(.plate-square-num:text-is("⭐")))');
    await plates.nth(MULTI_PLATE_3MF_PLATE_IDS.length - 1).waitFor({ state: 'visible' });
    const ids = await plates.evaluateAll(els => els.map(el => el.dataset.plateId));
    assert.deepEqual(ids, MULTI_PLATE_3MF_PLATE_IDS);
  });
});

test('Abre o Modelo de nome oriental sem erro', async () => {
  await withModelOpen(CJK_STL, async () => {
    const warningsBefore = consoleWarnings.length;
    // Com miniatura pronta o modal abre na imagem: pede a vista 3D, que lê o arquivo do disco
    await window.locator('#viewerModeSeg:visible, #modalCanvas:visible').first().waitFor();
    if (!(await window.locator('#modalCanvas').isVisible())) await window.locator('#btnOpen3DView').click();
    await window.locator('#modalCanvas').waitFor({ state: 'visible' });
    // O carregamento mostra a sobreposição na hora e só a esconde ao terminar (com ou sem malha)
    await window.locator('#viewerLoadingOverlay').waitFor({ state: 'hidden' });
    // Erro de leitura vai para o teste de console; malha que não pôde ser gerada só avisa
    assert.deepEqual(consoleWarnings.slice(warningsBefore), []);
  });
});

test('O modal de editar card abre para um Modelo, com o nome e as fotos de capa', async () => {
  const modal = window.locator('#editCardModal');
  await cardOf(MULTI_PLATE_3MF).locator('.btn-card-rename').click();
  await modal.waitFor({ state: 'visible' });
  try {
    assert.equal((await window.locator('#editCardModalTitle').textContent()).trim(), 'Editar arquivo');
    assert.equal(await window.locator('#editCardNameInput').inputValue(), MULTI_PLATE_3MF.replace(/\.3mf$/i, ''));
    await window.locator('#editCardCoverGrid > *').first().waitFor({ state: 'visible' });
  } finally {
    await window.locator('#btnCancelEditCard').click();
    await modal.waitFor({ state: 'hidden' });
  }
});

test('A contagem da Biblioteca bate com os Modelos da pasta', async () => {
  assert.equal((await window.locator('#sidebarAllCountBadge').textContent()).trim(), String(SAMPLE_MODELS.length));
});

test('A busca encontra o Modelo pelo nome', async () => {
  const cards = window.locator('#modelsGrid .model-card');
  await window.locator('#searchInput').fill('cubo');
  await cards.first().waitFor({ state: 'visible' });
  assert.equal(await cards.count(), 1);
  assert.equal((await cardTitleOf('cubo_calibracao_20mm.stl').count()), 1);

  await window.locator('#searchInput').fill('');
  await cards.nth(SAMPLE_MODELS.length - 1).waitFor({ state: 'visible' });
  assert.equal(await cards.count(), SAMPLE_MODELS.length);
});

test('Favoritar um Modelo põe ele na faixa de Favoritos e desfavoritar tira', async () => {
  const favoritesStrip = window.locator('#favoritesSection');
  await cardOf(CJK_STL).locator('.btn-favorite').click();
  await favoritesStrip.waitFor({ state: 'visible' });
  assert.equal((await window.locator('#favoritesCountBadge').textContent()).trim(), '1');
  const favoriteNames = await window.locator('#favoritesGrid .card-title').evaluateAll(els => els.map(el => el.dataset.fullname));
  assert.deepEqual(favoriteNames, [CJK_STL]);

  await cardOf(CJK_STL).locator('.btn-favorite').click();
  await favoritesStrip.waitFor({ state: 'hidden' });
});

test('A seleção de vários Modelos continua funcionando', async () => {
  const checkboxes = window.locator('#modelsGrid .model-card .card-select-checkbox');
  await checkboxes.nth(0).click();
  await checkboxes.nth(1).click();
  await window.locator('#selectionActionBar').waitFor({ state: 'visible' });
  assert.equal((await window.locator('#selectionCountBadge').textContent()).trim(), '2');
  await window.locator('#btnCancelSelection').click();
  await window.locator('#selectionActionBar').waitFor({ state: 'hidden' });
});

test('Nenhum erro no console durante a abertura, a conexão da pasta e os Modelos abertos', () => {
  assert.deepEqual(consoleErrors, []);
});

test('No modo de teste não há estatísticas de uso nem pedidos ao Em Alta', async () => {
  await new Promise(resolve => setTimeout(resolve, NETWORK_QUIET_MS));
  assert.deepEqual(vault.supabaseRequests, []);
  assert.equal(await vault.trendingCalls(), 0);
});
