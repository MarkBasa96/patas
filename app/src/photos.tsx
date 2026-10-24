// Round 4: photos. Your own ("me") and one per person you owe ("p-" + 16 hex of sha256 of their name key).
// Same walls as QR files (migration 0007): a private bucket, your own folder, no shareable links, a file only where a
// live row says. Pictures are cropped to a 256 px square JPEG on the phone (~20 KB; the bucket takes 64 KB at most),
// downloaded with your login and kept in this phone's IndexedDB for offline (wiped on sign-out with the QR copies).
// Adding, changing and removing need a connection, like QR codes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { personKey } from './insights';
import { photoRowsKey as rowsKey } from './keys';
import { photoFromServer, photoIdFor, squareJpeg, type PhotoRow } from './photo';
import { cacheDrop, cacheGet, cachePut } from './qrCache';
import { supabase } from './supabase';

export type { PhotoRow } from './photo';
/** Cache entries share the QR cache (one wipe on sign-out); the prefix keeps them apart. */
const cacheId = (id: string) => `photo:${id}`;
const OFFLINE = 'You’re offline. This needs a connection; nothing was changed.';

type Target = 'me' | { person: string };
type PhotoStore = {
  /** An object URL for 'me' or a person's name, if they have a photo. */
  urlFor: (who: Target) => string | undefined;
  set: (who: Target, picked: Blob) => Promise<string | null>;
  remove: (who: Target) => Promise<string | null>;
};

const Ctx = createContext<PhotoStore | null>(null);

export function PhotoProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  // False once unmounted (sign-out): a late download or row save must not write back after the wipe (Kenshin M-1).
  const aliveRef = useRef(true);

  const showBlob = useCallback((id: string, blob: Blob | null) => {
    const old = urlsRef.current[id];
    if (old) URL.revokeObjectURL(old);
    const next = { ...urlsRef.current };
    if (blob) next[id] = URL.createObjectURL(blob);
    else delete next[id];
    urlsRef.current = next;
    setUrls(next);
  }, []);

  const keep = useCallback(
    (list: PhotoRow[]) => {
      const live = list.filter((r) => !r.deleted);
      if (!aliveRef.current) return live;
      setRows(live);
      void AsyncStorage.setItem(rowsKey(userId), JSON.stringify(live)).catch(() => undefined);
      return live;
    },
    [userId],
  );

  /** Pictures: the cached copy first (instant, offline), then a fresh download when online. */
  const loadPictures = useCallback(
    async (live: PhotoRow[], online: boolean) => {
      for (const r of live) {
        if (!aliveRef.current) return;
        const cached = await cacheGet(userId, cacheId(r.id));
        if (cached && !urlsRef.current[r.id]) showBlob(r.id, cached);
        if (online && supabase) {
          const { data } = await supabase.storage.from('photos').download(r.storage_path);
          if (data && data.type === 'image/jpeg' && aliveRef.current) {
            await cachePut(userId, cacheId(r.id), data);
            showBlob(r.id, data);
          }
        }
      }
      for (const id of Object.keys(urlsRef.current)) if (!live.some((r) => r.id === id)) showBlob(id, null);
    },
    [userId, showBlob],
  );

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('photos').select('id,person_key,storage_path,created_at,deleted').eq('deleted', false).limit(400);
    if (error || !data) return;
    const live = keep((data as Record<string, unknown>[]).map((r) => photoFromServer(r, userId)).filter((r): r is PhotoRow => r !== null));
    await loadPictures(live, true);
  }, [keep, loadPictures, userId]);

  useEffect(() => {
    let alive = true;
    aliveRef.current = true;
    void AsyncStorage.getItem(rowsKey(userId))
      .then(async (raw) => {
        if (!alive || !raw) return;
        const live = keep((JSON.parse(raw) as Record<string, unknown>[]).map((r) => photoFromServer(r, userId)).filter((r): r is PhotoRow => r !== null));
        await loadPictures(live, false);
      })
      .catch(() => undefined)
      .finally(() => void refresh());
    return () => {
      alive = false;
      aliveRef.current = false;
      for (const u of Object.values(urlsRef.current)) URL.revokeObjectURL(u);
      urlsRef.current = {};
    };
  }, [userId, keep, loadPictures, refresh]);

  const idOf = useCallback(async (who: Target): Promise<{ id: string; key: string } | null> => {
    if (who === 'me') return { id: 'me', key: '' };
    const key = personKey(who.person);
    return key ? { id: await photoIdFor(key), key } : null;
  }, []);

  // Person photo ids are known only after hashing; keep a name -> id map in step with the rows.
  const byKey = useMemo(() => new Map(rows.map((r) => [r.person_key, r.id] as const)), [rows]);
  const urlFor = useCallback<PhotoStore['urlFor']>(
    (who) => {
      const id = who === 'me' ? 'me' : byKey.get(personKey(who.person));
      return id ? urls[id] : undefined;
    },
    [byKey, urls],
  );

  const set = useCallback<PhotoStore['set']>(
    async (who, picked) => {
      if (!supabase) return OFFLINE;
      const target = await idOf(who);
      if (!target) return 'Give the person a name first.';
      const jpeg = await squareJpeg(picked);
      if (!jpeg) return 'Patas could not read that picture. Try a JPEG or PNG photo.';
      const path = `${userId}/${target.id}.jpg`;
      const existed = rows.some((r) => r.id === target.id);
      const row = { user_id: userId, id: target.id, person_key: target.key, storage_path: path, created_at: Date.now(), deleted: false };
      const ins = await supabase.from('photos').upsert(row, { onConflict: 'user_id,id' });
      if (ins.error) return ins.error.code === '54000' ? 'You have reached the limit of saved photos.' : ins.error.code ? 'The server refused this photo. Nothing was saved.' : OFFLINE;
      const up = await supabase.storage.from('photos').upload(path, jpeg, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' });
      if (up.error) {
        if (!existed) await supabase.from('photos').update({ deleted: true }).eq('id', target.id); // no row without its file
        return 'The photo did not upload. Check your connection and try again.';
      }
      await cachePut(userId, cacheId(target.id), jpeg);
      showBlob(target.id, jpeg);
      await refresh();
      return null;
    },
    [idOf, rows, userId, showBlob, refresh],
  );

  const remove = useCallback<PhotoStore['remove']>(
    async (who) => {
      if (!supabase) return OFFLINE;
      const target = await idOf(who);
      if (!target) return null;
      // File first, checked (Kenshin round 4 L-1/L-7): a removed photo must not stay on the server. If the row
      // update then fails, the row is live with no file: it shows nothing and Remove can be tried again.
      const rm = await supabase.storage.from('photos').remove([`${userId}/${target.id}.jpg`]);
      if (rm.error) return OFFLINE;
      const { error } = await supabase.from('photos').update({ deleted: true }).eq('id', target.id);
      if (error) return error.code ? 'The server refused this change. Try again.' : OFFLINE;
      await cacheDrop(userId, cacheId(target.id));
      showBlob(target.id, null);
      await refresh();
      return null;
    },
    [idOf, userId, showBlob, refresh],
  );

  const value = useMemo<PhotoStore>(() => ({ urlFor, set, remove }), [urlFor, set, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePhotos(): PhotoStore {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePhotos must be used inside PhotoProvider');
  return c;
}

/** Opens the phone's picture picker (web). Null when nothing was picked. */
export function pickImage(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
