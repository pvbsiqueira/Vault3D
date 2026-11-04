// Teste de fumaça: o SVG da Pasta conectada vira um Modelo com card, filtro, contagem e visualização 2D,
// e o botão do fatiador respeita quais fatiadores abrem SVG.
// Os testes abaixo são passos de uma mesma sessão do app e rodam em ordem.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchVault3D, SAMPLE_FOLDER } from './vault3d-app.mjs';

const SVG_MODEL = 'placa_porta_oficina.svg'; // folha de 120 × 60 mm; o desenho mede 118 × 58 mm, como no Bambu Studio
const SVG_KEY = `pasta-exemplo/${SVG_MODEL}`;

const vault = await launchVault3D();
const { app, window, consoleErrors } = vault;
after(() => vault.close());

const cards = window.locator('#modelsGrid .model-card');
const svgCard = cards.filter({ has: window.locator(`.card-title[data-fullname="${SVG_MODEL}"]`) });
const openViewer = window.locator('#viewerModal.active');

// Fatiadores "instalados" que o processo principal responde (o teste não depende do que este PC tem)
async function fakeInstalledSlicers(slicers) {
  await app.evaluate(({ ipcMain }, list) => {
    ipcMain.removeHandler('list-slicers');
    ipcMain.handle('list-slicers', () => ({ success: true, slicers: list, defaultId: 'system', systemName: 'Padrão do Windows' }));
  }, slicers);
  // Abrir Configurações lê os fatiadores de novo, como quando o usuário instala um depois de abrir o app
  await window.locator('[data-section="settings"]').first().click();
  await window.locator('.slicer-row[data-id="system"]').waitFor({ state: 'visible' });
  await window.locator('[data-section="all"]').first().click();
  await svgCard.waitFor({ state: 'visible' });
}

test('O SVG da pasta aparece como card com selo .SVG e medidas 2D em mm', async () => {
  await vault.waitForLibrary();
  await vault.connectFolder(SAMPLE_FOLDER);
  await svgCard.waitFor({ state: 'visible' });
  assert.equal((await svgCard.locator('.badge-format').textContent()).trim(), '.SVG');
  await svgCard.locator('.card-thumbnail').waitFor({ state: 'visible' });
  assert.equal((await svgCard.locator('.card-dimensions').textContent()).trim(), '118×58 mm');
});

test('A faixa de resumo conta os SVG', async () => {
  assert.equal((await window.locator('#sidebarSvgCountBadge').textContent()).trim(), '1.SVG');
});

test('Os botões do filtro (Todos, STL, 3MF e SVG) ficam na mesma linha', async () => {
  const tops = await window.locator('#formatFilterGroup .sidebar-format-btn').evaluateAll(
    els => els.map(el => Math.round(el.getBoundingClientRect().top))
  );
  assert.equal(tops.length, 4);
  assert.equal(new Set(tops).size, 1, `alturas diferentes: ${tops}`);
});

test('O filtro SVG mostra só o SVG e o Todos traz o resto de volta', async () => {
  const total = await cards.count();
  await window.locator('#formatFilterGroup [data-filter="svg"]').click();
  await cards.nth(1).waitFor({ state: 'detached' });
  assert.equal(await cards.count(), 1);
  assert.equal(await svgCard.count(), 1);
  await window.locator('#formatFilterGroup [data-filter="all"]').click();
  await cards.nth(total - 1).waitFor({ state: 'visible' });
});

test('Abrir o card mostra o desenho em 2D, sem a vista 3D', async () => {
  await svgCard.locator('.card-title').click();
  await openViewer.waitFor({ state: 'visible' });
  try {
    const img = window.locator('#modalSvgImg');
    await img.waitFor({ state: 'visible' });
    await window.locator('#viewerLoadingOverlay').waitFor({ state: 'hidden' });
    assert.ok(await img.evaluate(el => el.complete && el.naturalWidth > 0), 'o desenho precisa carregar');
    assert.equal(await window.locator('#modalCanvas').isVisible(), false);
    assert.equal(await window.locator('#viewerModeSeg').isVisible(), false);
    assert.equal((await window.locator('#modalBadge').textContent()).trim(), 'SVG');
    assert.equal((await window.locator('#modalInfoDimensions').textContent()).trim(), '118 × 58 mm');

    // A proporção do desenho na tela é a do arquivo (2:1)
    const box = await img.boundingBox();
    assert.ok(Math.abs(box.width / box.height - 2) < 0.02, `proporção ${box.width / box.height}`);

    // A roda do mouse aumenta o desenho e Centralizar volta ao tamanho encaixado
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await window.mouse.wheel(0, -400);
    assert.ok((await img.boundingBox()).width > box.width * 1.3, 'zoom não aumentou o desenho');
    await window.locator('#btnSvgResetView').click();
    assert.ok(Math.abs((await img.boundingBox()).width - box.width) < 1);
  } finally {
    await window.locator('#modalCloseBtn').click();
    await openViewer.waitFor({ state: 'hidden' });
  }
});

test('Sem fatiador que abra SVG, o botão do SVG fica desativado e explica o motivo', async () => {
  await fakeInstalledSlicers([{ id: 'cura', name: 'UltiMaker Cura', exePath: 'C:\\Cura\\Cura.exe', custom: false, opensSvg: false }]);
  const btn = svgCard.locator('.btn-open-slicer');
  assert.equal(await btn.isDisabled(), true);
  assert.equal(await btn.getAttribute('title'), 'Nenhum fatiador instalado abre SVG');
  // O STL continua abrindo no Cura
  const stlBtn = cards.filter({ has: window.locator('.card-title[data-fullname="cubo_calibracao_20mm.stl"]') }).locator('.btn-open-slicer');
  assert.equal(await stlBtn.isDisabled(), false);
});

test('Com um fatiador que abre SVG, o botão mostra ele e o menu esconde os que não abrem', async () => {
  await fakeInstalledSlicers([
    { id: 'cura', name: 'UltiMaker Cura', exePath: 'C:\\Cura\\Cura.exe', custom: false, opensSvg: false },
    { id: 'orca', name: 'OrcaSlicer', exePath: 'C:\\Orca\\orca-slicer.exe', custom: false, opensSvg: true }
  ]);
  const btn = svgCard.locator('.btn-open-slicer');
  assert.equal(await btn.isDisabled(), false);
  assert.equal(await btn.getAttribute('data-slicer-key'), SVG_KEY);
  assert.match((await btn.textContent()).trim(), /OrcaSlicer/);

  await svgCard.locator('.btn-slicer-caret').click();
  const ids = await window.locator('.slicer-menu .slicer-menu-item[data-slicer-id]').evaluateAll(els => els.map(el => el.dataset.slicerId));
  assert.deepEqual(ids, ['orca']);
  await window.keyboard.press('Escape');
});

test('Nenhum erro no console com o SVG', () => {
  assert.deepEqual(consoleErrors, []);
});
