// Teste de fumaça: quem usava a versão antiga com Projetos salvos abre a nova sem erro,
// vê todos os Modelos soltos na Biblioteca e fica sem os dados dos Projetos (ADR 0001).
// Os testes abaixo são passos de uma mesma sessão do app e rodam em ordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchVault3D, SAMPLE_FOLDER, SAMPLE_MODELS } from './vault3d-app.mjs';

const PROJECTS_KEY = 'antigravity_custom_projects';

// Formato que a v1.5.0 gravava ao criar um Projeto (dois Modelos da pasta de exemplo, capa própria)
const LEGACY_PROJECTS = [{
  id: 'proj-1730000000000',
  name: 'Projeto antigo',
  fileKeys: SAMPLE_MODELS.slice(0, 2),
  coverKey: '__custom__',
  customCoverUrl: 'data:image/png;base64,iVBORw0KGgo=',
  folderName: 'pasta-exemplo',
  createdAt: 1730000000000
}];

const vault = await launchVault3D();
const { window } = vault;
after(() => vault.close());

test('Abre com Projetos salvos da versão antiga sem erro', async () => {
  // Planta os Projetos como a versão antiga deixava e reabre a janela, como numa atualização
  await vault.waitForLibrary();
  await window.evaluate(([key, value]) => localStorage.setItem(key, value), [PROJECTS_KEY, JSON.stringify(LEGACY_PROJECTS)]);
  await window.reload();
  await vault.waitForLibrary();
});

test('Os Modelos que estavam no Projeto aparecem soltos na Biblioteca', async () => {
  await vault.connectFolder(SAMPLE_FOLDER);

  const titles = window.locator('#modelsGrid .model-card .card-title');
  await titles.nth(SAMPLE_MODELS.length - 1).waitFor({ state: 'visible' });
  const names = await titles.evaluateAll(els => els.map(el => el.dataset.fullname));
  assert.deepEqual(names.sort(), [...SAMPLE_MODELS].sort());
});

test('Não sobra nenhum caminho na tela para Projetos', async () => {
  const projectEntryPoints = window.locator('#navProjects, #btnOpenCreateProjectModal, #createProjectModal, .btn-dissolve-card');
  assert.equal(await projectEntryPoints.count(), 0);
  assert.equal(await window.locator('.sidebar-nav-item', { hasText: 'Projetos' }).count(), 0);
});

test('Os dados salvos dos Projetos foram apagados', async () => {
  assert.equal(await window.evaluate(key => localStorage.getItem(key), PROJECTS_KEY), null);
});

test('Nenhum erro no console com os Projetos antigos', () => {
  assert.deepEqual(vault.consoleErrors, []);
});
