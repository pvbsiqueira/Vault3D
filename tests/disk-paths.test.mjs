import assert from 'node:assert/strict';
import test from 'node:test';
import { basenameDiskPath, dirOfDiskPath, diskPathSeparator, joinDiskPath } from '../disk-paths.mjs';

test('macOS paths use POSIX separators and keep the root intact', () => {
  assert.equal(diskPathSeparator('darwin'), '/');
  assert.equal(joinDiskPath('/Users/vander/Models/', 'plates\\plate 1.stl', 'darwin'), '/Users/vander/Models/plates/plate 1.stl');
  assert.equal(joinDiskPath('/', 'Models/cube.stl', 'darwin'), '/Models/cube.stl');
  assert.equal(dirOfDiskPath('/Users/vander/Models/cube.stl'), '/Users/vander/Models/');
  assert.equal(basenameDiskPath('/Users/vander/Models/cube.stl'), 'cube.stl');
});

test('Windows paths retain drive roots and convert relative POSIX separators', () => {
  assert.equal(diskPathSeparator('win32'), '\\');
  assert.equal(joinDiskPath('C:\\Models\\', 'plates/plate 1.stl', 'win32'), 'C:\\Models\\plates\\plate 1.stl');
  assert.equal(joinDiskPath('C:\\', 'cube.stl', 'win32'), 'C:\\cube.stl');
  assert.equal(dirOfDiskPath('C:\\Models\\cube.stl'), 'C:\\Models\\');
  assert.equal(basenameDiskPath('C:\\Models\\cube.stl'), 'cube.stl');
});
