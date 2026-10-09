import * as THREE from 'https://esm.sh/three@0.160.0';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { parseSTL } from './stl-parser.js';

let sharedRenderer = null;
let sharedScene = null;
let sharedCamera = null;
let sharedMesh = null;

function initOffscreenRenderer() {
  if (sharedRenderer) return;

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;

  sharedRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  sharedRenderer.setSize(400, 300);
  sharedRenderer.setPixelRatio(1);
  sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  sharedRenderer.toneMappingExposure = 1.1;

  sharedScene = new THREE.Scene();

  // Iluminação de estúdio para realçar geometria 3D
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  sharedScene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(100, 150, 100);
  sharedScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x7090b0, 0.8);
  fillLight.position.set(-100, -50, -100);
  sharedScene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x00e5ff, 0.5);
  rimLight.position.set(0, -100, 50);
  sharedScene.add(rimLight);

  sharedCamera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000);

  const material = new THREE.MeshStandardMaterial({
    color: 0x1fb6cc,
    roughness: 0.35,
    metalness: 0.15
  });

  sharedMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  sharedScene.add(sharedMesh);
}

/**
 * Gera miniatura e metadados para um arquivo STL
 */
export async function generateSTLThumbnail(arrayBuffer) {
  initOffscreenRenderer();

  const parsed = parseSTL(arrayBuffer);
  if (parsed.triangleCount === 0) {
    throw new Error('Nenhum triângulo válido encontrado no STL');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
  if (parsed.normals.length === parsed.positions.length) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(parsed.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  geometry.center();
  geometry.computeBoundingSphere();

  if (sharedMesh.geometry) {
    sharedMesh.geometry.dispose();
  }
  sharedMesh.geometry = geometry;

  const sphere = geometry.boundingSphere;
  const radius = sphere ? sphere.radius : 10;

  // Posicionar a câmera em perspectiva isométrica ajustando ao tamanho
  const dist = (radius / Math.sin((45 * Math.PI) / 360)) * 1.15;
  sharedCamera.position.set(dist * 0.7, dist * 0.8, dist * 0.9);
  sharedCamera.lookAt(0, 0, 0);

  sharedRenderer.render(sharedScene, sharedCamera);
  const dataUrl = sharedRenderer.domElement.toDataURL('image/webp', 0.85);

  return {
    thumbnailUrl: dataUrl,
    metadata: {
      dimensions: parsed.bounds.size,
      volumeCm3: parsed.volumeCm3,
      triangleCount: parsed.triangleCount
    },
    geometry
  };
}

/**
 * Extrai miniatura embutida em arquivos 3MF (geradas por Bambu Studio, OrcaSlicer, Prusa, etc.)
 */
export async function extract3MFThumbnail(arrayBuffer) {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Buscar a foto oficialmente configurada como thumbnail no 3MF (via _rels/.rels ou thumbnail.png / pick.png)
    const thumbFile = await getConfigured3MFThumbnailFile(zip);

    // Se encontrou a thumbnail oficial configurada, retorna o Data URL instantaneamente
    const slicerData = await extract3MFSlicerData(zip);
    const plates = await extract3MFPlates(zip);

    if (thumbFile) {
      const base64 = await thumbFile.async('base64');
      const ext = thumbFile.name.split('.').pop().toLowerCase();
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
      return {
        thumbnailUrl: `data:${mimeType};base64,${base64}`,
        hasEmbeddedThumbnail: true,
        metadata: {
          embedded: true,
          thumbnailSource: thumbFile.name
        },
        slicerData,
        plates
      };
    }

    // Fallback: tentar ler geometria 3D do 3MF se não houver thumbnail PNG
    const parsed3MF = await parse3MFGeometry(zip, 1);
    initOffscreenRenderer();

    if (sharedMesh.geometry) sharedMesh.geometry.dispose();
    sharedMesh.geometry = parsed3MF.geometry;

    const sphere = parsed3MF.geometry.boundingSphere;
    const radius = sphere ? sphere.radius : 10;
    const dist = (radius / Math.sin((45 * Math.PI) / 360)) * 1.15;
    sharedCamera.position.set(dist * 0.7, dist * 0.8, dist * 0.9);
    sharedCamera.lookAt(0, 0, 0);

    sharedRenderer.render(sharedScene, sharedCamera);
    const dataUrl = sharedRenderer.domElement.toDataURL('image/webp', 0.85);

    return {
      thumbnailUrl: dataUrl,
      hasEmbeddedThumbnail: false,
      metadata: {
        dimensions: parsed3MF.dimensions,
        volumeCm3: parsed3MF.volumeCm3,
        triangleCount: parsed3MF.triangleCount
      },
      geometry: parsed3MF.geometry,
      slicerData,
      plates
    };
  } catch (err) {
    console.warn('Erro ao processar pacote 3MF:', err);
    throw err;
  }
}

/**
 * Funções auxiliares para matrizes de transformação 4x3 do padrão 3MF
 */
function parse3MFMatrix(str) {
  if (!str) return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const parts = str.trim().split(/\s+/).map(Number);
  if (parts.length < 12) return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  return parts.slice(0, 12);
}

function multiply3MFMatrices(mParent, mChild) {
  const res = new Float64Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      res[i*3 + j] = mChild[i*3 + 0]*mParent[0*3 + j] + mChild[i*3 + 1]*mParent[1*3 + j] + mChild[i*3 + 2]*mParent[2*3 + j];
    }
    res[9 + i] = mChild[9]*mParent[0*3 + i] + mChild[10]*mParent[1*3 + i] + mChild[11]*mParent[2*3 + i] + mParent[9 + i];
  }
  return res;
}

