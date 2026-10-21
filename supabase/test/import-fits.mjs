// Phase 4 check 5: do the importer's preview rows fit the real database rules?
// Loads supabase/schema.sql into the in-memory Postgres, signs in as one fake account, and inserts every
// row from import/preview.json through the same rules a phone would hit. Nothing leaves this machine.
//   node supabase/test/import-fits.mjs [import/preview.json]
import { makeDb } from './localdb.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const preview = JSON.parse(readFileSync(process.argv[2] || join(here, '..', '..', 'import', 'preview.json'), 'utf8'));
const db = await makeDb();
await db.exec(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));
const U = '33333333-3333-4333-8333-333333333333';
await db.query(`insert into auth.users (id, email) values ($1, 'owner-import-test@patas.invalid')`, [U]);

const cols = {
  debts: ['id', 'direction', 'kind', 'person_name', 'title', 'due_on', 'opened_on', 'settled_on', 'remind', 'qr_id', 'note', 'source_key', 'created_at', 'deleted'],
  installments: ['id', 'debt_id', 'seq', 'due_on', 'amount_centavos', 'source_key', 'created_at', 'deleted'],
  debt_lines: ['id', 'debt_id', 'kind', 'charge_kind', 'adjust_sign', 'amount_centavos', 'on_date', 'note', 'source_key', 'created_at', 'deleted'],
};
const sets = { debts: preview.debts, installments: preview.installments, debt_lines: preview.lines };
let failed = 0;
await db.exec('begin');
await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U, role: 'authenticated' })]);
await db.exec('set local role authenticated');
for (const [table, rows] of Object.entries(sets)) {
  let ok = 0;
  for (const r of rows) {
    const c = cols[table];
    try {
      await db.exec('savepoint s');
      await db.query(`insert into public.${table} (${c.join(', ')}) values (${c.map((_, i) => `$${i + 1}`).join(', ')})`, c.map((k) => r[k]));
      await db.exec('release savepoint s');
      ok++;
    } catch (e) {
      await db.exec('rollback to savepoint s');
      failed++;
      console.log(`FAIL  ${table} ${r.source_key}: ${e.code} ${e.message}`);
    }
  }
  console.log(`${table}: ${ok}/${rows.length} inserted as the owner`);
}
// Re-running the import must not duplicate: the same source keys are refused as duplicates.
let dupRefused = 0;
for (const r of preview.debts.slice(0, 3)) {
  try {
    await db.exec('savepoint d');
    await db.query(`insert into public.debts (id, kind, person_name, opened_on, source_key, created_at) values ($1, 'one_time', 'x', current_date, $2, 1)`, [r.id + 'x', r.source_key]);
    await db.exec('release savepoint d');
  } catch (e) { await db.exec('rollback to savepoint d'); if (e.code === '23505') dupRefused++; }
}
const n = (await db.query(`select (select count(*) from public.debts)::int d, (select count(*) from public.installments)::int i, (select count(*) from public.debt_lines)::int l`)).rows[0];
await db.exec('commit');
console.log(`stored: ${n.d} debts, ${n.i} installments, ${n.l} lines (caps: 300 / 3,000 / 10,000)`);
console.log(`re-import of an existing source key refused as a duplicate: ${dupRefused}/3`);
const pass = failed === 0 && dupRefused === 3 && n.d === preview.debts.length && n.i === preview.installments.length && n.l === preview.lines.length;
console.log(pass ? 'FITS: every preview row is accepted by the real rules' : 'DOES NOT FIT');
process.exit(pass ? 0 : 1);
