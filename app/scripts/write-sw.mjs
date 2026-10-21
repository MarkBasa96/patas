// Run after `expo export`: fills the service worker's file list and version from the ACTUAL build
// (Kenshin v3 M9: never by hand, or index.html and its bundle can come from different builds).
// Usage: node scripts/write-sw.mjs <export dir>
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out || !fs.existsSync(path.join(out, 'sw.js'))) {
  console.error('write-sw: no sw.js in', out);
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else files.push('/' + path.relative(out, p).split(path.sep).join('/'));
  }
})(out);

// The app's own files only. Never the worker itself, the Android link check, or build metadata.
const skip = (p) => p === '/sw.js' || p === '/index.html' || p === '/metadata.json' || p.startsWith('/.well-known/') || p.startsWith('/.vercel');
const precache = ['/', ...files.filter((p) => !skip(p)).sort()];

const bundles = files.filter((p) => /^\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js$/.test(p));
if (bundles.length !== 1) {
  // skipWaiting is only safe with one bundle and no lazy chunks (Kenshin v3 M9).
  console.error('write-sw: expected exactly one web bundle, found', bundles);
  process.exit(1);
}
// The version is a fingerprint of EVERY file in the build (index.html included), not just the bundle:
// a change to the page, the QR decoder's engine or an icon must also replace the offline copy at once.
const hash = createHash('sha256');
for (const p of files.filter((f) => f !== '/sw.js').sort()) hash.update(p).update(fs.readFileSync(path.join(out, p)));
const version = hash.digest('hex').slice(0, 12);

const swPath = path.join(out, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__VERSION__') || !sw.includes('__PRECACHE__')) {
  console.error('write-sw: placeholders missing (already written?)');
  process.exit(1);
}
sw = sw.replace("'__VERSION__'", JSON.stringify(version)).replace('__PRECACHE__', JSON.stringify(precache, null, 2));
fs.writeFileSync(swPath, sw);
console.log(`write-sw: version ${version}, ${precache.length} files`);
