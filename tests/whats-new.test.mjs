import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, unseenEntries, shouldAutoOpen } from '../whats-new.js';
import { CHANGELOG } from '../changelog.js';

const log = [{ version: '1.6.0' }, { version: '1.5.0' }, { version: '1.4.1' }];

test('Compara versões como números', () => {
  assert.equal(compareVersions('1.4.10', '1.4.9'), 1);
  assert.equal(compareVersions('1.5.0', '1.5'), 0);
  assert.equal(compareVersions('1.4.1', '1.5.0'), -1);
});

test('Mostra todas as versões puladas, da mais nova para a mais antiga', () => {
  assert.deepEqual(unseenEntries(log, '1.4.1').map(e => e.version), ['1.6.0', '1.5.0']);
  assert.deepEqual(unseenEntries(log, '1.6.0'), []);
  assert.deepEqual(unseenEntries(log, null).map(e => e.version), ['1.6.0']);
});

test('Abre sozinha só para quem atualizou e não desligou', () => {
  assert.equal(shouldAutoOpen(log, { lastSeen: '1.5.0', autoOpen: true }, true), true);
  assert.equal(shouldAutoOpen(log, { lastSeen: '1.6.0', autoOpen: true }, true), false);
  assert.equal(shouldAutoOpen(log, { lastSeen: '1.5.0', autoOpen: false }, true), false);
  assert.equal(shouldAutoOpen(log, { lastSeen: null, autoOpen: true }, true), true);
  assert.equal(shouldAutoOpen(log, { lastSeen: null, autoOpen: true }, false), false);
});

test('Changelog em ordem, da versão mais nova para a mais antiga', () => {
  for (let i = 1; i < CHANGELOG.length; i++) assert.equal(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version), 1);
  CHANGELOG.forEach(e => assert.ok(e.items.length >= 1 && e.items.length <= 5, e.version));
});
