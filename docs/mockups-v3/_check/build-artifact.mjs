// Builds ONE self-contained page for the private Artifact: CSS and JS inlined, logo embedded.
// Usage: node build-artifact.mjs <out-file> [doc]   ("doc" wraps it the way the host does, for local testing only)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), M = path.resolve(HERE, '..');
const read = (f) => fs.readFileSync(path.join(M, f), 'utf8');
const js = read('logo.js') + '\n;\n' + read('app.js');
if (/<\/script/i.test(js)) throw new Error('script contains </script');
const html = `<title>Patas Mockups</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>
${read('app.css')}
</style>
<div class="wrap">
  <div class="bar" id="bar"></div>
  <div class="stage"><div class="phone" id="phone" data-device="android"></div><aside class="notes" id="notes"></aside></div>
</div>
<script>
${js}
</script>
`;
const out = process.argv[3] === 'doc' ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${html}</body></html>` : html;
fs.mkdirSync(path.dirname(path.resolve(process.argv[2])), { recursive: true });
fs.writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], Math.round(html.length / 1024) + ' KB');
