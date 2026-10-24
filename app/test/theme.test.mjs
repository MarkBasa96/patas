// Phase 5 checks: theme maths, readable colours in all 12 looks, and the peso sign in every bundled font.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { THEME_ORDER, THEMES, contrast, mix, tokens } from '../src/theme.ts';

const require = createRequire(import.meta.url);

test('contrast maths is right on known pairs (so the checks below can fail)', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrast('#777777', '#777777').toFixed(2), '1.00');
  assert.ok(contrast('#767676', '#FFFFFF') >= 4.5 && contrast('#777777', '#FFFFFF') < 4.5); // the classic AA edge
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
});

test('six themes, each with a light and a dark look', () => {
  assert.equal(THEME_ORDER.length, 6);
  assert.deepEqual(Object.keys(THEMES).sort(), [...THEME_ORDER].sort());
});

for (const key of THEME_ORDER) {
  for (const mode of ['light', 'dark']) {
    test(`readable: ${key} ${mode}`, () => {
      const t = tokens(key, mode);
      const rows = [
        ['text on background', t.text, t.bg, 4.5],
        ['text on card', t.text, t.surface, 4.5],
        ['muted on background', t.muted, t.bg, 4.5],
        ['muted on card', t.muted, t.surface, 4.5],
        ['accent on background', t.accent, t.bg, 4.5],
        ['accent on its soft tint (active tab)', t.accent, t.accentSoft, 4.5],
        ['white on filled accent (pills, hero)', '#FFFFFF', t.accentFill, 4.5],
        ['danger on card', t.danger, t.surface, 4.5],
      ];
      const bad = rows.filter(([, fg, bg, min]) => contrast(fg, bg) < min).map(([name, fg, bg, min]) => `${name}: ${contrast(fg, bg).toFixed(2)} < ${min}`);
      assert.deepEqual(bad, []);
    });
  }
}

test('the bundled Manrope draws the peso sign (U+20B1) and has equal-width digits (tnum)', async () => {
  const opentype = require('opentype.js');
  const dir = fileURLToPath(new URL('../public/fonts/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.ttf'));
  assert.deepEqual(files, ['Manrope-Variable.ttf']);
  const buf = readFileSync(dir + files[0]);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const g = font.charToGlyph('₱');
  assert.ok(g && g.index !== 0 && g.unicode === 0x20b1, 'no peso glyph');
  const tags = (font.tables.gsub?.features ?? []).map((f) => f.tag);
  assert.ok(tags.includes('tnum'), 'no tnum feature');
  const sym = ['$', '€', '£', '¥']; // every currency symbol the app shows must be drawn (others use letters)
  for (const c of sym) assert.notEqual(font.charToGlyph(c).index, 0, c);
});
