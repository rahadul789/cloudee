const zlib = require("zlib");

const ECC_FORMAT_BITS = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

const ECC_CODEWORDS_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const NUM_ERROR_CORRECTION_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const GF_EXP = new Array(512).fill(0);
const GF_LOG = new Array(256).fill(0);

let fieldValue = 1;
for (let i = 0; i < 255; i += 1) {
  GF_EXP[i] = fieldValue;
  GF_LOG[fieldValue] = i;
  fieldValue <<= 1;
  if (fieldValue & 0x100) {
    fieldValue ^= 0x11d;
  }
}
for (let i = 255; i < GF_EXP.length; i += 1) {
  GF_EXP[i] = GF_EXP[i - 255];
}

let crcTable;

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function multiplyField(x, y) {
  if (x === 0 || y === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function getNumRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

function getNumRawDataCodewords(version) {
  return Math.floor(getNumRawDataModules(version) / 8);
}

function getNumDataCodewords(version, level) {
  return (
    getNumRawDataCodewords(version) -
    ECC_CODEWORDS_PER_BLOCK[level][version] * NUM_ERROR_CORRECTION_BLOCKS[level][version]
  );
}

function chooseVersion(dataLength, level) {
  for (let version = 1; version <= 40; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    const capacityBits = getNumDataCodewords(version, level) * 8;
    if (4 + countBits + dataLength * 8 <= capacityBits) {
      return version;
    }
  }
  return null;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function makeDataCodewords(data, version, level) {
  const bits = [];
  const capacityBits = getNumDataCodewords(version, level) * 8;

  appendBits(bits, 0x4, 4);
  appendBits(bits, data.length, version <= 9 ? 8 : 16);
  for (const byte of data) {
    appendBits(bits, byte, 8);
  }

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let codeword = 0;
    for (let j = 0; j < 8; j += 1) {
      codeword = (codeword << 1) | bits[i + j];
    }
    codewords.push(codeword);
  }

  const padBytes = [0xec, 0x11];
  for (let i = 0; codewords.length < capacityBits / 8; i += 1) {
    codewords.push(padBytes[i % 2]);
  }

  return codewords;
}

function reedSolomonComputeDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;

  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = multiplyField(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = multiplyField(root, 0x02);
  }

  return result;
}

function reedSolomonComputeRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= multiplyField(divisor[i], factor);
    }
  }
  return result;
}

function addErrorCorrection(dataCodewords, version, level) {
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[level][version];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[level][version];
  const rawCodewords = getNumRawDataCodewords(version);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = reedSolomonComputeDivisor(blockEccLen);
  const blocks = [];

  let offset = 0;
  for (let i = 0; i < numBlocks; i += 1) {
    const dataLength = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const data = dataCodewords.slice(offset, offset + dataLength);
    offset += dataLength;
    blocks.push({
      data,
      ecc: reedSolomonComputeRemainder(data, divisor),
    });
  }

  const result = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i]);
      }
    }
  }
  for (let i = 0; i < blockEccLen; i += 1) {
    for (const block of blocks) {
      result.push(block.ecc[i]);
    }
  }

  return result;
}

function getAlignmentPatternPositions(version) {
  if (version === 1) {
    return [];
  }

  const size = version * 4 + 17;
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32
    ? 26
    : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];

  for (let position = size - 7; result.length < numAlign; position -= step) {
    result.splice(1, 0, position);
  }

  return result;
}

function getMaskBit(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new Error(`Invalid QR mask ${mask}`);
  }
}

function applyMask(modules, isFunction, mask) {
  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      if (!isFunction[y][x] && getMaskBit(mask, x, y)) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
}

function drawFormatBits(modules, isFunction, level, mask, markFunction) {
  const size = modules.length;
  const data = (ECC_FORMAT_BITS[level] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    if (markFunction) {
      isFunction[y][x] = true;
    }
  };

  for (let i = 0; i <= 5; i += 1) {
    set(8, i, getBit(bits, i));
  }
  set(8, 7, getBit(bits, 6));
  set(8, 8, getBit(bits, 7));
  set(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) {
    set(14 - i, 8, getBit(bits, i));
  }

  for (let i = 0; i < 8; i += 1) {
    set(size - 1 - i, 8, getBit(bits, i));
  }
  for (let i = 8; i < 15; i += 1) {
    set(8, size - 15 + i, getBit(bits, i));
  }
  set(8, size - 8, true);
}

function drawVersionBits(modules, isFunction, version) {
  if (version < 7) {
    return;
  }

  const size = modules.length;
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * 0x1f25);
  }
  const bits = (version << 12) | remainder;

  for (let i = 0; i < 18; i += 1) {
    const dark = getBit(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = dark;
    modules[a][b] = dark;
    isFunction[b][a] = true;
    isFunction[a][b] = true;
  }
}

function drawFunctionPatterns(modules, isFunction, version, level) {
  const size = modules.length;
  const setFunction = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return;
    }
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };
  const drawFinder = (centerX, centerY) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
      }
    }
  };
  const drawAlignment = (centerX, centerY) => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const alignPositions = getAlignmentPatternPositions(version);
  for (const y of alignPositions) {
    for (const x of alignPositions) {
      if (!isFunction[y][x]) {
        drawAlignment(x, y);
      }
    }
  }

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    if (!isFunction[6][i]) {
      setFunction(i, 6, dark);
    }
    if (!isFunction[i][6]) {
      setFunction(6, i, dark);
    }
  }

  drawFormatBits(modules, isFunction, level, 0, true);
  drawVersionBits(modules, isFunction, version);
}

function drawCodewords(modules, isFunction, data) {
  const size = modules.length;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!isFunction[y][x] && bitIndex < data.length * 8) {
          modules[y][x] = getBit(data[Math.floor(bitIndex / 8)], 7 - (bitIndex % 8));
          bitIndex += 1;
        }
      }
    }
  }
}

