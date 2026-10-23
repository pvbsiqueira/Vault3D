const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const g = require('../file-guards');

const abs = (...p) => path.resolve(path.sep, ...p);

test('Só caminhos completos de arquivos STL/3MF são aceitos', () => {
  assert.equal(g.isModelFilePath(abs('modelos', 'peca.stl')), true);
  assert.equal(g.isModelFilePath(abs('modelos', 'peca.3MF')), true);
  assert.equal(g.isModelFilePath(abs('Windows', 'system32', 'calc.exe')), false);
  assert.equal(g.isModelFilePath(abs('docs', 'senhas.txt')), false);
  assert.equal(g.isModelFilePath('peca.stl'), false);
  assert.equal(g.isModelFilePath(''), false);
  assert.equal(g.isModelFilePath(null), false);
  assert.equal(g.isModelFilePath(abs('x', 'a.stl\0.exe')), false);
});

test('Nome novo no renomear: só nome de arquivo 3D válido no Windows', () => {
  assert.equal(g.isValidModelFileName('Suporte de fone.stl'), true);
  assert.equal(g.isValidModelFileName('caixa (2).3mf'), true);
  assert.equal(g.isValidModelFileName('..\\..\\Desktop\\x.stl'), false);
  assert.equal(g.isValidModelFileName('pasta/x.stl'), false);
  assert.equal(g.isValidModelFileName('x.exe'), false);
  assert.equal(g.isValidModelFileName('x.stl.'), false);
  assert.equal(g.isValidModelFileName('CON.stl'), false);
  assert.equal(g.isValidModelFileName(' x.stl'), false);
  assert.equal(g.isValidModelFileName('a:b.stl'), false);
});

test('Pedaço de arquivo com números válidos e tamanho limitado', () => {
  assert.equal(g.isValidChunkRequest(0, 65536), true);
  assert.equal(g.isValidChunkRequest(-1, 10), false);
  assert.equal(g.isValidChunkRequest(0, g.MAX_CHUNK_BYTES + 1), false);
  assert.equal(g.isValidChunkRequest('0', 10), false);
});

test('Só a API do MakerOnline pode ser consultada pela janela', () => {
  assert.equal(g.isAllowedMakerOnlineUrl('https://www.makeronline.com/api/mold/detail?id=1'), true);
  assert.equal(g.isAllowedMakerOnlineUrl('http://www.makeronline.com/api/x'), false);
  assert.equal(g.isAllowedMakerOnlineUrl('https://www.makeronline.com.evil.com/api/x'), false);
  assert.equal(g.isAllowedMakerOnlineUrl('https://www.makeronline.com/en/model/1.html'), false);
  assert.equal(g.isAllowedMakerOnlineUrl('file:///C:/x'), false);
});
