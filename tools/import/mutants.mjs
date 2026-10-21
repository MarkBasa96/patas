// Proves the dry run's reconcile can fail: for every debt in the (private) mapping it makes two small
// mistakes, one at a time, and expects the dry run to report RECONCILE FAILED.
//   1. drop one of the debt's sources (a missed tab, tick grid or hidden number)
//   2. change one typed amount by a single centavo
// Also checks that two clean runs give the same digest. Writes temp mappings to import/ only.
//   node tools/import/mutants.mjs [import/mapping.json]
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const path = process.argv[2] || 'import/mapping.json';
const base = JSON.parse(readFileSync(path, 'utf8'));
const tmp = 'import/_mutant-mapping.json';
const run = (m) => {
  writeFileSync(tmp, JSON.stringify(m));
  const r = spawnSync(process.execPath, ['tools/import/dry-run.mjs', tmp], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr, digest: (r.stdout.match(/digest (\w+)/) || [])[1] };
};
const bump = (text) => {
  const [w, f = '00'] = String(text).split('.');
  const c = Number(w) * 100 + Number(f.padEnd(2, '0')) + 1;
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
};

const clean1 = run(base), clean2 = run(base);
let caught = 0, total = 0;
const report = (name, r) => {
  total++;
  const ok = r.code !== 0 && /RECONCILE FAILED/.test(r.out);
  if (ok) caught++;
  console.log(`${ok ? 'caught   ' : 'SURVIVED '} ${name}`);
};
console.log(`clean run: ${clean1.code === 0 ? 'RECONCILE OK' : 'FAILED'}; same digest on re-run: ${clean1.digest === clean2.digest} (${clean1.digest})`);

base.debts.forEach((d, di) => {
  d.sources.forEach((s, si) => {
    // Dropping a source whose rows hold nothing (e.g. a debt with no payments yet) changes no number; skip those.
    const m = structuredClone(base);
    m.debts[di].sources.splice(si, 1);
    if (s.type === 'principal' && d.sources.length === 1) return;
    report(`${d.key}: drop source ${si + 1} (${s.type})`, run(m));
  });
  const m = structuredClone(base);
  // A peso amount typed in the mapping (not a column letter like "C").
  const isPesos = (v) => typeof v === 'string' && /^\d+(\.\d{1,2})?$/.test(v);
  const s = m.debts[di].sources.find((x) => isPesos(x.amount) || isPesos(x.each) || isPesos(x.splitTotal)) || null;
  if (m.debts[di].plan) { m.debts[di].plan.total = bump(m.debts[di].plan.total); report(`${d.key}: plan total +0.01`, run(m)); }
  else if (s) {
    if (isPesos(s.amount)) s.amount = bump(s.amount); else if (isPesos(s.each)) s.each = bump(s.each); else s.splitTotal = bump(s.splitTotal);
    report(`${d.key}: one amount +0.01`, run(m));
  } else {
    // Only spreadsheet cells feed this debt: shift its first source's rows by one instead (a misread range).
    const src = m.debts[di].sources[0];
    src.rows = [src.rows[0] + 1, src.rows[1]];
    report(`${d.key}: first row of source 1 missed`, run(m));
  }
});
rmSync(tmp, { force: true });
console.log(`\n${caught}/${total} mutants caught`);
process.exit(caught === total && clean1.code === 0 && clean1.digest === clean2.digest ? 0 : 1);
