// Builds ONE self-contained page for the private Artifact: CSS, JS, the checked font files and the two logo images
// all inlined (the Artifact host loads nothing else). Usage: node build-artifact.mjs <out-file> [doc]
// "doc" wraps it in <html><body> the way the host does, for local testing only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), M = path.resolve(HERE, '..'), APP = path.resolve(M, '..', '..', 'app');
const read = (f) => fs.readFileSync(path.join(M, f), 'utf8');
const b64 = (file) => fs.readFileSync(file).toString('base64');
let css = read('app.css');
const fontUrl = (rel) => `url(data:font/ttf;base64,${b64(path.resolve(M, rel))})`;
css = css.replace(/url\('([^']+\.ttf)'\)/g, (_, rel) => fontUrl(rel));
if (/url\('(?!data:)/.test(css)) throw new Error('an external url() is left in the CSS');
const img = (f) => `'data:image/png;base64,${b64(path.join(APP, 'assets/brand', f))}'`;
const assets = `window.PATAS_ASSETS={glyph:${img('patas-mono.png')},small:${img('patas-mono-small.png')},smallViolet:${img('patas-mono-small-violet.png')},logo:${img('patas-logo.png')}};`;
const js = assets + '\n' + read('engine.js') + '\n;\n' + read('motion.js') + '\n;\n' + read('app.js');
if (/<\/script/i.test(js)) throw new Error('script contains </script');
const html = `<title>Patas Round 4</title>
<style>
${css}
</style>
<div class="wrap">
  <div class="bar" id="bar"></div>
  <div class="stage"><div class="phone" id="phone"></div><aside class="notes" id="notes"></aside></div>
</div>
<script>
${js}
</script>
`;
const out = process.argv[3] === 'doc' ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${html}</body></html>` : html;
fs.mkdirSync(path.dirname(path.resolve(process.argv[2])), { recursive: true });
fs.writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], Math.round(out.length / 1024) + ' KB');