function hasFinderLikePattern(line, index) {
  const pattern =
    line[index] &&
    !line[index + 1] &&
    line[index + 2] &&
    line[index + 3] &&
    line[index + 4] &&
    !line[index + 5] &&
    line[index + 6];
  if (!pattern) {
    return false;
  }

  const before = index >= 4 && !line[index - 1] && !line[index - 2] && !line[index - 3] && !line[index - 4];
  const after =
    index + 11 <= line.length &&
    !line[index + 7] &&
    !line[index + 8] &&
    !line[index + 9] &&
    !line[index + 10];
  return before || after;
}

function getPenaltyScore(modules) {
  const size = modules.length;
  let penalty = 0;
  let darkCount = 0;

  for (let y = 0; y < size; y += 1) {
    let runColor = modules[y][0];
    let runLength = 1;
    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) {
        darkCount += 1;
      }
      if (x === 0) {
        continue;
      }
      if (modules[y][x] === runColor) {
        runLength += 1;
        if (runLength === 5) {
          penalty += 3;
        } else if (runLength > 5) {
          penalty += 1;
        }
      } else {
        runColor = modules[y][x];
        runLength = 1;
      }
    }
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = modules[0][x];
    let runLength = 1;
    for (let y = 1; y < size; y += 1) {
      if (modules[y][x] === runColor) {
        runLength += 1;
        if (runLength === 5) {
          penalty += 3;
        } else if (runLength > 5) {
          penalty += 1;
        }
      } else {
        runColor = modules[y][x];
        runLength = 1;
      }
    }
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (
        modules[y][x + 1] === color &&
        modules[y + 1][x] === color &&
        modules[y + 1][x + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x <= size - 7; x += 1) {
      if (hasFinderLikePattern(modules[y], x)) {
        penalty += 40;
      }
    }
  }
  for (let x = 0; x < size; x += 1) {
    const column = [];
    for (let y = 0; y < size; y += 1) {
      column.push(modules[y][x]);
    }
    for (let y = 0; y <= size - 7; y += 1) {
      if (hasFinderLikePattern(column, y)) {
        penalty += 40;
      }
    }
  }

  const totalModules = size * size;
  const balancePenalty = Math.floor(Math.abs((darkCount * 100) / totalModules - 50) / 5) * 10;
  return penalty + balancePenalty;
}

function createQrCode(text, preferredLevel = "Q") {
  const data = Buffer.from(String(text), "utf8");
  const levels = Array.from(new Set([preferredLevel, "M", "L"]));

  for (const level of levels) {
    const version = chooseVersion(data.length, level);
    if (version) {
      return createQrCodeWithVersion(data, version, level);
    }
  }

  throw new Error("QR payload is too long to encode.");
}

function createQrCodeWithVersion(data, version, level) {
  let modules = Array.from({ length: version * 4 + 17 }, () =>
    new Array(version * 4 + 17).fill(false),
  );
  const isFunction = modules.map((row) => row.map(() => false));
  const dataCodewords = makeDataCodewords(data, version, level);
  const allCodewords = addErrorCorrection(dataCodewords, version, level);

  drawFunctionPatterns(modules, isFunction, version, level);
  drawCodewords(modules, isFunction, allCodewords);

  let bestModules = null;
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => row.slice());
    applyMask(candidate, isFunction, mask);
    drawFormatBits(candidate, isFunction, level, mask, false);
    const penalty = getPenaltyScore(candidate);
    if (penalty < bestPenalty) {
      bestModules = candidate;
      bestMask = mask;
      bestPenalty = penalty;
    }
  }

  modules = bestModules;
  drawFormatBits(modules, isFunction, level, bestMask, false);

  return {
    modules,
    size: modules.length,
    version,
    errorCorrectionLevel: level,
    mask: bestMask,
  };
}

function renderQrSvg(text, options = {}) {
  const qr = createQrCode(text, options.errorCorrectionLevel || "Q");
  const quietZone = options.quietZone ?? 4;
  const size = qr.size + quietZone * 2;
  const path = [];

  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.modules[y][x]) {
        path.push(`M${x + quietZone},${y + quietZone}h1v1h-1z`);
      }
    }
  }

  return Buffer.from(
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
      `<rect width="100%" height="100%" fill="#fff"/>`,
      `<path fill="#000" d="${path.join("")}"/>`,
      `</svg>`,
    ].join(""),
    "utf8",
  );
}

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    crcTable[i] = crc >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function renderQrPng(text, options = {}) {
  const qr = createQrCode(text, options.errorCorrectionLevel || "Q");
  const quietZone = options.quietZone ?? 4;
  const requestedSize = Math.max(256, Math.min(4096, Number(options.size || 2400)));
  const scale = Math.max(1, Math.floor(requestedSize / (qr.size + quietZone * 2)));
  const qrPixelSize = (qr.size + quietZone * 2) * scale;
  const offset = Math.floor((requestedSize - qrPixelSize) / 2);
  const rowSize = requestedSize + 1;
  const raw = Buffer.alloc(rowSize * requestedSize, 255);

  for (let y = 0; y < requestedSize; y += 1) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < requestedSize; x += 1) {
      const qrX = Math.floor((x - offset) / scale) - quietZone;
      const qrY = Math.floor((y - offset) / scale) - quietZone;
      const dark =
        qrX >= 0 &&
        qrY >= 0 &&
        qrX < qr.size &&
        qrY < qr.size &&
        qr.modules[qrY][qrX];
      raw[rowOffset + 1 + x] = dark ? 0 : 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(requestedSize, 0);
  ihdr.writeUInt32BE(requestedSize, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = {
  renderQrPng,
  renderQrSvg,
};
