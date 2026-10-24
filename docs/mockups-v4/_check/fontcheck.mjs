// Checks candidate fonts before the owner sees them: does each file draw the peso sign (U+20B1, a real outline, not the
// empty .notdef box), and can its digits be fixed-width (a "tnum" feature, or digits that are already equal)?
// Count-up money jiggles sideways if digits have different widths.
//   node docs/mockups-v4/_check/fontcheck.mjs <font.ttf> [...]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const require = createRequire(new URL('../../../app/package.json', import.meta.url));
const opentype = require('opentype.js');

let bad = 0;
for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const peso = font.charToGlyph('₱');
  const pesoOk = !!peso && peso.index !== 0 && peso.unicode === 0x20b1 && peso.path.commands.length > 0;
  const features = new Set((font.tables.gsub?.features ?? []).map((f) => f.tag));
  const widths = [...'0123456789'].map((d) => font.charToGlyph(d).advanceWidth);
  const equalDefault = widths.every((w) => w === widths[0]);
  const tabular = equalDefault || features.has('tnum');
  if (!pesoOk || !tabular) bad++;
  console.log(`${basename(file)}: peso ${pesoOk ? 'yes' : 'NO'}; tnum feature ${features.has('tnum') ? 'yes' : 'no'}; default digits ${equalDefault ? 'equal' : 'vary ' + Math.min(...widths) + '-' + Math.max(...widths)} -> ${pesoOk && tabular ? 'OK' : 'FAIL'}`);
}
console.log(bad ? `${bad} font file(s) FAIL` : 'all fonts OK');
process.exitCode = bad ? 1 : 0;
