/**
 * Regras do estoque de filamentos que não dependem da tela:
 * tipo de material, distância entre cores e "tenho esse filamento?".
 */

/** Distância de cor (CIE76) até onde duas cores contam como "a mesma" */
export const SAME_COLOR_MAX_DISTANCE = 25;

// Ordem importa: PCTG antes de PC, PETG antes de PET
const MATERIAL_RULES = [
  ['PCTG', /PCTG/],
  ['PETG', /PETG/],
  ['PLA', /PLA/],
  ['ABS', /ABS/],
  ['ASA', /ASA/],
  ['TPU', /TPU|TPE|FLEX/],
  ['PA', /NYLON|(^|[^A-Z])PA(HT|\d|[^A-Z]|$)/],
  ['PVA', /PVA|BVOH/],
  ['HIPS', /HIPS/],
  ['PC', /(^|[^A-Z])PC([^A-Z]|$)/],
  ['PET', /(^|[^A-Z])PET([^A-Z]|$)/],
  ['PP', /(^|[^A-Z])PP([^A-Z]|$)/]
];

/**
 * Tipo base do material, para comparar o carretel com o filamento do 3MF.
 * "PLA Basic", "PLA+", "PLA-CF" viram PLA; "PA6-CF", "PAHT-CF" e "PA (Nylon)" viram PA.
 * Retorna null quando não reconhece (ex.: "Outro").
 */
export function normalizeMaterial(value) {
  const text = String(value || '').toUpperCase().trim();
  if (!text) return null;
  const hit = MATERIAL_RULES.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

/** "#RGB", "#RRGGBB" ou "#RRGGBBAA" (o 3MF às vezes traz transparência) para "#rrggbb" */
export function normalizeHex(value) {
  const m = String(value || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return `#${hex.slice(0, 6)}`;
}

function hexToLab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Distância perceptual entre duas cores (0 = iguais). Infinity se alguma não for válida. */
export function colorDistance(a, b) {
  const ha = normalizeHex(a), hb = normalizeHex(b);
  if (!ha || !hb) return Infinity;
  const la = hexToLab(ha), lb = hexToLab(hb);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

export function isLowSpool(spool) {
  return Number(spool.remainingG) <= Number(spool.lowAlertG || 0);
}

export function isEmptySpool(spool) {
  return !(Number(spool.remainingG) > 0);
}

/**
 * Compara um filamento do 3MF ({ type, color }) com os carretéis.
 * status: 'ok' (tem o material e uma cor parecida), 'no-color' (tem o material, mas não a cor)
 * ou 'no-material' (não tem esse tipo de material). Carretéis vazios não contam.
 */
export function matchFilament(filament, spools) {
  const usable = (spools || []).filter(s => !isEmptySpool(s));
  const wanted = normalizeMaterial(filament && filament.type);
  const sameMaterial = wanted ? usable.filter(s => normalizeMaterial(s.material) === wanted) : usable;
  if (!sameMaterial.length) return { status: 'no-material', material: wanted, spool: null };

  const color = normalizeHex(filament && filament.color);
  if (!color) return { status: 'ok', material: wanted, spool: sameMaterial[0] };

  let best = null;
  let bestDist = Infinity;
  sameMaterial.forEach(s => {
    const d = colorDistance(color, s.colorHex);
    if (d < bestDist) { best = s; bestDist = d; }
  });
  return bestDist <= SAME_COLOR_MAX_DISTANCE
    ? { status: 'ok', material: wanted, spool: best }
    : { status: 'no-color', material: wanted, spool: null };
}

/** Números do topo da página: carretéis, gramas, valor guardado e quantos estão acabando */
export function summarizeStock(spools) {
  const list = spools || [];
  let grams = 0, value = 0, low = 0;
  list.forEach(s => {
    const remaining = Math.max(0, Number(s.remainingG) || 0);
    const total = Math.max(0, Number(s.totalG) || 0);
    grams += remaining;
    if (s.price > 0 && total > 0) value += s.price * Math.min(1, remaining / total);
    if (isLowSpool(s)) low += 1;
  });
  return { count: list.length, grams, value, low };
}
