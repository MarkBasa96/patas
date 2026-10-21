// Puts the QR decoder's engine file into public/, so Patas serves it itself (never from a CDN: viewing a
// QR must tell no third party anything, and decoding must work offline). Run before `expo export`.
// The copy is checked byte for byte against the installed package.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const from = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
const to = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'zxing_reader.wasm');
copyFileSync(from, to);
const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (h(from) !== h(to)) {
  console.error('copy-wasm: the copy differs from the package');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'zxing-wasm', 'package.json'), 'utf8')).version;
console.log(`copy-wasm: zxing-wasm ${version} reader engine copied (sha256 ${h(to).slice(0, 12)})`);
