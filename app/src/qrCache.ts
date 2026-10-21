// The offline copy of QR pictures: IndexedDB on this phone, tagged with the account it belongs to.
// Wiped on sign-out and on account deletion. Never the HTTP cache (downloads use cache: 'no-store').
const DB = 'patas-qr';
const STORE = 'img';

type Entry = { key: string; uid: string; id: string; blob: Blob };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : null); };
          tx.onerror = () => { db.close(); resolve(null); };
        } catch {
          db.close();
          resolve(null);
        }
      }),
  );
}

export async function cacheGet(uid: string, id: string): Promise<Blob | null> {
  const e = await run<Entry | undefined>('readonly', (s) => s.get(`${uid}:${id}`));
  return e && e.uid === uid && e.id === id && e.blob instanceof Blob ? e.blob : null; // another account's copy is never used
}
export async function cachePut(uid: string, id: string, blob: Blob): Promise<void> {
  await run('readwrite', (s) => s.put({ key: `${uid}:${id}`, uid, id, blob } satisfies Entry));
}
export async function cacheDrop(uid: string, id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(`${uid}:${id}`));
}
/** Sign-out and account deletion: every cached QR on this phone, whoever it belonged to. */
export async function cacheClearAll(): Promise<void> {
  await run('readwrite', (s) => s.clear());
}
export async function cacheCount(): Promise<number> {
  return (await run<number>('readonly', (s) => s.count())) ?? 0;
}
