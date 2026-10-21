// The QR gallery's data: rows from the server (kept on the phone for offline listing) and pictures
// (downloaded with the owner's login, checked against the saved fingerprint, cached in IndexedDB).
// Adding, replacing and removing need a connection: a QR picture has to reach the server to be useful.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { newId } from './ids';
import { isWallet, matches, qrFingerprint, type QrForm, type QrRow } from './qr';
import { cacheDrop, cacheGet, cachePut } from './qrCache';
import { decodeQr } from './qrDecode';
import { supabase } from './supabase';

const COLS = 'id,label,wallet,account_name,storage_path,payload_sha256,added_at,last_copy_saved_at,replaces_id,old_copy_saved_at,created_at,deleted';
export const qrRowsKey = (uid: string) => `patas.qr.v1.${uid}`;

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);

// Server rows are untrusted: keep only what is expected.
function fromServer(r: Record<string, unknown>, uid: string): QrRow | null {
  const id = str(r.id);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || str(r.storage_path) !== `${uid}/${id}.png` || !/^[0-9a-f]{64}$/.test(str(r.payload_sha256))) return null;
  return {
    id, label: str(r.label), wallet: isWallet(r.wallet) ? r.wallet : 'other', account_name: str(r.account_name), storage_path: str(r.storage_path),
    payload_sha256: str(r.payload_sha256), added_at: str(r.added_at), last_copy_saved_at: strOrNull(r.last_copy_saved_at), replaces_id: strOrNull(r.replaces_id),
    old_copy_saved_at: strOrNull(r.old_copy_saved_at), created_at: typeof r.created_at === 'number' ? r.created_at : 0, deleted: r.deleted === true,
  };
}

export type Picture = { blob: Blob; text: string; fromCache: boolean } | { problem: 'mismatch' | 'offline' | 'missing' };

type QrStore = {
  qrs: QrRow[];
  status: 'loading' | 'ready' | 'offline';
  refresh: () => Promise<void>;
  /** Saves a new QR (row, then picture). Returns its id, or a message. */
  add: (form: QrForm, png: Blob, text: string, replaces?: QrRow) => Promise<{ id: string } | { error: string }>;
  update: (id: string, patch: Pick<QrRow, 'label' | 'account_name' | 'wallet'>) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  copySaved: (id: string) => Promise<void>;
  picture: (row: QrRow) => Promise<Picture>;
};

const Ctx = createContext<QrStore | null>(null);
const OFFLINE = 'You’re offline. This needs a connection; nothing was changed.';
/** The server needs a label; the form makes it optional, so a blank one becomes the account name. */
const labelOrName = (label: string, account: string) => (label.trim() || account.trim()).slice(0, 40);
/** Say what really happened: only a network failure (no code) is "offline". */
function saveError(code: string | undefined): string {
  if (code === '54000') return 'You have reached the limit of 30 saved QR codes.';
  if (code === '23514' || code === '22001') return 'Patas could not accept one of the fields. Use plain letters and numbers in the name and label.';
  if (code) return 'The server refused this change. Nothing was saved.';
  return OFFLINE;
}

