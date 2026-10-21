// Test-only: makes a FAKE payment QR picture (made-up name, no real account) with zxing-wasm's writer,
// then reads it back with the reader the app uses. Proves the decoder runs from a local wasm file.
//   node scripts/qr-fixture.mjs <out.png> [name]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const full = require('zxing-wasm/full');
const wasm = readFileSync(require.resolve('zxing-wasm/full/zxing_full.wasm'));
full.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) } });

const crc16 = (s) => { let c = 0xffff; for (const ch of s) { c ^= ch.charCodeAt(0) << 8; for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };
const tlv = (t, v) => `${t}${String(v.length).padStart(2, '0')}${v}`;
const name = process.argv[3] || 'TEST LENDER';
const body = tlv('00', '01') + tlv('01', '11') + tlv('27', tlv('00', 'com.example.fake') + tlv('01', '0000')) + tlv('53', '608') + tlv('58', 'PH') + tlv('59', name) + tlv('60', 'Test City') + '6304';
const text = body + crc16(body);

const out = await full.writeBarcode(text, { format: 'QRCode', scale: 6 });
const png = Buffer.from(await out.image.arrayBuffer());
writeFileSync(process.argv[2], png);
const back = await full.readBarcodes(new Uint8Array(png), { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
console.log(`wrote ${png.length} bytes; read back: ${back[0]?.text === text ? 'SAME TEXT' : 'DIFFERENT: ' + back[0]?.text}`);
