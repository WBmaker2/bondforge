import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLength] = 0;
    rgba.copy(raw, y * rowLength + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const hex = (value) => {
  const n = parseInt(value.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy || 1));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};

const gold = hex('#f5b942');
const teal = hex('#5eead4');
const blue = hex('#60a5fa');
const ink = hex('#08101c');

function sample(u, v) {
  let r = ink[0];
  let g = ink[1];
  let b = ink[2];
  let a = 1;

  const radial = (cx, cy, radius, color, strength) => {
    const d = Math.hypot(u - cx, v - cy);
    const t = clamp(1 - d / radius);
    if (t <= 0) return;
    const k = t * t * strength;
    r = mix(r, color[0], k);
    g = mix(g, color[1], k);
    b = mix(b, color[2], k);
  };

  radial(0.18, 0.18, 0.58, teal, 0.16);
  radial(0.84, 0.18, 0.56, gold, 0.2);
  radial(0.5, 0.92, 0.6, blue, 0.12);

  const border = Math.max(
    Math.abs(u - 0.5),
    Math.abs(v - 0.5)
  );
  const borderAlpha = smooth(0.445, 0.475, border) * (1 - smooth(0.48, 0.497, border));
  r = mix(r, gold[0], borderAlpha * 0.45);
  g = mix(g, gold[1], borderAlpha * 0.45);
  b = mix(b, gold[2], borderAlpha * 0.45);

  const lineAlpha = 0.62;
  if (segDist(u, v, 0.5, 0.4, 0.28, 0.65) < 0.012) {
    r = mix(r, 225, lineAlpha); g = mix(g, 235, lineAlpha); b = mix(b, 250, lineAlpha);
  }
  if (segDist(u, v, 0.5, 0.4, 0.72, 0.65) < 0.012) {
    r = mix(r, 225, lineAlpha); g = mix(g, 235, lineAlpha); b = mix(b, 250, lineAlpha);
  }
  if (segDist(u, v, 0.32, 0.68, 0.68, 0.68) < 0.007) {
    r = mix(r, 160, 0.22); g = mix(g, 190, 0.22); b = mix(b, 220, 0.22);
  }

  const node = (cx, cy, radius, color) => {
    const d = Math.hypot(u - cx, v - cy);
    if (d > radius * 1.7) return;
    const glow = clamp(1 - d / (radius * 1.7)) * 0.28;
    r = mix(r, color[0], glow); g = mix(g, color[1], glow); b = mix(b, color[2], glow);
    if (d <= radius) {
      const edge = 1 - smooth(radius - 0.006, radius + 0.002, d);
      const nx = (u - cx) / radius;
      const ny = (v - cy) / radius;
      const shine = clamp(1 - Math.hypot(nx + 0.34, ny + 0.38) * 1.7);
      r = mix(r, color[0], edge);
      g = mix(g, color[1], edge);
      b = mix(b, color[2], edge);
      r = mix(r, 255, edge * shine * 0.55);
      g = mix(g, 255, edge * shine * 0.55);
      b = mix(b, 255, edge * shine * 0.55);
      const shade = clamp((nx * 0.4 + ny * 0.6) * 0.28);
      r = mix(r, 0, edge * shade);
      g = mix(g, 0, edge * shade);
      b = mix(b, 0, edge * shade);
    }
  };

  node(0.5, 0.4, 0.115, gold);
  node(0.28, 0.65, 0.088, teal);
  node(0.72, 0.65, 0.088, blue);

  return [clamp(r), clamp(g), clamp(b), a];
}

function render(size, supersample = 3) {
  const big = size * supersample;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const u = (x * supersample + sx + 0.5) / big;
          const v = (y * supersample + sy + 0.5) / big;
          const [sr, sg, sb, sa] = sample(u, v);
          r += sr; g += sg; b += sb; a += sa;
        }
      }
      const count = supersample * supersample;
      const offset = (y * size + x) * 4;
      buffer[offset] = Math.round(r / count);
      buffer[offset + 1] = Math.round(g / count);
      buffer[offset + 2] = Math.round(b / count);
      buffer[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return encodePng(size, size, buffer);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 3));
writeFileSync('public/icons/icon-512.png', render(512, 3));
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="g" cx="30%" cy="20%" r="90%">
      <stop offset="0" stop-color="#1d3357"/>
      <stop offset="0.55" stop-color="#0b1526"/>
      <stop offset="1" stop-color="#070b14"/>
    </radialGradient>
    <radialGradient id="a" cx="34%" cy="28%" r="70%">
      <stop offset="0" stop-color="#ffe6a8"/>
      <stop offset="0.55" stop-color="#f5b942"/>
      <stop offset="1" stop-color="#c58518"/>
    </radialGradient>
    <radialGradient id="b" cx="34%" cy="28%" r="70%">
      <stop offset="0" stop-color="#ccfff8"/>
      <stop offset="0.55" stop-color="#5eead4"/>
      <stop offset="1" stop-color="#1a9e8c"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="#f5b942" stroke-opacity=".35" stroke-width="2"/>
  <path d="M32 26 19 43M32 26 45 43" stroke="#dbe7fb" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="32" cy="26" r="8" fill="url(#a)"/>
  <circle cx="19" cy="43" r="6" fill="url(#b)"/>
  <circle cx="45" cy="43" r="6" fill="#60a5fa"/>
</svg>`
);
console.log('Generated PWA icons and favicon.');
