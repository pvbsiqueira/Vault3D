/**
 * STL Parser (Binary & ASCII)
 * Gera BufferGeometry para Three.js e calcula dimensões/volume em tempo real.
 */
export function parseSTL(buffer) {
  const isAscii = checkIfAscii(buffer);
  return isAscii ? parseAscii(buffer) : parseBinary(buffer);
}

function checkIfAscii(buffer) {
  const reader = new DataView(buffer);
  // Verificar tamanho para STL binário
  if (buffer.byteLength < 84) return true;
  const numFaces = reader.getUint32(80, true);
  const expectedBinarySize = 84 + numFaces * 50;
  if (expectedBinarySize === buffer.byteLength) {
    return false; // É comprovadamente binário
  }

  // Se não coincidir exatamente, verificar se os primeiros 512 bytes contêm caracteres ASCII imprimíveis
  const bytes = new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength));
  let isText = true;
  for (let i = 0; i < bytes.length; i++) {
    const code = bytes[i];
    if (code === 0 || (code < 9 && code !== 0) || (code > 13 && code < 32)) {
      isText = false;
      break;
    }
  }
  return isText;
}

function parseBinary(buffer) {
  const reader = new DataView(buffer);
  const faces = reader.getUint32(80, true);
  const dataOffset = 84;
  const faceLength = 50;

  const positions = new Float32Array(faces * 9);
  const normals = new Float32Array(faces * 9);

  let posIdx = 0;
  let normIdx = 0;

  for (let face = 0; face < faces; face++) {
    const start = dataOffset + face * faceLength;
    if (start + 48 > buffer.byteLength) break;

    const nx = reader.getFloat32(start, true);
    const ny = reader.getFloat32(start + 4, true);
    const nz = reader.getFloat32(start + 8, true);

    for (let v = 0; v < 3; v++) {
      const vOffset = start + 12 + v * 12;
      const vx = reader.getFloat32(vOffset, true);
      const vy = reader.getFloat32(vOffset + 4, true);
      const vz = reader.getFloat32(vOffset + 8, true);

      positions[posIdx++] = vx;
      positions[posIdx++] = vy;
      positions[posIdx++] = vz;

      normals[normIdx++] = nx;
      normals[normIdx++] = ny;
      normals[normIdx++] = nz;
    }
  }

  return buildGeometryData(positions, normals);
}

function parseAscii(buffer) {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(buffer);

  const normalRegex = /facet\s+normal\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const vertexRegex = /vertex\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  const positionsList = [];
  const normalsList = [];

  const lines = text.split('\n');
  let curNormal = [0, 0, 1];
  let curFaceVertices = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('facet normal')) {
      const match = normalRegex.exec(line);
      normalRegex.lastIndex = 0;
      if (match) {
        curNormal = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
      }
      curFaceVertices = [];
    } else if (line.startsWith('vertex')) {
      const match = vertexRegex.exec(line);
      vertexRegex.lastIndex = 0;
      if (match) {
        curFaceVertices.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
      }
    } else if (line.startsWith('endfacet')) {
      if (curFaceVertices.length === 9) {
        for (let j = 0; j < 9; j++) {
          positionsList.push(curFaceVertices[j]);
        }
        for (let j = 0; j < 3; j++) {
          normalsList.push(...curNormal);
        }
      }
    }
  }

  const positions = new Float32Array(positionsList);
  const normals = new Float32Array(normalsList);

  return buildGeometryData(positions, normals);
}

function buildGeometryData(positions, normals) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let volumeTotal = 0;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Cálculo de volume pelo método do tetraedro (divergence theorem)
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];

    // Signed volume of tetrahedron formed with origin
    const v = (ax * (by * cz - bz * cy) +
               ay * (bz * cx - bx * cz) +
               az * (bx * cy - by * cx)) / 6.0;
    volumeTotal += v;
  }

  const dimX = isFinite(maxX - minX) ? Math.max(0, maxX - minX) : 0;
  const dimY = isFinite(maxY - minY) ? Math.max(0, maxY - minY) : 0;
  const dimZ = isFinite(maxZ - minZ) ? Math.max(0, maxZ - minZ) : 0;
  const volumeCm3 = Math.abs(volumeTotal) / 1000.0; // mm3 para cm3

  return {
    positions,
    normals,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      size: { x: dimX, y: dimY, z: dimZ }
    },
    volumeCm3,
    triangleCount: positions.length / 9
  };
}
