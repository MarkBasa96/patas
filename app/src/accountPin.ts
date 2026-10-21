import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_TRIES, STALE_MS, type ServerStatus } from './mpinLogic';
import { supabase } from './supabase';

// One MPIN per account (Gastos v3, Kenshin's v3 review Part 1). The server decides whenever there is a
// network; this phone keeps a PBKDF2 copy (the "verifier") only so it can unlock offline.

const VERIFIER_KEY = 'patas.mpin.verifier.v1';
const KNOWN_KEY = 'patas.mpin.known.v1'; // what the server last said: {uid, enabled, epoch}
const ITERATIONS = 100_000;

type Verifier = { v: 1; uid: string; epoch: string; salt: string; iter: number; hash: string; fails: number; lockedOut: boolean; checkedAt: number };
type Known = { uid: string; enabled: boolean; epoch: string | null };

const b64e = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const b64d = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const pinSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, 256));
}
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

async function loadVerifier(uid: string): Promise<Verifier | null> {
  try {
    const r = JSON.parse((await AsyncStorage.getItem(VERIFIER_KEY)) || 'null') as Verifier | null;
    return r && r.v === 1 && r.uid === uid && typeof r.hash === 'string' && typeof r.epoch === 'string' ? r : null;
  } catch {
    return null;
  }
}
const saveVerifier = (r: Verifier) => AsyncStorage.setItem(VERIFIER_KEY, JSON.stringify(r)).catch(() => {});

export async function localView(uid: string): Promise<{ verifier: { epoch: string; lockedOut: boolean; checkedAt: number } | null; knownEnabled: boolean }> {
  const v = await loadVerifier(uid);
  let k: Known | null = null;
  try { k = JSON.parse((await AsyncStorage.getItem(KNOWN_KEY)) || 'null') as Known | null; } catch { /* none */ }
  return { verifier: v ? { epoch: v.epoch, lockedOut: v.lockedOut, checkedAt: v.checkedAt } : null, knownEnabled: !!(k && k.uid === uid && k.enabled) };
}

export const saveKnown = (k: Known) => AsyncStorage.setItem(KNOWN_KEY, JSON.stringify(k)).catch(() => {});

/** Written ONLY with digits the server just accepted (Kenshin 1.4 rule 1). */
export async function writeVerifier(pin: string, uid: string, epoch: string): Promise<void> {
  if (!pinSupported()) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  await saveVerifier({ v: 1, uid, epoch, salt: b64e(salt), iter: ITERATIONS, hash: b64e(hash), fails: 0, lockedOut: false, checkedAt: Date.now() });
}

export const dropVerifier = () => AsyncStorage.removeItem(VERIFIER_KEY).catch(() => {});

export async function clearPinHere(): Promise<void> {
  await AsyncStorage.multiRemove([VERIFIER_KEY, KNOWN_KEY]).catch(() => {});
}

export async function markLockedOut(uid: string): Promise<void> {
  const r = await loadVerifier(uid);
  if (r) await saveVerifier({ ...r, lockedOut: true });
}

/** Offline check. Count first, then compare (a killed app can't undo a guess). */
export async function localCheck(pin: string, uid: string): Promise<'ok' | 'wrong' | 'locked' | 'stale' | 'none'> {
  const r = await loadVerifier(uid);
  if (!r) return 'none';
  if (r.lockedOut) return 'locked';
  if (Date.now() - r.checkedAt > STALE_MS) return 'stale';
  r.fails += 1;
  await saveVerifier(r);
  if (same(await derive(pin, b64d(r.salt), r.iter), b64d(r.hash))) {
    await saveVerifier({ ...r, fails: r.fails - 1 }); // keep earlier wrong tries: they still go to the server
    return 'ok';
  }
  if (r.fails >= MAX_TRIES) {
    await saveVerifier({ ...r, lockedOut: true });
    return 'locked';
  }
  return 'wrong';
}

// ---------------- server calls (POST body, never the URL: Kenshin L2) ----------------

export type ServerResult = { result: string; epoch?: string | null; tries_left?: number };

async function rpc(name: string, args: Record<string, unknown>, timeoutMs = 4000): Promise<ServerResult | 'network'> {
  if (!supabase) return 'network';
  try {
    const call = supabase.rpc(name, args);
    const timed = new Promise<'network'>((resolve) => setTimeout(() => resolve('network'), timeoutMs));
    const r = await Promise.race([call, timed]);
    if (r === 'network') return 'network';
    const { data, error } = r as { data: unknown; error: { message?: string } | null };
    if (error) return /fetch|network|Failed to|timeout/i.test(error.message ?? '') ? 'network' : { result: 'error' };
    return (data ?? { result: 'error' }) as ServerResult;
  } catch {
    return 'network';
  }
}

export async function pinStatus(timeoutMs = 3000): Promise<ServerStatus | 'network'> {
  const r = await rpc('pin_status', {}, timeoutMs);
  if (r === 'network' || typeof (r as Partial<ServerStatus>).enabled !== 'boolean') return 'network';
  return r as unknown as ServerStatus;
}
export const pinVerify = (pin: string) => rpc('pin_verify', { p_pin: pin });
export const pinClaim = (pin: string) => rpc('pin_claim', { p_pin: pin });
export const pinChange = (oldPin: string, newPin: string) => rpc('pin_change', { p_old: oldPin, p_new: newPin });
export const pinDisable = (pin: string) => rpc('pin_disable', { p_pin: pin });
export const pinResetWithCode = (pin: string) => rpc('pin_reset_with_code', { p_new: pin });

/** After an online check: send the offline wrong tries up, then zero them here. */
export async function flushOfflineFails(uid: string): Promise<void> {
  const r = await loadVerifier(uid);
  if (!r || r.fails < 1) return;
  const res = await rpc('pin_report_offline_fails', { p_n: r.fails });
  if (res !== 'network') await saveVerifier({ ...r, fails: 0 });
}
