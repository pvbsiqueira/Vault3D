// Teste de fumaça: abre o app Electron de verdade pela pasta do projeto, em modo de teste,
// conecta a Pasta conectada de exemplo e confere a Biblioteca pelo que o usuário vê.
// Roda com `npm run test:smoke` (fica fora do `npm test`, que é rápido).
// Os testes abaixo são passos de uma mesma sessão do app e rodam em ordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { _electron as electron } from 'playwright-core';

const { TEST_MODE_ENV } = createRequire(import.meta.url)('../../test-mode.js');

// Sem a barra final: no Windows `"C:\pasta\"` escapa a aspa e o Electron não acha o app
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SAMPLE_FOLDER = fileURLToPath(new URL('./fixtures/pasta-exemplo', import.meta.url));
const SAMPLE_MODELS = fs.readdirSync(SAMPLE_FOLDER).filter(name => /\.(stl|3mf)$/i.test(name));
const SAMPLE_STLS = SAMPLE_MODELS.filter(name => /\.stl$/i.test(name));
const MULTI_PLATE_3MF = 'caixa_organizadora_fatiada.3mf';
const MULTI_PLATE_3MF_PLATE_IDS = ['1', '2'];
const CJK_STL = '龙猫模型_テスト.stl'; // conteúdo próprio, para não virar duplicado de outro STL
// O pré-carregamento do Em Alta começa 3,5 s depois do login: esperamos além disso
const NETWORK_QUIET_MS = 5000;

const app = await electron.launch({
  args: [ROOT],
  cwd: ROOT,
  env: { ...process.env, [TEST_MODE_ENV]: '1' }
});

// Ouvintes ligados antes de qualquer espera, para pegar erros desde a abertura da janela
const consoleErrors = [];
const consoleWarnings = [];
const supabaseRequests = [];
const watchWindow = page => {
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('request', req => { if (/supabase\.co/i.test(req.url())) supabaseRequests.push(req.url()); });
};
app.windows().forEach(watchWindow);
app.on('window', watchWindow);

const userDataDir = await app.evaluate(({ app }) => app.getPath('userData'));

// Pedidos ao Em Alta passam pelo processo principal: contamos sem buscar nada na internet
await app.evaluate(({ ipcMain }) => {
  globalThis.__trendingCalls = 0;
  ipcMain.removeHandler('fetch-trending-models');
  ipcMain.handle('fetch-trending-models', () => {
    globalThis.__trendingCalls += 1;
    return { success: false, makerWorld: [], makerOnline: [] };
  });
});

const window = await app.firstWindow();

const cardTitleOf = name => window.locator('#modelsGrid .model-card .card-title').filter({
  has: window.locator(`xpath=self::*[@data-fullname=${JSON.stringify(name)}]`)
});
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

after(async () => {
  await app.close();
  fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('Abre pela pasta em modo de teste, sem login real, com dados numa pasta temporária', async () => {
  assert.equal(await window.evaluate(() => window.electronAPI.isTestMode), true);
  assert.match(path.basename(userDataDir), /^vault3d-test-/);
  await window.locator('#dashboardLayout').waitFor({ state: 'visible' });
  assert.equal(await window.locator('#authContainer').isVisible(), false);
});

test('Conecta a Pasta conectada de exemplo e mostra um card para cada Modelo', async () => {
  assert.ok(SAMPLE_STLS.length >= 2, 'a pasta de exemplo precisa de pelo menos dois STL');

  // O diálogo nativo de pasta responde a pasta de exemplo; o app segue o mesmo fluxo do usuário
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, SAMPLE_FOLDER);
  await window.locator('#btnEmptySelectFolder').click();

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

test('Nenhum erro no console durante a abertura, a conexão da pasta e os Modelos abertos', () => {
  assert.deepEqual(consoleErrors, []);
});

test('No modo de teste não há estatísticas de uso nem pedidos ao Em Alta', async () => {
  await new Promise(resolve => setTimeout(resolve, NETWORK_QUIET_MS));
  assert.deepEqual(supabaseRequests, []);
  assert.equal(await app.evaluate(() => globalThis.__trendingCalls), 0);
});
