import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSTL } from '../stl-parser.js';

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// Cubo de 20 mm com 12 triângulos (as 6 faces), orientado para fora
function cubeTriangles(s = 20) {
  const v = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const faces = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return faces.map(f => f.map(i => v[i]));
}

function binarySTL(tris) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => {
    const o = 84 + i * 50 + 12;
    t.forEach((p, j) => p.forEach((c, k) => buf.writeFloatLE(c, o + j * 12 + k * 4)));
  });
  return toArrayBuffer(buf);
}

function asciiSTL(tris) {
  const body = tris.map(t => `facet normal 0 0 0\n outer loop\n${t.map(p => `  vertex ${p.join(' ')}`).join('\n')}\n endloop\nendfacet`).join('\n');
  return toArrayBuffer(Buffer.from(`solid cubo\n${body}\nendsolid cubo\n`, 'utf8'));
}

test('STL binário: medidas, volume e triângulos de um cubo de 20 mm', () => {
  const r = parseSTL(binarySTL(cubeTriangles()));
  assert.equal(r.triangleCount, 12);
  assert.deepEqual(r.bounds.size, { x: 20, y: 20, z: 20 });
  assert.ok(Math.abs(r.volumeCm3 - 8) < 1e-6);
});

test('STL ASCII: mesmo cubo dá o mesmo resultado', () => {
  const r = parseSTL(asciiSTL(cubeTriangles()));
  assert.equal(r.triangleCount, 12);
  assert.deepEqual(r.bounds.size, { x: 20, y: 20, z: 20 });
  assert.ok(Math.abs(r.volumeCm3 - 8) < 1e-6);
});

test('Arquivo de exemplo do app (cubo de calibração) é lido', () => {
  const r = parseSTL(toArrayBuffer(readFileSync(new URL('../sample_models/cubo_calibracao_20mm.stl', import.meta.url))));
  assert.ok(r.triangleCount > 0);
  assert.ok(Math.abs(r.bounds.size.x - 20) < 0.01);
});
