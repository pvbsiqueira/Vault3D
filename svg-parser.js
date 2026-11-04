/**
 * Vault3D · Leitor de SVG
 * Tira do SVG as medidas em mm do jeito que os fatiadores leem ao importar:
 * unidades reais (mm, cm, in, pt, pc) são convertidas e px ou número sem unidade valem 96 DPI.
 */

const MM_PER_UNIT = {
  mm: 1,
  cm: 10,
  q: 0.25,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
  '': 25.4 / 96
};

const LENGTH_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i;

/** Texto do arquivo SVG (UTF-8, com ou sem BOM) */
export function readSVGText(arrayBuffer) {
  return new TextDecoder('utf-8').decode(arrayBuffer).replace(/^﻿/, '');
}

/** Tag <svg ...> de fora do arquivo (ignora comentários, declaração XML e DOCTYPE) */
function rootSvgTag(text) {
  const clean = text.replace(/<!--[\s\S]*?-->/g, '');
  const m = clean.match(/<(?:[\w-]+:)?svg\b[^>]*>/i);
  return m ? m[0] : null;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return m ? m[2] : null;
}

/** Comprimento em mm; null para %, em/ex ou valor inválido (dependem de quem mostra o SVG) */
function lengthToMm(value) {
  if (value == null) return null;
  const m = String(value).match(LENGTH_RE);
  if (!m) return null;
  const factor = MM_PER_UNIT[m[2].toLowerCase()];
  const n = parseFloat(m[1]);
  if (factor === undefined || !Number.isFinite(n) || n <= 0) return null;
  return n * factor;
}

function parseViewBox(value) {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return null;
  const [, , w, h] = parts;
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * Medidas do desenho em mm: { x: largura, y: altura }, ou null se o SVG não diz o tamanho.
 * Sem width/height, vale o viewBox em px; com só um dos dois, o outro sai da proporção do viewBox.
 */
export function parseSVGSize(text) {
  const tag = typeof text === 'string' ? rootSvgTag(text) : null;
  if (!tag) return null;

  let x = lengthToMm(attr(tag, 'width'));
  let y = lengthToMm(attr(tag, 'height'));
  const vb = parseViewBox(attr(tag, 'viewBox'));

  if (x && y) return { x, y };
  if (!vb) return null;
  if (x) return { x, y: x * vb.h / vb.w };
  if (y) return { x: y * vb.w / vb.h, y };
  return { x: vb.w * MM_PER_UNIT.px, y: vb.h * MM_PER_UNIT.px };
}
