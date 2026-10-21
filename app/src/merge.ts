// Pull-side merge: server rows replace local ones, except rows with changes still waiting to be sent.

export type Keyed = { id: string; updated_at?: string };

export function mergePulled<T extends Keyed>(local: T[], pulled: T[], dirty: ReadonlySet<string>): T[] {
  const byId = new Map(local.map((r) => [r.id, r] as const));
  for (const r of pulled) {
    if (dirty.has(r.id)) continue; // my newer local edit wins until it has been sent
    byId.set(r.id, r);
  }
  return [...byId.values()];
}

export type Cursor = { t: string; id: string };
export const START_CURSOR: Cursor = { t: '1970-01-01T00:00:00Z', id: '' };

/** PostgREST filter for "changed after the cursor". Timestamps are quoted: they contain '.' and ':'. */
export const afterCursorFilter = (c: Cursor): string => `updated_at.gt."${c.t}",and(updated_at.eq."${c.t}",id.gt."${c.id}")`;

/** Rows from the server are untrusted: keep only what we expect, with safe fallbacks. */
export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
export function int(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : fallback;
}
