const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isTestModeEnabled, TEST_MODE_ENV, TEST_MODE_ARG } = require('../test-mode');

test('Liga o modo de teste só pela pasta do projeto e com a variável definida', () => {
  assert.equal(isTestModeEnabled({ isPackaged: false, env: { [TEST_MODE_ENV]: '1' } }), true);
  assert.equal(isTestModeEnabled({ isPackaged: false, env: {} }), false);
  assert.equal(isTestModeEnabled({ isPackaged: false, env: { [TEST_MODE_ENV]: '0' } }), false);
  assert.equal(isTestModeEnabled({ isPackaged: false, env: { [TEST_MODE_ENV]: 'true' } }), false);
});

test('No app instalado o modo de teste fica sempre desligado, mesmo com a variável', () => {
  assert.equal(isTestModeEnabled({ isPackaged: true, env: { [TEST_MODE_ENV]: '1' } }), false);
  assert.equal(isTestModeEnabled({ isPackaged: true, env: {} }), false);
});

test('A janela reconhece o mesmo argumento que o processo principal envia', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.ok(preload.includes(`process.argv.includes('${TEST_MODE_ARG}')`));
});

test('Sem informação do app, o modo de teste fica desligado', () => {
  assert.equal(isTestModeEnabled(), false);
  assert.equal(isTestModeEnabled({ env: { [TEST_MODE_ENV]: '1' } }), false);
});
