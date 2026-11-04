import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSVGSize, readSVGText } from '../svg-parser.js';

const close = (a, b) => Math.abs(a - b) < 1e-6;
const assertSize = (size, x, y) => {
  assert.ok(size, 'esperava medidas');
  assert.ok(close(size.x, x), `largura ${size.x} ≠ ${x}`);
  assert.ok(close(size.y, y), `altura ${size.y} ≠ ${y}`);
};

test('Medidas em mm e cm são usadas como estão', () => {
  assertSize(parseSVGSize('<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm"/>'), 80, 40);
  assertSize(parseSVGSize('<svg width="8cm" height="4cm" viewBox="0 0 10 10"/>'), 80, 40);
  assertSize(parseSVGSize('<svg width="1in" height="72pt"/>'), 25.4, 25.4);
});

test('px e número sem unidade valem 96 DPI, como nos fatiadores', () => {
  assertSize(parseSVGSize('<svg width="96px" height="192"/>'), 25.4, 50.8);
});

test('Sem width/height, vale o viewBox em px', () => {
  assertSize(parseSVGSize('<svg viewBox="0 0 960 480"></svg>'), 254, 127);
  assertSize(parseSVGSize('<svg viewBox="0,0,96,96" width="100%" height="100%"/>'), 25.4, 25.4);
});

test('Só a largura: a altura sai da proporção do viewBox', () => {
  assertSize(parseSVGSize('<svg width="100mm" viewBox="0 0 200 50"/>'), 100, 25);
  assertSize(parseSVGSize('<svg height="10mm" viewBox="0 0 200 50"/>'), 40, 10);
});

test('stroke-width e atributos de filhos não confundem a leitura', () => {
  const svg = `<?xml version="1.0"?>
<!-- <svg width="1mm" height="1mm"> comentário -->
<!DOCTYPE svg>
<svg xmlns="http://www.w3.org/2000/svg" stroke-width="3" viewBox="0 0 96 48">
  <rect width="500" height="500"/>
</svg>`;
  assertSize(parseSVGSize(svg), 25.4, 12.7);
});

test('SVG sem tamanho, inválido ou que não é SVG devolve null', () => {
  assert.equal(parseSVGSize('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'), null);
  assert.equal(parseSVGSize('<svg width="10em" height="5em"/>'), null);
  assert.equal(parseSVGSize('<svg viewBox="0 0 0 10"/>'), null);
  assert.equal(parseSVGSize('<html><body>oi</body></html>'), null);
  assert.equal(parseSVGSize(''), null);
  assert.equal(parseSVGSize(null), null);
});

test('Texto com BOM é lido', () => {
  const buf = new TextEncoder().encode('﻿<svg width="10mm" height="20mm"/>');
  assertSize(parseSVGSize(readSVGText(buf.buffer)), 10, 20);
});

test('Arquivo de exemplo do app é lido', () => {
  const text = readFileSync(new URL('../sample_models/placa_porta_oficina.svg', import.meta.url), 'utf8');
  assertSize(parseSVGSize(text), 120, 60);
});
