/**
 * Marcas de filamento sugeridas no cadastro de carretéis (Filamentos).
 * Marcas que o usuário digitar e não estiverem aqui ficam salvas na lista dele.
 */
export const FILAMENT_BRANDS = [
  // Nacionais
  '3D Fila', '3D Lab', 'Cliever', 'F3D', 'GTMax3D', 'Sethi3D', 'Voolt3D', 'Printalot',
  // Fabricantes de impressoras que vendem filamento
  'Anycubic', 'Bambu Lab', 'Creality', 'Elegoo', 'Flashforge', 'Kingroon', 'Prusament', 'QIDI Tech', 'Raise3D',
  'Snapmaker', 'Sovol', 'UltiMaker', 'MakerBot', 'Voxelab', 'Artillery', 'Geeetech', 'AnkerMake', 'Longer',
  'Tronxy', 'Two Trees', 'Mingda', 'BIQU', 'Zortrax', 'Dremel', 'XYZprinting', 'Tiertime', 'CraftBot',
  'FLSUN', 'Wanhao', 'Comgrow', 'Kodak',
  // Marcas de filamento
  '3DJake', '3DXTech', 'Add:North', 'Amolen', 'Atomic Filament', 'Aurarum', 'Azurefilm', 'BASF Ultrafuse',
  'CC3D', 'ColorFabb', 'Das Filament', 'Devil Design', 'Duramic 3D', 'Eryone', 'eSun', 'Extrudr',
  'Fiberlogy', 'Filamatrix', 'Filamentive', 'Fillamentum', 'Formfutura', 'Giantarm', 'Gizmo Dorks', 'GST3D',
  'Hatchbox', 'IC3D', 'iSANMATE', 'Iemai', 'Inland', 'Jayo', 'Kexcelled', 'Kimya', 'MatterHackers', 'Mika3D',
  'Nanovia', 'NinjaTek', 'Nobufil', 'Overture', 'Paramount 3D', 'Polyalchemy', 'Polymaker', 'Printed Solid',
  'Protopasta', 'Push Plastic', 'Real Filament', 'Recreus', 'Rosa3D', 'Sakata 3D', 'Siraya Tech', 'Smartfil',
  'Spectrum Filaments', 'Stronghero3D', 'Sunlu', 'Taulman3D', 'Tianse', 'Tinmorry', 'TTYT3D', 'Verbatim',
  'Winkle', 'Yousu', 'Ziro', 'Zyltech'
];

/**
 * Lista sem repetições e em ordem alfabética, juntando as marcas do usuário
 */
export function brandSuggestions(customBrands = []) {
  const seen = new Map();
  [...FILAMENT_BRANDS, ...customBrands].forEach((b) => {
    const name = String(b || '').trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

export function isKnownBrand(name, customBrands = []) {
  const key = String(name || '').trim().toLowerCase();
  return !!key && brandSuggestions(customBrands).some(b => b.toLowerCase() === key);
}

/** Materiais do cadastro (o "tipo" usado para comparar com o 3MF) */
export const FILAMENT_MATERIALS = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'PA (Nylon)', 'PC', 'PCTG', 'HIPS', 'PVA', 'PP', 'PET', 'Outro'];

/** Linhas comuns, só como sugestão (o campo é livre) */
export const FILAMENT_LINES = ['Basic', 'Matte', 'Silk', 'Velvet', 'High Speed', 'CF (fibra de carbono)', 'Translúcido', 'Glow', 'Galaxy', 'Marble', 'Wood', 'Rainbow', 'Metal'];

/** Cores prontas do cadastro */
export const FILAMENT_COLORS = [
  { name: 'Preto', hex: '#1f1f1f' },
  { name: 'Branco', hex: '#f4f4f4' },
  { name: 'Cinza', hex: '#8a8f96' },
  { name: 'Prata', hex: '#c9d1d6' },
  { name: 'Vermelho', hex: '#e53935' },
  { name: 'Laranja', hex: '#fb8c00' },
  { name: 'Amarelo', hex: '#fdd835' },
  { name: 'Verde', hex: '#43a047' },
  { name: 'Azul', hex: '#1e88e5' },
  { name: 'Azul-claro', hex: '#64b5f6' },
  { name: 'Roxo', hex: '#8e24aa' },
  { name: 'Rosa', hex: '#f06292' },
  { name: 'Marrom', hex: '#795548' },
  { name: 'Bege', hex: '#d7c4a3' },
  { name: 'Dourado', hex: '#c9a227' },
  { name: 'Transparente', hex: '#dfe9ee' }
];
