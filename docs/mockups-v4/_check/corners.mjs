// Popup and sheet corners: the pixel just inside each rounded top corner must be the dimmed backdrop, not the panel
// (a square title strip poking past the curve fails this). Control: the same spot 20px inside the panel is the panel.
import zlib from 'node:zlib';
import { start, stop, open, cdp, ev, click, sleep } from './lib.mjs';
function decodePng(buf) {
  let p = 8, w = 0, h = 0, bpp = 4; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bpp = data[9] === 6 ? 4 : 3; }
    if (type === 'IDAT') idat.push(data); p += len + 12; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0; let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255; } }
  return { px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let fail = 0;
await start();
for (const m of ['light', 'dark']) for (const [s, label] of [['paid', 'Paid popup'], ['due', 'Due popup'], ['settings', 'Settings sheet'], ['more', '⋯ sheet']]) {
  await open(`s=${s}&m=${m}`, 390, 844, m);
  await sleep(400);
  const r = await ev('(()=>{const b=document.querySelector("#phone .modal .dialog").getBoundingClientRect();return {x:b.x,y:b.y,w:b.width}})()');
  const png = decodePng(Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  const corner = png.px(Math.round(r.x + 2), Math.round(r.y + 2)), outside = png.px(Math.round(r.x + 2), Math.max(0, Math.round(r.y - 6))), inside = png.px(Math.round(r.x + 24), Math.round(r.y + 24));
  const ok = dist(corner, outside) < 18 && dist(inside, outside) > 18;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${m}: corner ${corner} vs backdrop ${outside} (panel ${inside})`);
}
stop();
console.log(fail ? `${fail} failed` : 'all corners round');
process.exitCode = fail ? 1 : 0;
