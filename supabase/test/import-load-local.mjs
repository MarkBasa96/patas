// Phase 7 rehearsal: run the generated import/load.sql twice and import/reconcile.sql in the in-memory
// Postgres, with a negative control. Nothing leaves this machine. Generate the SQL first:
//   node tools/import/load-sql.mjs <owner-user-id>   then   node supabase/test/import-load-local.mjs <same id>
import { makeDb } from './localdb.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const uid = process.argv[2];
const load = readFileSync(join(root, 'import', 'load.sql'), 'utf8');
const reconcile = readFileSync(join(root, 'import', 'reconcile.sql'), 'utf8');
const db = await makeDb();
await db.exec(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));
await db.query(`insert into auth.users (id, email) values ($1, 'owner-import-test@patas.invalid')`, [uid]);

const inserted = async () => (await db.exec(load)).filter((r) => r.rows.length && 'what' in r.rows[0]).map((r) => `${r.rows[0].what} ${r.rows[0].n}`).join(', ');
console.log('first load :', await inserted());
console.log('second load:', await inserted());
const show = async (label) => {
  const r = (await db.exec(reconcile)).at(-1).rows[0];
  console.log(label, JSON.stringify(r));
  return r;
};
const ok = await show('reconcile  :');
// Negative control: change one payment by one centavo, inside a transaction we roll back.
await db.exec(`begin; update public.debt_lines set amount_centavos = amount_centavos + 1
  where id = (select id from public.debt_lines where kind = 'payment' order by source_key limit 1);`);
const bad = await show('control    :');
await db.exec('rollback');
const pass = Number(ok.mismatched_debts) === 0 && Number(bad.mismatched_debts) === 1 && bad.fingerprint !== ok.fingerprint;
console.log(pass ? 'REHEARSAL OK: loads once, reconciles, and the control is caught' : 'REHEARSAL FAILED');
process.exit(pass ? 0 : 1);
