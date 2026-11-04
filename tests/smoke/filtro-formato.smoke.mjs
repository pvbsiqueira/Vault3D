// Teste de fumaça: com uma Pasta conectada só de STL, filtrar por 3MF deixa a Biblioteca vazia,
// e o usuário ainda precisa conseguir trocar de filtro depois (bug relatado por usuário).
// Os testes abaixo são passos de uma mesma sessão do app e rodam em ordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { launchVault3D } from './vault3d-app.mjs';

const STL_ONLY_FOLDER = fileURLToPath(new URL('./fixtures/pasta-so-stl', import.meta.url));
const STL_MODEL = 'cubo_calibracao_20mm.stl';

const vault = await launchVault3D();
const { window } = vault;
after(() => vault.close());

const cards = window.locator('#modelsGrid .model-card');
const filterBtn = filter => window.locator(`#formatFilterGroup [data-filter="${filter}"]`);

// Clica como o usuário: falha se outro elemento estiver por cima do botão
async function chooseFilter(filter) {
  await filterBtn(filter).click({ timeout: 5000 });
  assert.match(await filterBtn(filter).getAttribute('class'), /\bactive\b/);
}

test('Conecta uma pasta só com STL', async () => {
  await vault.waitForLibrary();
  await vault.connectFolder(STL_ONLY_FOLDER);
  await cards.first().waitFor({ state: 'visible' });
  assert.equal(await cards.count(), 1);
});

test('Filtrar por 3MF sem nenhum 3MF mostra a Biblioteca vazia', async () => {
  await chooseFilter('3mf');
  await cards.first().waitFor({ state: 'detached' });
  assert.equal(await cards.count(), 0);
});

test('Depois do filtro vazio, dá para voltar para STL', async () => {
  await chooseFilter('stl');
  await cards.first().waitFor({ state: 'visible' });
  assert.equal(await window.locator(`#modelsGrid .card-title[data-fullname="${STL_MODEL}"]`).count(), 1);
});

test('E dá para voltar para 3MF e para Todos', async () => {
  await chooseFilter('3mf');
  await cards.first().waitFor({ state: 'detached' });
  await chooseFilter('all');
  await cards.first().waitFor({ state: 'visible' });
  assert.equal(await cards.count(), 1);
});

test('Nenhum erro no console ao trocar de filtro', () => {
  assert.deepEqual(vault.consoleErrors, []);
});