export function QrProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [qrs, setQrs] = useState<QrRow[]>([]);
  const [status, setStatus] = useState<QrStore['status']>('loading');
  const ref = useRef<QrRow[]>([]);

  const keep = useCallback(
    (rows: QrRow[]) => {
      const live = rows.filter((r) => !r.deleted).sort((a, b) => a.created_at - b.created_at);
      ref.current = live;
      setQrs(live);
      void AsyncStorage.setItem(qrRowsKey(userId), JSON.stringify(live)).catch(() => undefined);
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    if (!supabase) return setStatus('offline');
    const { data, error } = await supabase.from('qr_items').select(COLS).eq('deleted', false).order('created_at').limit(100);
    if (error || !data) return setStatus('offline');
    keep((data as Record<string, unknown>[]).map((r) => fromServer(r, userId)).filter((r): r is QrRow => r !== null));
    setStatus('ready');
  }, [keep, userId]);

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(qrRowsKey(userId))
      .then((raw) => {
        if (!alive || !raw) return;
        const rows = (JSON.parse(raw) as Record<string, unknown>[]).map((r) => fromServer(r, userId)).filter((r): r is QrRow => r !== null);
        if (!ref.current.length) keep(rows);
      })
      .catch(() => undefined)
      .finally(() => void refresh());
    return () => {
      alive = false;
    };
  }, [userId, keep, refresh]);

  const add = useCallback<QrStore['add']>(
    async (form, png, text, replaces) => {
      if (!supabase) return { error: OFFLINE };
      const id = newId();
      const path = `${userId}/${id}.png`;
      const row = {
        user_id: userId, id, label: labelOrName(form.label, form.account), wallet: form.wallet, account_name: form.account.trim(), storage_path: path,
        payload_sha256: await qrFingerprint(userId, id, text), created_at: Date.now(), replaces_id: replaces ? replaces.id : null,
      };
      const ins = await supabase.from('qr_items').insert(row);
      if (ins.error) return { error: saveError(ins.error.code) };
      const up = await supabase.storage.from('qr').upload(path, png, { contentType: 'image/png', upsert: false, cacheControl: '0' });
      if (up.error) {
        await supabase.from('qr_items').update({ deleted: true }).eq('id', id); // no half-saved QR left behind
        return { error: 'The picture did not upload. Check your connection and try again. Nothing was saved.' };
      }
      await cachePut(userId, id, png);
      await refresh();
      return { id };
    },
    [userId, refresh],
  );

  const update = useCallback<QrStore['update']>(
    async (id, patch) => {
      if (!supabase) return OFFLINE;
      const { error } = await supabase.from('qr_items').update({ label: labelOrName(patch.label, patch.account_name), account_name: patch.account_name.trim(), wallet: patch.wallet }).eq('id', id);
      if (error) return saveError(error.code);
      await refresh();
      return null;
    },
    [refresh],
  );

  const remove = useCallback<QrStore['remove']>(
    async (id) => {
      if (!supabase) return OFFLINE;
      const row = ref.current.find((r) => r.id === id);
      const { error } = await supabase.from('qr_items').update({ deleted: true }).eq('id', id);
      if (error) return OFFLINE;
      // The picture can only be removed once its row is no longer live (swap protection).
      if (row) await supabase.storage.from('qr').remove([row.storage_path]);
      await cacheDrop(userId, id);
      await refresh();
      return null;
    },
    [userId, refresh],
  );

  const copySaved = useCallback(
    async (id: string) => {
      if (!supabase) return;
      // Any value works: the server replaces it with its own clock (migration 0004).
      await supabase.from('qr_items').update({ last_copy_saved_at: new Date().toISOString() }).eq('id', id);
      await refresh();
    },
    [refresh],
  );

  const picture = useCallback<QrStore['picture']>(
    async (row) => {
      // Fresh from the server when online, so a changed file is noticed at once; the cached copy otherwise.
      if (supabase) {
        const { data } = await supabase.storage.from('qr').download(row.storage_path);
        if (data) {
          const got = await decodeQr(data);
          if (got && (await matches(userId, row, got.text))) {
            await cachePut(userId, row.id, data);
            return { blob: data, text: got.text, fromCache: false };
          }
          return { problem: 'mismatch' };
        }
      }
      const cached = await cacheGet(userId, row.id);
      if (!cached) return { problem: 'offline' };
      const got = await decodeQr(cached);
      return got && (await matches(userId, row, got.text)) ? { blob: cached, text: got.text, fromCache: true } : { problem: 'mismatch' };
    },
    [userId],
  );

  const value = useMemo<QrStore>(() => ({ qrs, status, refresh, add, update, remove, copySaved, picture }), [qrs, status, refresh, add, update, remove, copySaved, picture]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQrs(): QrStore {
  const c = useContext(Ctx);
  if (!c) throw new Error('useQrs must be used inside QrProvider');
  return c;
}
