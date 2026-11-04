/**
 * Vault3D · Leitor de SVG
 * Tira do SVG as medidas em mm do jeito que os fatiadores leem ao importar:
 * unidades reais (mm, cm, in, pt, pc) são convertidas e px ou número sem unidade valem 96 DPI.
 * A folha (width/height/viewBox) dá a escala; a medida mostrada é a do contorno do desenho dentro dela.
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
 * Retângulo dos pixels visíveis de uma imagem RGBA (alfa acima de minAlpha, para ignorar a borda suavizada),
 * com right/bottom exclusivos. null se a imagem estiver toda transparente.
 */
export function opaqueBounds(rgba, width, height, minAlpha = 8) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3] > minAlpha) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

/**
 * Medidas do contorno do desenho em mm, como o fatiador mede ao importar (e não o tamanho da folha).
 * pageMm é a folha inteira e bounds vem de opaqueBounds numa imagem da folha com width × height pixels.
 */
export function drawingSizeMm(pageMm, bounds, width, height) {
  if (!pageMm || !bounds) return pageMm || null;
  return {
    x: (bounds.right - bounds.left) / width * pageMm.x,
    y: (bounds.bottom - bounds.top) / height * pageMm.y
  };
}

/**
 * Tamanho da folha do SVG em mm: { x: largura, y: altura }, ou null se o SVG não diz o tamanho.
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
