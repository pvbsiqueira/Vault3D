import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('macOS build produces unsigned Intel and Apple Silicon DMG and ZIP artifacts', () => {
  assert.equal(packageJson.scripts['dist:mac'], 'electron-builder --mac dmg zip --x64 --arm64');
  const mac = packageJson.build.mac;
  assert.equal(mac.identity, null);
  assert.equal(mac.notarize, false);
  assert.equal(mac.icon, 'build/icon.icns');
  assert.deepEqual(mac.target.map((target) => target.target), ['dmg', 'zip']);
  assert.deepEqual(mac.target[0].arch, ['x64', 'arm64']);
  assert.deepEqual(mac.target[1].arch, ['x64', 'arm64']);
});

test('Windows installer remains NSIS x64', () => {
  assert.deepEqual(packageJson.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.equal(packageJson.scripts['dist:win'], 'electron-builder --win');
});
