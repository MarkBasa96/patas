// Pure sync logic, no imports, so it can be tested with plain Node.

export type DbError = { code?: string; message?: string } | null;

/** Postgres/PostgREST errors carry a 5-character SQLSTATE (e.g. 23514, 42501). Anything else is the network. */
export function isDataError(e: DbError): boolean {
  return !!e && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code);
}

export class OfflineError extends Error {}

/**
 * Upload rows in batches. If a batch is refused because of bad data, retry it one row at a time
 * so a single bad row can't block everything forever (Kenshin M2).
 * Returns ids that reached the server and ids the server will never accept.
 */
export async function pushWithFallback<T extends { id: string }>(
  rows: T[],
  send: (batch: T[]) => Promise<DbError>,
  batchSize = 200,
): Promise<{ sent: string[]; rejected: string[] }> {
  const sent: string[] = [];
  const rejected: string[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const err = await send(batch);
    if (!err) {
      sent.push(...batch.map((r) => r.id));
      continue;
    }
    if (!isDataError(err)) throw new OfflineError(err.message ?? 'offline');
    for (const row of batch) {
      const e = await send([row]);
      if (!e) sent.push(row.id);
      else if (isDataError(e)) rejected.push(row.id);
      else throw new OfflineError(e.message ?? 'offline');
    }
  }
  return { sent, rejected };
}
