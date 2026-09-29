// Render the app/tray icons from the sprite data: node tools/make-icons.js
// Writes assets/icon.png (256), assets/tray.png (16) and assets/tray@2x.png (32).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const S = require('../src/sprites');

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// Head + ear composed on a small grid.
function headGrid() {
  const size = 20;
  const g = Array.from({ length: size }, () => new Array(size).fill('.'));
  const stamp = (part, x, y) => part.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '.' && g[y + r] && x + c < size) g[y + r][x + c] = ch;
  }));
  stamp(S.parts.HEAD.normal, 1, 3);
  stamp(S.parts.EAR.down, 1, 5);
  return g;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(grid, px, { background, size = grid.length * px } = {}) {
  const off = Math.floor((size - grid.length * px) / 2);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = grid[Math.floor((y - off) / px)];
      const ch = (y >= off && x >= off && row && row[Math.floor((x - off) / px)]) || '.';
      let rgba = ch === '.' ? null : hexToRgba(S.PALETTE[ch]);
      if (!rgba && background) {
        // rounded-square backdrop
        const r = size * 0.18;
        const cx = Math.min(Math.max(x, r), size - r);
        const cy = Math.min(Math.max(y, r), size - r);
        if (Math.hypot(x - cx, y - cy) <= r) rgba = background;
      }
      if (rgba) buf.set(rgba, (y * size + x) * 4);
    }
  }
  return encodePng(size, size, buf);
}

function scaleTo(grid, target) {
  // nearest-neighbour downscale of the 20px grid into `target` px
  const n = grid.length;
  return Array.from({ length: target }, (_, y) =>
    Array.from({ length: target }, (_, x) => grid[Math.floor((y * n) / target)][Math.floor((x * n) / target)]));
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
const g = headGrid();
// 20px grid padded to 32 for a clean 8x scale to 256
const pad = (grid, size) => {
  const off = Math.floor((size - grid.length) / 2);
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) =>
    (grid[y - off] && grid[y - off][x - off]) || '.'));
};
// crop to the drawn pixels, centre in a square, scale 11x onto 256px
const rows = g.map((r) => r.join(''));
const ys = rows.map((r, i) => (/[^.]/.test(r) ? i : -1)).filter((i) => i >= 0);
const xs = [].concat(...g.map((r) => r.map((c, i) => (c !== '.' ? i : -1)))).filter((i) => i >= 0);
const cropped = g.slice(Math.min(...ys), Math.max(...ys) + 1).map((r) => r.slice(Math.min(...xs), Math.max(...xs) + 1));
const side = Math.max(cropped.length, cropped[0].length) + 2;
fs.writeFileSync(path.join(out, 'icon.png'), render(pad(cropped.map((r) => r.concat(new Array(side - 2 - r.length).fill('.'))), side), 11, { size: 256, background: [255, 236, 204, 255] }));
fs.writeFileSync(path.join(out, 'tray.png'), render(scaleTo(g, 16), 1));
fs.writeFileSync(path.join(out, 'tray@2x.png'), render(g.length === 20 ? pad(g, 32) : g, 1));
console.log('icons written to', out);

module.exports = { encodePng, crc32 };
