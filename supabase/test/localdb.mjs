// One in-memory Postgres with the Supabase stand-in loaded (auth, storage, vault, pgcrypto in
// "extensions"), shared by every local test so they all build the same thing.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'));
  return db;
}
