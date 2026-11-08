const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { detectMacInstalled, getLaunchCommand } = require('../slicers');

test('detects macOS slicer app bundles from user and shared Applications folders', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault3d-apps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userApps = path.join(root, 'user', 'Applications');
  const sharedApps = path.join(root, 'shared', 'Applications');
  for (const app of ['BambuStudio.app', 'UltiMaker Cura.app', 'NotAVaultSlicer.app']) {
    fs.mkdirSync(path.join(userApps, app), { recursive: true });
  }
  fs.mkdirSync(path.join(sharedApps, 'OrcaSlicer.app'), { recursive: true });

  const found = detectMacInstalled([userApps, sharedApps]);
  assert.deepEqual(found.map((slicer) => slicer.id), ['bambu', 'orca', 'cura']);
  assert.equal(found[0].exePath, path.join(userApps, 'BambuStudio.app'));
  assert.equal(found[0].opensSvg, true);
  assert.equal(found[1].opensSvg, true);
  assert.equal(found[2].opensSvg, false);
});

test('launches a macOS slicer bundle through Launch Services', () => {
  assert.deepEqual(getLaunchCommand('/Applications/OrcaSlicer.app', '/Users/vander/Models/a model.stl', 'darwin'), {
    command: 'open',
    args: ['-a', '/Applications/OrcaSlicer.app', '/Users/vander/Models/a model.stl'],
    cwd: undefined
  });
});

test('keeps the Windows executable launch command unchanged', () => {
  assert.deepEqual(getLaunchCommand('C:\\Slicer\\slicer.exe', 'C:\\Models\\cube.stl', 'win32'), {
    command: 'C:\\Slicer\\slicer.exe',
    args: ['C:\\Models\\cube.stl'],
    cwd: 'C:\\Slicer'
  });
});
