// Writes a plain-text dump of chosen sheets (value, formula, note, hidden rows) for review.
// Output goes to import/ only, which git ignores. Usage:
//   node tools/import/dump.mjs import/breakdown.xlsx import/dump-breakdown.txt [Sheet1,Sheet2]
import { writeFileSync } from 'node:fs';
import { readWorkbook, splitRef, colToNum } from './xlsx.mjs';

const [, , file, out, only] = process.argv;
const want = only ? only.split(',') : null;
const { sheets } = readWorkbook(file);
const lines = [];
for (const [name, sh] of sheets) {
  if (want && !want.includes(name)) continue;
  lines.push(`\n===== ${name} (${sh.state}) hidden rows: ${[...sh.hiddenRows].join(',') || 'none'} =====`);
  const sorted = [...sh.cells.values()].sort((a, b) => {
    const A = splitRef(a.ref), B = splitRef(b.ref);
    return A.row - B.row || colToNum(A.col) - colToNum(B.col);
  });
  let row = 0;
  for (const c of sorted) {
    const r = splitRef(c.ref).row;
    if (r !== row) { row = r; lines.push(`-- row ${r}${sh.hiddenRows.has(r) ? ' [HIDDEN]' : ''}`); }
    const v = c.date ? `date ${c.date}` : JSON.stringify(c.value);
    lines.push(`  ${c.ref}: ${v}${c.formula !== undefined ? `   = ${c.formula}` : ''}${sh.notes.has(c.ref) ? `   NOTE: ${sh.notes.get(c.ref)}` : ''}`);
  }
  for (const [ref, n] of sh.notes) if (!sh.cells.has(ref)) lines.push(`  ${ref}: (empty)   NOTE: ${n}`);
}
writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out}: ${lines.length} lines`);