function extractObjectSnippet(xmlText, objId) {
  const needle1 = `id="${objId}"`;
  const needle2 = `id='${objId}'`;
  let idx = xmlText.indexOf(needle1);
  if (idx === -1) idx = xmlText.indexOf(needle2);
  if (idx === -1) return null;

  const start = xmlText.lastIndexOf('<object', idx);
  if (start === -1) return null;
  const end = xmlText.indexOf('</object>', idx);
  if (end === -1) {
    // Pode ser tag auto-fechada <object ... />
    const selfClose = xmlText.indexOf('/>', idx);
    if (selfClose !== -1 && selfClose < idx + 200) {
      return xmlText.substring(start, selfClose + 2);
    }
    return null;
  }
  return xmlText.substring(start, end + 9);
}

/**
 * Lê malha geométrica 3D contida em arquivos 3MF de forma exata, rápida e com suporte à mesa selecionada.
 * - Isola cada objeto/malha em seu próprio escopo de índices de vértices (eliminando distorções de "rocha").
 * - Aplica matrizes afins 4x3 de posicionamento, rotação e escala nos componentes da mesa.
 * - Filtra os modelos pertencentes exclusivamente à mesa (plate) selecionada.
 */
export async function parse3MFGeometry(input, targetPlateId = null) {
  const zip = (input && input.file) ? input : await JSZip.loadAsync(input);
  const modelFile = zip.file('3D/3dmodel.model') || 
                    zip.file(/^3D[\\\/].*\.model$/i)[0] ||
                    zip.file(/\.model$/i)[0];

  if (!modelFile) {
    throw new Error('Nenhum modelo 3D encontrado dentro do arquivo 3MF');
  }

  // 1. Verificar se há mapeamento de mesas em Metadata/model_settings.config ou plate_N.json
  const targetItemIds = new Set();
  if (targetPlateId !== null && targetPlateId !== undefined) {
    const settingsFile = zip.file('Metadata/model_settings.config') || 
                         zip.file(/^Metadata[\\\/]model_settings\.config$/i)[0];
    if (settingsFile) {
      try {
        const settingsXml = await settingsFile.async('string');
        // Buscar blocos <plate>...</plate> com regex compatível e seguro em JavaScript
        const plateBlocks = settingsXml.match(/<plate\b[\s\S]*?<\/plate>/gi) || [];
        for (const plateBlock of plateBlocks) {
          const idMatch = plateBlock.match(/<metadata\s+[^>]*?key=["']plater_id["']\s+[^>]*?value=["'](\d+)["']/i) ||
                          plateBlock.match(/<metadata\s+[^>]*?value=["'](\d+)["']\s+[^>]*?key=["']plater_id["']/i);
          if (idMatch && parseInt(idMatch[1], 10) === parseInt(targetPlateId, 10)) {
            const itemRegex = /<metadata\s+[^>]*?key=["']object_id["']\s+[^>]*?value=["'](\d+)["']/gi;
            let m;
            while ((m = itemRegex.exec(plateBlock)) !== null) {
              targetItemIds.add(m[1]);
            }
            const itemRegexRev = /<metadata\s+[^>]*?value=["'](\d+)["']\s+[^>]*?key=["']object_id["']/gi;
            while ((m = itemRegexRev.exec(plateBlock)) !== null) {
              targetItemIds.add(m[1]);
            }
            break;
          }
        }
      } catch (e) {
        console.warn('Erro ao ler model_settings.config para a mesa:', e);
      }
    }

    // Fallback para Metadata/plate_N.json
    if (targetItemIds.size === 0) {
      const plateJsonFile = zip.file(`Metadata/plate_${targetPlateId}.json`) ||
                            zip.file(new RegExp(`Metadata[\\\\\\/]plate_${targetPlateId}\\.json$`, 'i'))?.[0];
      if (plateJsonFile) {
        try {
          const jsonText = await plateJsonFile.async('string');
          const pJson = JSON.parse(jsonText);
          if (Array.isArray(pJson.bbox_objects)) {
            pJson.bbox_objects.forEach(o => {
              if (o && o.id !== undefined) targetItemIds.add(String(o.id));
            });
          }
        } catch (e) {
          console.warn(`Erro ao ler plate_${targetPlateId}.json:`, e);
        }
      }
    }
  }

  const xmlText = await modelFile.async('string');

  // 2. Extrair os itens da seção <build>
  const buildItems = [];
  const buildStart = xmlText.indexOf('<build');
  const buildEnd = xmlText.indexOf('</build>', buildStart);

  if (buildStart !== -1 && buildEnd !== -1) {
    const buildXml = xmlText.substring(buildStart, buildEnd + 8);
    const itemRegex = /<item\s+[^>]*?objectid=["'](\d+)["'](?:\s+[^>]*?transform=["']([^"']+)["'])?[^>]*?>/gi;
    let bMatch;
    while ((bMatch = itemRegex.exec(buildXml)) !== null) {
      const objId = bMatch[1];
      const transformStr = bMatch[2] || '';
      
      // Se tivermos filtro de mesa e este item não estiver nela, ignorar
      if (targetItemIds.size > 0 && !targetItemIds.has(objId)) {
        continue;
      }

      buildItems.push({
        objId,
        matrix: parse3MFMatrix(transformStr)
      });
    }
  }

  // Se nenhum item foi encontrado em <build> (ou formato diferente), pegar objetos com malha direta
  if (buildItems.length === 0) {
    const objRegex = /<object\s+[^>]*?id=["'](\d+)["'][^>]*?>/gi;
    let oMatch;
    while ((oMatch = objRegex.exec(xmlText)) !== null) {
      buildItems.push({
        objId: oMatch[1],
        matrix: parse3MFMatrix('')
      });
    }
  }

  // 3. Resolver componentes e montar lista de instâncias com matriz combinada
  const instances = []; // Array de { filePath, meshId, matrix }
  for (const item of buildItems) {
    const snippet = extractObjectSnippet(xmlText, item.objId);
    if (!snippet) continue;

    if (snippet.includes('<component')) {
      const compRegex = /<component\b([^>]*?)\/?>/gi;
      let cMatch;
      let foundComp = false;
      while ((cMatch = compRegex.exec(snippet)) !== null) {
        foundComp = true;
        const attrs = cMatch[1];
        const objIdMatch = attrs.match(/objectid=["'](\d+)["']/i);
        if (!objIdMatch) continue;
        const compObjId = objIdMatch[1];

        // Suporte a arquivos externos de modelo (Extensão de Produção 3MF: p:path="/3D/Objects/object_X.model")
        const pathMatch = attrs.match(/(?:p:)?path=["']([^"']+)["']/i);
        const compFilePath = pathMatch ? pathMatch[1].replace(/^\//, '') : '3D/3dmodel.model';

        const transformMatch = attrs.match(/transform=["']([^"']+)["']/i);
        const compMatrix = parse3MFMatrix(transformMatch ? transformMatch[1] : '');
        const combined = multiply3MFMatrices(item.matrix, compMatrix);

        instances.push({
          filePath: compFilePath,
          meshId: compObjId,
          matrix: combined
        });
      }
      if (!foundComp) {
        instances.push({ filePath: '3D/3dmodel.model', meshId: item.objId, matrix: item.matrix });
      }
    } else {
      // Objeto contém malha direta
      instances.push({
        filePath: '3D/3dmodel.model',
        meshId: item.objId,
        matrix: item.matrix
      });
    }
  }

  if (instances.length === 0) {
    throw new Error('Nenhum elemento geométrico encontrado para esta mesa');
  }

  // 4. Carregar e fazer cache das malhas brutas requisitadas (suporta múltiplos arquivos .model)
  const fileTextCache = new Map();
  fileTextCache.set('3D/3dmodel.model', xmlText);

  async function getZipFileText(path) {
    const clean = (path || '3D/3dmodel.model').replace(/^\//, '');
    if (fileTextCache.has(clean)) return fileTextCache.get(clean);

    let f = zip.file(clean) || zip.file(clean.replace(/\//g, '\\'));

    if (!f) {
      const baseName = clean.split(/[\\\/]/).pop().toLowerCase();
      const suffixMatch = baseName.match(/_(\d+\.model)$/i);
      const suffix = suffixMatch ? suffixMatch[0].toLowerCase() : null;

      const fileNames = Object.keys(zip.files);
      const matchedKey = fileNames.find(k => {
        const kLower = k.toLowerCase();
        if (kLower.endsWith(baseName)) return true;
        if (suffix && kLower.endsWith(suffix)) return true;
        return false;
      });

      if (matchedKey) {
        f = zip.file(matchedKey);
      }
    }

    if (!f) return null;
    const txt = await f.async('string');
    fileTextCache.set(clean, txt);
    return txt;
  }

  const meshCache = new Map(); // chave: `${filePath}#${meshId}`

  for (const inst of instances) {
    const cacheKey = `${inst.filePath}#${inst.meshId}`;
    if (meshCache.has(cacheKey)) continue;

    const targetXml = await getZipFileText(inst.filePath);
    if (!targetXml) {
      console.warn(`Arquivo de malha 3D ${inst.filePath} não encontrado no 3MF`);
      continue;
    }

    const snippet = extractObjectSnippet(targetXml, inst.meshId);
    if (!snippet) {
      console.warn(`Objeto ${inst.meshId} não encontrado no arquivo ${inst.filePath}`);
      continue;
    }

    const vX = [];
    const vY = [];
    const vZ = [];

    const vertexRegex = /<(?:\w+:)?vertex\s+[^>]*?x=["']([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)["'][^>]*?y=["']([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)["'][^>]*?z=["']([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)["'][^>]*?>/gi;
    let vMatch;
    while ((vMatch = vertexRegex.exec(snippet)) !== null) {
      vX.push(parseFloat(vMatch[1]));
      vY.push(parseFloat(vMatch[2]));
      vZ.push(parseFloat(vMatch[3]));
    }

    // Fallback de atributos fora de ordem
    if (vX.length === 0) {
      const genericVRegex = /<(?:\w+:)?vertex\b([^>]*?)\/?>/gi;
      while ((vMatch = genericVRegex.exec(snippet)) !== null) {
        const attrs = vMatch[1];
        const xm = attrs.match(/x=["']([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)["']/i);
        const ym = attrs.match(/y=["']([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)["']/i);
        const zm = attrs.match(/z=["']([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)["']/i);
        if (xm && ym && zm) {
          vX.push(parseFloat(xm[1]));
          vY.push(parseFloat(ym[1]));
          vZ.push(parseFloat(zm[1]));
        }
      }
    }

    const t1 = [];
    const t2 = [];
    const t3 = [];

    const triRegex = /<(?:\w+:)?triangle\s+[^>]*?v1=["'](\d+)["'][^>]*?v2=["'](\d+)["'][^>]*?v3=["'](\d+)["'][^>]*?>/gi;
    let tMatch;
    while ((tMatch = triRegex.exec(snippet)) !== null) {
      t1.push(parseInt(tMatch[1], 10));
      t2.push(parseInt(tMatch[2], 10));
      t3.push(parseInt(tMatch[3], 10));
    }

    if (t1.length === 0) {
      const genericTriRegex = /<(?:\w+:)?triangle\b([^>]*?)\/?>/gi;
      while ((tMatch = genericTriRegex.exec(snippet)) !== null) {
        const attrs = tMatch[1];
        const m1 = attrs.match(/v1=["'](\d+)["']/i);
        const m2 = attrs.match(/v2=["'](\d+)["']/i);
        const m3 = attrs.match(/v3=["'](\d+)["']/i);
        if (m1 && m2 && m3) {
          t1.push(parseInt(m1[1], 10));
          t2.push(parseInt(m2[1], 10));
          t3.push(parseInt(m3[1], 10));
        }
      }
    }

    meshCache.set(cacheKey, { vX, vY, vZ, t1, t2, t3 });
  }

  // 5. Construir o buffer Three.js com todas as instâncias transformadas
  let totalTriangles = 0;
  for (const inst of instances) {
    const cacheKey = `${inst.filePath}#${inst.meshId}`;
    const meshData = meshCache.get(cacheKey);
    if (meshData) {
      totalTriangles += meshData.t1.length;
    }
  }

  if (totalTriangles === 0) {
    throw new Error('Nenhum triângulo 3D encontrado nos objetos desta mesa');
  }

  const positions = new Float32Array(totalTriangles * 9);
  let pIdx = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let volumeTotal = 0;

  for (const inst of instances) {
    const cacheKey = `${inst.filePath}#${inst.meshId}`;
    const meshData = meshCache.get(cacheKey);
    if (!meshData) continue;

    const { vX, vY, vZ, t1, t2, t3 } = meshData;
    const M = inst.matrix;
    const numTris = t1.length;

    for (let i = 0; i < numTris; i++) {
      const idx1 = t1[i];
      const idx2 = t2[i];
      const idx3 = t3[i];

      // Ponto 1
      const x1 = vX[idx1] || 0, y1 = vY[idx1] || 0, z1 = vZ[idx1] || 0;
      const tx1 = M[0]*x1 + M[3]*y1 + M[6]*z1 + M[9];
      const ty1 = M[1]*x1 + M[4]*y1 + M[7]*z1 + M[10];
      const tz1 = M[2]*x1 + M[5]*y1 + M[8]*z1 + M[11];

      // Ponto 2
      const x2 = vX[idx2] || 0, y2 = vY[idx2] || 0, z2 = vZ[idx2] || 0;
      const tx2 = M[0]*x2 + M[3]*y2 + M[6]*z2 + M[9];
      const ty2 = M[1]*x2 + M[4]*y2 + M[7]*z2 + M[10];
      const tz2 = M[2]*x2 + M[5]*y2 + M[8]*z2 + M[11];

      // Ponto 3
      const x3 = vX[idx3] || 0, y3 = vY[idx3] || 0, z3 = vZ[idx3] || 0;
      const tx3 = M[0]*x3 + M[3]*y3 + M[6]*z3 + M[9];
      const ty3 = M[1]*x3 + M[4]*y3 + M[7]*z3 + M[10];
      const tz3 = M[2]*x3 + M[5]*y3 + M[8]*z3 + M[11];

      // No Three.js: X = tx, Y = tz (altura acima da mesa), Z = -ty (profundidade)
      positions[pIdx++] = tx1; positions[pIdx++] = tz1; positions[pIdx++] = -ty1;
      positions[pIdx++] = tx2; positions[pIdx++] = tz2; positions[pIdx++] = -ty2;
      positions[pIdx++] = tx3; positions[pIdx++] = tz3; positions[pIdx++] = -ty3;

      // Limites em coordenadas da impressora
      if (tx1 < minX) minX = tx1; if (tx1 > maxX) maxX = tx1;
      if (tx2 < minX) minX = tx2; if (tx2 > maxX) maxX = tx2;
      if (tx3 < minX) minX = tx3; if (tx3 > maxX) maxX = tx3;

      if (ty1 < minY) minY = ty1; if (ty1 > maxY) maxY = ty1;
      if (ty2 < minY) minY = ty2; if (ty2 > maxY) maxY = ty2;
      if (ty3 < minY) minY = ty3; if (ty3 > maxY) maxY = ty3;

      if (tz1 < minZ) minZ = tz1; if (tz1 > maxZ) maxZ = tz1;
      if (tz2 < minZ) minZ = tz2; if (tz2 > maxZ) maxZ = tz2;
      if (tz3 < minZ) minZ = tz3; if (tz3 > maxZ) maxZ = tz3;

      // Volume aproximado
      const v = (tx1 * (ty2 * tz3 - ty3 * tz2) +
                 ty1 * (tz2 * tx3 - tx2 * tz3) +
                 tz1 * (tx2 * ty3 - ty2 * tx3)) / 6.0;
      volumeTotal += v;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const dimensions = {
    x: isFinite(maxX - minX) ? Math.max(0, maxX - minX) : 0,
    y: isFinite(maxY - minY) ? Math.max(0, maxY - minY) : 0,
    z: isFinite(maxZ - minZ) ? Math.max(0, maxZ - minZ) : 0
  };

  const volumeCm3 = Math.abs(volumeTotal) / 1000.0;

  return {
    geometry,
    dimensions,
    volumeCm3,
    triangleCount: totalTriangles
  };
}

/**
 * Extrai todas as mesas de impressão (plates) contidas no arquivo 3MF
 */
export async function extract3MFPlates(zip) {
  const plates = [];
  
  // Buscar todas as imagens de mesa Metadata/plate_*.png ou arquivos de configuração
  const plateImages = zip.file(/^Metadata[\\\/]plate_\d+\.png$/i);
  const plateJsons = zip.file(/^Metadata[\\\/]plate_\d+\.json$/i);

  const plateIndices = new Set();
  for (const f of plateImages) {
    const match = f.name.match(/plate_(\d+)\.png$/i);
    if (match) plateIndices.add(parseInt(match[1], 10));
  }
  for (const f of plateJsons) {
    const match = f.name.match(/plate_(\d+)\.json$/i);
    if (match) plateIndices.add(parseInt(match[1], 10));
  }

  // Verificar se há plates listados em Metadata/model_settings.config
  const settingsFile = zip.file('Metadata/model_settings.config') ||
                       zip.file(/^Metadata[\\\/]model_settings\.config$/i)?.[0];
  if (settingsFile) {
    try {
      const configText = await settingsFile.async('string');
      const plateMatches = configText.match(/<metadata\s+[^>]*?key=["']plater_id["']\s+[^>]*?value=["'](\d+)["']/gi) ||
                           configText.match(/<metadata\s+[^>]*?value=["'](\d+)["']\s+[^>]*?key=["']plater_id["']/gi) || [];
      for (const pm of plateMatches) {
        const vm = pm.match(/value=["'](\d+)["']/i);
        if (vm) plateIndices.add(parseInt(vm[1], 10));
      }
    } catch (_) {}
  }

  const sortedIndices = Array.from(plateIndices).sort((a, b) => a - b);

  for (const index of sortedIndices) {
    let name = `Mesa ${index}`;
    let printTimeFormatted = null;
    let printTimeSeconds = null;
    let filamentGrams = null;
    let filamentType = null;
    let imageUrl = null;

    // 1. Imagem da mesa de impressão com múltiplas tentativas de nome
    let imgFile = zip.file(`Metadata/plate_${index}.png`) ||
                  zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]plate_${index}\\.png$`, 'i'))?.[0];

    if (!imgFile) {
      imgFile = zip.file(`Metadata/top_${index}.png`) ||
                zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]top_${index}\\.png$`, 'i'))?.[0];
    }
    if (!imgFile) {
      imgFile = zip.file(`Metadata/pick_${index}.png`) ||
                zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]pick_${index}\\.png$`, 'i'))?.[0];
    }
    if (!imgFile) {
      imgFile = zip.file(`Metadata/plate_no_light_${index}.png`) ||
                zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]plate_no_light_${index}\\.png$`, 'i'))?.[0];
    }

    if (imgFile) {
      try {
        const b64 = await imgFile.async('base64');
        imageUrl = `data:image/png;base64,${b64}`;
      } catch (errImg) {
        console.warn(`Erro ao converter imagem da mesa ${index} para base64:`, errImg);
      }
    }

    // 2. Metadados específicos desta mesa (JSON do Bambu/Orca)
    const jsonFile = zip.file(`Metadata/plate_${index}.json`) ||
                     zip.file(new RegExp(`(^|[\\\/])Metadata[\\\/]plate_${index}\\.json$`, 'i'))?.[0];
    if (jsonFile) {
      try {
        const text = await jsonFile.async('string');
        const data = JSON.parse(text);
        if (data.name && data.name.trim()) name = data.name.trim();
        if (data.prediction > 0) {
          printTimeSeconds = Math.round(data.prediction);
          printTimeFormatted = formatSecondsToTime(printTimeSeconds);
        }
        if (data.weight > 0) {
          filamentGrams = parseFloat(data.weight.toFixed(1));
        }
        if (data.filament_type) {
          filamentType = Array.isArray(data.filament_type) ? data.filament_type[0] : data.filament_type;
        }
      } catch (e) {
        console.warn(`Erro ao ler Metadata/plate_${index}.json:`, e);
      }
    }

    plates.push({
      id: index,
      name,
      printTimeFormatted,
      printTimeSeconds,
      filamentGrams,
      filamentType: filamentType || 'PLA',
      imageUrl
    });
  }

  return plates;
}

/**
 * Extrai dados de fatiamento salvos no 3MF (tempo estimado, gramas de filamento, tipo de material)
 * Suporta Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer, Anycubic, etc.
 */
export async function extract3MFSlicerData(zip) {
  let printTimeSeconds = null;
  let printTimeFormatted = null;
  let filamentGrams = null;
  let filamentType = null;
  let filamentColor = null;
  let isSliced = false;

  // 1. Verificar arquivos JSON de fatiamento (Bambu Studio / OrcaSlicer)
  const plateJsonFiles = zip.file(/^Metadata\/plate_.*\.json$/i);
  if (plateJsonFiles.length > 0) {
    for (const file of plateJsonFiles) {
      try {
        const text = await file.async('string');
        const json = JSON.parse(text);

        // Tempo estimado (em segundos)
        if (json.prediction !== undefined && json.prediction > 0) {
          printTimeSeconds = Math.round(json.prediction);
          isSliced = true;
        } else if (json.print_time !== undefined && json.print_time > 0) {
          printTimeSeconds = Math.round(json.print_time);
          isSliced = true;
        }

        // Peso do filamento (em gramas)
        if (json.weight !== undefined && json.weight > 0) {
          filamentGrams = parseFloat(json.weight.toFixed(1));
          isSliced = true;
        } else if (json.filament_weight !== undefined && json.filament_weight > 0) {
          filamentGrams = parseFloat(json.filament_weight.toFixed(1));
          isSliced = true;
        }

        // Tipo de filamento
        if (json.filament_type) {
          filamentType = Array.isArray(json.filament_type) ? json.filament_type[0] : json.filament_type;
        }
        if (json.filament_colors && json.filament_colors.length > 0) {
          filamentColor = json.filament_colors[0];
        }

        if (isSliced) break;
      } catch (e) {
        console.warn('Erro ao ler JSON de fatiamento do 3MF:', e);
      }
    }
  }

  // 2. Verificar arquivos de configuração ou gcode embutido (PrusaSlicer, SuperSlicer, Anycubic, etc.)
  if (!isSliced) {
    const configOrGcodeFiles = [
      ...zip.file(/^Metadata\/.*\.gcode$/i),
      ...zip.file(/^Metadata\/.*\.config$/i),
      ...zip.file(/^Metadata\/.*\.ini$/i),
      ...zip.file(/^Metadata\/slice_info.*$/i)
    ];

    for (const file of configOrGcodeFiles) {
      try {
        const text = await file.async('string');

        // Procurar comentários de tempo estimado
        const timeMatch = text.match(/estimated[\s_]printing[\s_]time(?:\s*\(.*?\))?\s*=\s*([^\r\n;]+)/i) ||
                          text.match(/estimated_time\s*=\s*([^\r\n;]+)/i) ||
                          text.match(/print_time\s*=\s*([^\r\n;]+)/i);
        if (timeMatch) {
          const rawTime = timeMatch[1].trim();
          if (/^\d+$/.test(rawTime)) {
            printTimeSeconds = parseInt(rawTime, 10);
            isSliced = true;
          } else {
            printTimeFormatted = cleanTimeString(rawTime);
            isSliced = true;
          }
        }

        // Procurar consumo de filamento
        const weightMatch = text.match(/(?:total\s+)?filament[\s_]used\s*\[g\]\s*=\s*([\d.]+)/i) ||
                            text.match(/filament_weight\s*=\s*([\d.]+)/i) ||
                            text.match(/total_filament_weight\s*=\s*([\d.]+)/i);
        if (weightMatch) {
          filamentGrams = parseFloat(parseFloat(weightMatch[1]).toFixed(1));
          isSliced = true;
        }

        // Procurar tipo de material
        const matMatch = text.match(/filament_type\s*=\s*([^\r\n;,]+)/i);
        if (matMatch) {
          filamentType = matMatch[1].trim();
        }

        if (isSliced) break;
      } catch (e) {
        console.warn('Erro ao analisar arquivo de configuração do 3MF:', e);
      }
    }
  }

  if (printTimeSeconds && !printTimeFormatted) {
    printTimeFormatted = formatSecondsToTime(printTimeSeconds);
  }

  return {
    isSliced,
    printTimeFormatted,
    printTimeSeconds,
    filamentGrams,
    filamentType: filamentType || (isSliced ? 'PLA' : null),
    filamentColor
  };
}

function formatSecondsToTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)} min`;
}

function cleanTimeString(timeStr) {
  if (!timeStr) return null;
  // Converte strings do Prusa ex: "1h 23m 45s" para "1h 23m"
  const hMatch = timeStr.match(/(\d+)\s*h/i);
  const mMatch = timeStr.match(/(\d+)\s*m/i);
  const sMatch = timeStr.match(/(\d+)\s*s/i);

  if (hMatch && mMatch) {
    return `${hMatch[1]}h ${mMatch[1]}m`;
  } else if (hMatch) {
    return `${hMatch[1]}h`;
  } else if (mMatch) {
    return `${mMatch[1]} min`;
  } else if (sMatch) {
    return `${sMatch[1]}s`;
  }
  return timeStr.trim();
}

/**
 * Localiza a foto oficialmente configurada como thumbnail do pacote 3MF.
 * 1. Prioriza o relacionamento oficial do 3MF (_rels/.rels -> http://.../relationships/metadata/thumbnail)
 * 2. Em seguida, busca por thumbnail.png ou pick.png (foto de capa selecionada no Bambu Studio)
 * NUNCA seleciona fotos de mesa de impressão (plate_*.png).
 */
async function getConfigured3MFThumbnailFile(zip) {
  // 1. Verificar relacionamento oficial de thumbnail no OPC (_rels/.rels ou */_rels/*.rels)
  const relsCandidates = [
    zip.file('_rels/.rels'),
    ...zip.file(/^.*_rels\/.*\.rels$/i)
  ].filter(Boolean);

  for (const relsFile of relsCandidates) {
    try {
      const relsXml = await relsFile.async('string');
      // Procura Relationship com Type=".../relationships/metadata/thumbnail"
      const match = relsXml.match(/Type=["'][^"']*\/relationships\/metadata\/thumbnail["'][^>]*Target=["']([^"']+)["']/i) ||
                    relsXml.match(/Target=["']([^"']+)["'][^>]*Type=["'][^"']*\/relationships\/metadata\/thumbnail["']/i);

      if (match && match[1]) {
        let target = match[1].trim().replace(/^\/+/, ''); // remove barras iniciais
        // Tentar encontrar o arquivo direto
        let file = zip.file(target);
        if (!file) {
          // Tentar case-insensitive
          const regex = new RegExp(`^${escapeRegex(target)}$`, 'i');
          const found = zip.file(regex);
          if (found && found.length > 0) file = found[0];
        }
        if (file) {
          return file;
        }
      }
    } catch (e) {
      console.warn('Erro ao ler arquivo .rels do 3MF:', e);
    }
  }

  // 2. Ordem de prioridade estrita para thumbnails reais do modelo/projeto
  // (NUNCA plate_*.png ou imagens soltas de fatiamento de mesa)
  const priorityPatterns = [
    /^Metadata\/thumbnail\.(png|jpg|jpeg|webp)$/i,
    /^thumbnail\.(png|jpg|jpeg|webp)$/i,
    /^Metadata\/pick\.(png|jpg|jpeg|webp)$/i,           // Foto de capa selecionada pelo usuário no Bambu Studio
    /^Metadata\/cover\.(png|jpg|jpeg|webp)$/i,          // Imagem de capa
    /^Metadata\/project_preview\.(png|jpg|jpeg|webp)$/i,
    /^Metadata\/preview\.(png|jpg|jpeg|webp)$/i
  ];

  for (const pattern of priorityPatterns) {
    const matched = zip.file(pattern);
    if (matched && matched.length > 0) {
      return matched[0];
    }
  }

  return null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

