// Draws the placeholder Patas icons (Ink blue gradient, white "P") as PNG files, with no dependencies.
// node scripts/make-icons.mjs   ->  public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
// The owner's own logo is private and never goes in this repo; swap these files for it locally if wanted.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
};
const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

// The letter P in a 0..1 square.
const inP = (x, y) => {
  if (x >= 0.31 && x <= 0.43 && y >= 0.22 && y <= 0.78) return true; // stem
  if (x >= 0.43 && x <= 0.47 && ((y >= 0.215 && y <= 0.335) || (y >= 0.485 && y <= 0.605))) return true; // bars
  const dx = x - 0.47;
  const dy = y - 0.41;
  const d = Math.hypot(dx, dy);
  return dx >= 0 && d <= 0.195 && d >= 0.075; // the round part
};

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 3; // 3 x 3 samples per pixel for smooth edges
  const scale = maskable ? 0.78 : 1; // maskable icons keep the letter inside the safe zone
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size;
          const y = (py + (sy + 0.5) / S) / size;
          const r = 0.22;
          const cx = Math.min(Math.max(x, r), 1 - r);
          const cy = Math.min(Math.max(y, r), 1 - r);
          const inside = maskable || Math.hypot(x - cx, y - cy) <= r;
          if (inside) {
            bg++;
            if (inP((x - 0.5) / scale + 0.5, (y - 0.5) / scale + 0.5)) fg++;
          }
        }
      }
      const n = S * S;
      const t = (px + py) / (2 * size);
      const base = [0x36 + (0x58 - 0x36) * t, 0x4c + (0x73 - 0x4c) * t, 0x8c + (0xb8 - 0x8c) * t]; // Ink blue accent -> its lighter tone
      const i = (py * size + px) * 4;
      const f = fg / n;
      buf[i] = Math.round(base[0] * (1 - f) + 255 * f);
      buf[i + 1] = Math.round(base[1] * (1 - f) + 255 * f);
      buf[i + 2] = Math.round(base[2] * (1 - f) + 255 * f);
      buf[i + 3] = Math.round((bg / n) * 255);
    }
  }
  return png(size, size, buf);
}

writeFileSync(out + 'icon-192.png', draw(192, false));
writeFileSync(out + 'icon-512.png', draw(512, false));
writeFileSync(out + 'icon-maskable-512.png', draw(512, true));
writeFileSync(out + 'apple-touch-icon.png', draw(180, true));
console.log('icons written to', out);
