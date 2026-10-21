// Builds ONE self-contained page for the private Artifact: CSS and JS inlined, no relative files.
// Usage: node build-artifact.mjs <out-file>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), M = path.resolve(HERE, '..');
const read = (f) => fs.readFileSync(path.join(M, f), 'utf8');
const js = ['engine.js', 'data.js', 'fx.js', 'themes.js', 'ui.js', 'screens1.js', 'screens2.js', 'screens3.js', 'app.js'].map(read).join('\n;\n');
if (/<\/script/i.test(js)) throw new Error('script contains </script');
const html = `<title>Patas Mockups</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@700&display=swap">
<style>
${read('mock.css')}
</style>
<div class="wrap">
  <div class="bar" id="bar"></div>
  <div class="stage"><div class="phone" id="phone" data-mode="light"></div><aside class="notes" id="notes"></aside></div>
</div>
<script>
${js}
</script>
`;
// "doc" wraps it the way the Artifact host does (doctype, charset, viewport, plain body), for local testing only
const out = process.argv[3] === 'doc'
  ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${html}</body></html>`
  : html;
fs.writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], Math.round(html.length / 1024) + ' KB');
