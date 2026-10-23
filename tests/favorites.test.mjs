import { test } from 'node:test';
import assert from 'node:assert/strict';
import { favoriteKeyOf, isFileFavorite, applyFavorites, addFileFavorite, removeFileFavorite } from '../favorites.js';

const base = (folderName, path) => ({ folderName, path, name: path.split('/').pop() });

test('Mesmo nome em pastas diferentes tem chaves diferentes', () => {
  assert.notEqual(favoriteKeyOf(base('Brinquedos', 'base.stl')), favoriteKeyOf(base('Cozinha', 'base.stl')));
  assert.notEqual(favoriteKeyOf(base('A', 'x/base.stl')), favoriteKeyOf(base('A', 'y/base.stl')));
});

test('Chave ignora maiúsculas e o nome da pasta repetido no caminho', () => {
  assert.equal(favoriteKeyOf(base('Pasta', 'Sub/Peca.STL')), favoriteKeyOf(base('pasta', 'Pasta/sub/peca.stl')));
});

test('Favoritar um arquivo não marca o outro com o mesmo nome', () => {
  const favs = new Set();
  const a = base('Brinquedos', 'base.stl');
  const b = base('Cozinha', 'base.stl');
  addFileFavorite(favs, a);
  assert.equal(isFileFavorite(favs, a), true);
  assert.equal(isFileFavorite(favs, b), false);
});

test('Lista antiga (só o nome) continua valendo e é convertida', () => {
  const favs = new Set(['base.stl']);
  const models = [base('Brinquedos', 'base.stl'), base('Cozinha', 'outra.stl')];
  assert.equal(applyFavorites(favs, models), true);
  assert.equal(models[0].isFavorite, true);
  assert.equal(models[1].isFavorite, false);
  assert.ok(favs.has(favoriteKeyOf(models[0])));
});

test('Desfavoritar tira a chave nova e a antiga', () => {
  const m = base('Brinquedos', 'base.stl');
  const favs = new Set(['base.stl', favoriteKeyOf(m)]);
  removeFileFavorite(favs, m);
  assert.equal(isFileFavorite(favs, m), false);
  assert.equal(favs.size, 0);
});
