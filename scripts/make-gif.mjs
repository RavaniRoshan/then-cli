// Generates docs/demo.gif without a GIF dependency.
// Frames are drawn as SVG, rendered with resvg, decoded, quantised, and LZW-encoded.
import { inflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const W = 960;
const H = 540;
const BG = '#101618';
const FG = '#f2efe8';
const MUTED = '#8fa09b';
const MOSS = '#5b9c89';
const RUST = '#c46b4f';
const RULE = '#2c373a';

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function frame(lines, footer) {
  const body = lines
    .map((line, index) => {
      const y = 150 + index * 46;
      const color = line.startsWith('$') ? MOSS : line.startsWith('!') ? RUST : FG;
      const text = line.replace(/^[$!]\s?/, '');
      return `<text x="64" y="${y}" fill="${color}" font-family="Consolas, Arial, sans-serif" font-size="25">${esc(text)}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <rect x="0" y="0" width="8" height="${H}" fill="${MOSS}"/>
    <text x="64" y="70" fill="${MUTED}" font-family="Arial, sans-serif" font-size="18">then · local bookmark archaeology</text>
    <line x1="64" y1="96" x2="${W - 64}" y2="96" stroke="${RULE}" stroke-width="2"/>
    ${body}
    <line x1="64" y1="${H - 96}" x2="${W - 64}" y2="${H - 96}" stroke="${RULE}" stroke-width="2"/>
    <text x="64" y="${H - 56}" fill="${MUTED}" font-family="Arial, sans-serif" font-size="16">${esc(footer)}</text>
  </svg>`;
}

const frames = [
  {
    delay: 110,
    svg: frame([
      '$ npx then-cli --no-check',
      '6 links saved · 3 years',
      '33.3% not opened recently',
      '89-day history window',
    ], 'read locally · nothing uploaded'),
  },
  {
    delay: 110,
    svg: frame([
      '$ npx then-cli --no-check',
      '2014  ████████████████  3 links',
      '2020  ██████████        2 links',
      '2026  █████             1 link',
    ], 'one year at a time'),
  },
  {
    delay: 1500,
    svg: frame([
      '$ npx then-cli card',
      'dead 0.0% · not opened recently 33.3%',
      'top domain of earliest year: github.com',
      '! card.png + card.svg written',
    ], 'then · ran locally, nothing uploaded'),
  },
];

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('Expected 8-bit RGBA PNG');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos++];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[pos++];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      else if (filter === 2) prediction = above;
      else if (filter === 3) prediction = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - upperLeft);
        prediction = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      }
      pixels[y * stride + x] = (value + prediction) & 0xff;
    }
  }
  return { width, height, pixels };
}

const PALLETE_SIZE = 216;
function palette() {
  const table = Buffer.alloc(256 * 3);
  for (let r = 0; r < 6; r += 1) {
    for (let g = 0; g < 6; g += 1) {
      for (let b = 0; b < 6; b += 1) {
        const index = r * 36 + g * 6 + b;
        table[index * 3] = Math.round((r / 5) * 255);
        table[index * 3 + 1] = Math.round((g / 5) * 255);
        table[index * 3 + 2] = Math.round((b / 5) * 255);
      }
    }
  }
  return table;
}

function quantise(pixels) {
  const out = Buffer.alloc(pixels.length / 4);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) {
    const r = Math.round((pixels[i] / 255) * 5);
    const g = Math.round((pixels[i + 1] / 255) * 5);
    const b = Math.round((pixels[i + 2] / 255) * 5);
    out[j] = r * 36 + g * 6 + b;
  }
  return out;
}

function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  // Keep the code width fixed at 9 bits. Resetting the dictionary with clear
  // codes keeps every decoder in agreement about when code size changes.
  const codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  let dict = new Map();
  let sinceClear = 0;
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  function emit(code) {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(buffer & 0xff);
      buffer >>= 8;
      bits -= 8;
    }
  }
  function reset() {
    emit(clear);
    dict = new Map();
    nextCode = eoi + 1;
    sinceClear = 0;
  }
  reset();
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const key = `${prefix},${indices[i]}`;
    const existing = dict.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }
    emit(prefix);
    sinceClear += 1;
    dict.set(key, nextCode);
    nextCode += 1;
    if (sinceClear >= 200) {
      reset();
      prefix = indices[i];
      continue;
    }
    prefix = indices[i];
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) bytes.push(buffer & 0xff);
  return Buffer.from(bytes);
}

function subBlocks(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.subarray(i, i + 255);
    parts.push(Buffer.from([chunk.length]), chunk);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function u16(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value, 0);
  return b;
}

function buildGif(encodedFrames) {
  const parts = [Buffer.from('GIF89a', 'ascii')];
  parts.push(Buffer.from([W & 0xff, W >> 8, H & 0xff, H >> 8, 0xf7, 0, 0]));
  parts.push(palette());
  parts.push(Buffer.from([0x21, 0xff, 0x0b]));
  parts.push(Buffer.from('NETSCAPE2.0', 'ascii'));
  parts.push(Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]));

  for (const { indices, delay } of encodedFrames) {
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x08]));
    parts.push(u16(Math.max(1, Math.round(delay / 10))));
    parts.push(Buffer.from([0x00, 0x00]));
    parts.push(Buffer.from([0x2c]));
    parts.push(u16(0), u16(0), u16(W), u16(H), Buffer.from([0x00]));
    parts.push(Buffer.from([0x08]));
    parts.push(subBlocks(lzw(indices, 8)));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

const encoded = frames.map((entry) => {
  const png = new Resvg(entry.svg).render().asPng();
  const decoded = decodePng(png);
  return { indices: quantise(decoded.pixels), delay: entry.delay };
});

const gif = buildGif(encoded);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/demo.gif', gif);
process.stdout.write(`Wrote docs/demo.gif (${gif.length.toLocaleString()} bytes, ${encoded.length} frames)\n`);
