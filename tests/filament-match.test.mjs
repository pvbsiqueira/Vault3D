import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMaterial, normalizeHex, colorDistance, matchFilament, summarizeStock } from '../filament-match.js';
import { brandSuggestions, isKnownBrand } from '../filament-brands.js';

test('Tipo base do material, como vem do 3MF ou do cadastro', () => {
  assert.equal(normalizeMaterial('PLA Basic'), 'PLA');
  assert.equal(normalizeMaterial('PLA+'), 'PLA');
  assert.equal(normalizeMaterial('PLA-CF'), 'PLA');
  assert.equal(normalizeMaterial('PETG HF'), 'PETG');
  assert.equal(normalizeMaterial('PET'), 'PET');
  assert.equal(normalizeMaterial('PCTG'), 'PCTG');
  assert.equal(normalizeMaterial('PC'), 'PC');
  assert.equal(normalizeMaterial('PA6-CF'), 'PA');
  assert.equal(normalizeMaterial('PAHT-CF'), 'PA');
  assert.equal(normalizeMaterial('PA (Nylon)'), 'PA');
  assert.equal(normalizeMaterial('TPU 95A'), 'TPU');
  assert.equal(normalizeMaterial('asa'), 'ASA');
  assert.equal(normalizeMaterial('Outro'), null);
  assert.equal(normalizeMaterial(''), null);
});

test('Cores: hex com transparência e distância', () => {
  assert.equal(normalizeHex('#FF0000FF'), '#ff0000');
  assert.equal(normalizeHex('#abc'), '#aabbcc');
  assert.equal(normalizeHex('azul'), null);
  assert.equal(colorDistance('#000000', '#000000'), 0);
  assert.ok(colorDistance('#000000', '#1f1f1f') < 25);
  assert.ok(colorDistance('#e53935', '#1e88e5') > 25);
});

const spool = (material, colorHex, remainingG = 500) => ({ id: material + colorHex, brand: 'X', material, colorHex, totalG: 1000, remainingG, lowAlertG: 150 });

test('Tem, sem a cor e sem o material', () => {
  const spools = [spool('PLA', '#1f1f1f'), spool('PETG', '#f4f4f4')];
  assert.equal(matchFilament({ type: 'PLA Basic', color: '#000000' }, spools).status, 'ok');
  assert.equal(matchFilament({ type: 'PLA', color: '#e53935' }, spools).status, 'no-color');
  const none = matchFilament({ type: 'ASA', color: '#000000' }, spools);
  assert.equal(none.status, 'no-material');
  assert.equal(none.material, 'ASA');
  assert.equal(matchFilament({ type: 'PETG', color: null }, spools).status, 'ok');
});

test('Carretel vazio não conta como "tem"', () => {
  assert.equal(matchFilament({ type: 'PLA', color: '#000000' }, [spool('PLA', '#000000', 0)]).status, 'no-material');
});

test('Resumo do estoque', () => {
  const s = summarizeStock([{ ...spool('PLA', '#000'), price: 100 }, spool('PLA', '#fff', 100)]);
  assert.equal(s.count, 2);
  assert.equal(s.grams, 600);
  assert.equal(s.value, 50);
  assert.equal(s.low, 1);
});

test('Marcas: lista sem repetição e marcas do usuário', () => {
  const list = brandSuggestions(['Minha Marca', 'bambu lab']);
  assert.equal(list.filter(b => b.toLowerCase() === 'bambu lab').length, 1);
  assert.ok(list.includes('Minha Marca'));
  assert.ok(isKnownBrand('voolt3d'));
  assert.ok(!isKnownBrand('Marca Inventada'));
  assert.ok(isKnownBrand('marca inventada', ['Marca Inventada']));
});
