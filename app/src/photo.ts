// Round 4 photos, the pure parts (tested in Node): row ids, server-row checks, the 256 px square JPEG.
export type PhotoRow = { id: string; person_key: string; storage_path: string; created_at: number; deleted: boolean };

/** The row id of a person's photo: fixed by their name, so one name has one photo (the server checks the same sum). */
export async function photoIdFor(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'p-' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Server rows are untrusted: keep only what is expected for this account. */
export function photoFromServer(r: Record<string, unknown>, uid: string): PhotoRow | null {
  const id = typeof r.id === 'string' ? r.id : '';
  if (!(id === 'me' || /^p-[0-9a-f]{16}$/.test(id)) || r.storage_path !== `${uid}/${id}.jpg`) return null;
  const key = typeof r.person_key === 'string' ? r.person_key : '';
  if ((id === 'me') !== (key === '')) return null;
  return { id, person_key: key, storage_path: `${uid}/${id}.jpg`, created_at: typeof r.created_at === 'number' ? r.created_at : 0, deleted: r.deleted === true };
}

/** A picked picture to a centred 256 px square JPEG. Lowers the quality until it fits well under the 64 KB limit. */
export async function squareJpeg(file: Blob, size = 256): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return null;
  }
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close?.();
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= 60_000) return blob;
  }
  return null;
}
