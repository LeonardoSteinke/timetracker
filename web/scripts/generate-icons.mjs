// Gera os ícones PNG do PWA (sem dependências externas) desenhando um relógio.
// Uso: node scripts/generate-icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public');
fs.mkdirSync(OUT, { recursive: true });

const BG = [79, 70, 229];    // indigo #4f46e5
const FACE = [255, 255, 255];
const HAND = [30, 27, 75];   // indigo-950

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  // scanlines com filtro 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function blend(buf, i, color, a) {
  buf[i] = Math.round(buf[i] * (1 - a) + color[0] * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + color[1] * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + color[2] * a);
  buf[i + 3] = 255;
}

function drawIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const bgRadius = maskable ? size : size * 0.46;     // maskable: preenche tudo
  const faceR = size * (maskable ? 0.30 : 0.34);
  const rounded = size * 0.22;                        // canto arredondado (não-maskable)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - c;
      const dy = y - c;
      // fundo
      let inBg;
      if (maskable) {
        inBg = true;
      } else {
        // retângulo arredondado
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const half = size * 0.46;
        const rx = ax - (half - rounded);
        const ry = ay - (half - rounded);
        if (rx > 0 && ry > 0) inBg = Math.hypot(rx, ry) <= rounded;
        else inBg = ax <= half && ay <= half;
      }
      if (inBg) {
        buf[i] = BG[0]; buf[i + 1] = BG[1]; buf[i + 2] = BG[2]; buf[i + 3] = 255;
      } else {
        buf[i + 3] = 0;
      }
      // mostrador (círculo branco) com anti-alias
      const dist = Math.hypot(dx, dy);
      const aa = 1.2;
      if (dist < faceR + aa) {
        const a = Math.min(1, Math.max(0, faceR + aa - dist)) / aa;
        if (inBg) blend(buf, i, FACE, Math.min(1, a));
      }
    }
  }

  // ponteiros: minuto (12h → cima) e hora (~4h → baixo-direita)
  const drawHand = (angleDeg, length, thick) => {
    const ang = (angleDeg - 90) * (Math.PI / 180);
    const ex = c + Math.cos(ang) * length;
    const ey = c + Math.sin(ang) * length;
    const steps = Math.ceil(length * 2);
    for (let s = 0; s <= steps; s++) {
      const px = c + (ex - c) * (s / steps);
      const py = c + (ey - c) * (s / steps);
      for (let oy = -thick; oy <= thick; oy++) {
        for (let ox = -thick; ox <= thick; ox++) {
          if (ox * ox + oy * oy > thick * thick) continue;
          const xx = Math.round(px + ox), yy = Math.round(py + oy);
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          blend(buf, (yy * size + xx) * 4, HAND, 1);
        }
      }
    }
  };
  drawHand(0, faceR * 0.62, size * 0.020);     // ponteiro dos minutos
  drawHand(120, faceR * 0.44, size * 0.026);   // ponteiro das horas
  // pino central
  for (let oy = -size * 0.03; oy <= size * 0.03; oy++)
    for (let ox = -size * 0.03; ox <= size * 0.03; ox++)
      if (ox * ox + oy * oy <= (size * 0.03) ** 2)
        blend(buf, ((c + oy | 0) * size + (c + ox | 0)) * 4, HAND, 1);

  return encodePng(size, buf);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['favicon-32.png', 32, {}],
];
for (const [name, size, opts] of targets) {
  fs.writeFileSync(path.join(OUT, name), drawIcon(size, opts));
  console.log('gerado', name);
}
