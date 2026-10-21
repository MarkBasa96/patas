// Reminders on this phone: permission, the browser's push subscription, and the person's reminder
// settings. Decisions live in pushLogic.ts (tested); this file only talks to the browser and Supabase.
import { Platform } from 'react-native';

import { deviceHint, hhmm, keyBytes, pushState, subscriptionId, subscriptionRow, type PushState } from './pushLogic';
import { supabase } from './supabase';

const web = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';
const hasPush = () => web() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!hasPush()) return null;
  try {
    // The worker is registered on load in App.tsx; a dev build has none, so don't wait forever.
    return (await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))])) ?? null;
  } catch {
    return null;
  }
}

async function currentSub(): Promise<PushSubscription | null> {
  const reg = await registration();
  try {
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

export async function stateHere(): Promise<PushState> {
  const standalone = web() && ((navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true);
  const permission = hasPush() ? (Notification.permission as 'default' | 'granted' | 'denied') : 'unknown';
  const subscribed = permission === 'granted' && !!(await currentSub());
  return pushState({ hasPush: hasPush(), permission, subscribed, ua: web() ? navigator.userAgent : '', standalone });
}

async function publicKey(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc('reminder_public_key');
  if (typeof data === 'string' && data) return data;
  // First person ever to turn reminders on: the sender makes the keys and returns the public half.
  const { data: made, error } = await supabase.functions.invoke('send-reminders', { body: { mode: 'keys' } });
  return !error && typeof made?.publicKey === 'string' ? made.publicKey : null;
}

async function saveRow(sub: PushSubscription): Promise<boolean> {
  if (!supabase) return false;
  const row = subscriptionRow(sub.toJSON() as never, await subscriptionId(sub.endpoint), deviceHint(navigator.userAgent));
  if (!row) return false;
  const { error } = await supabase.from('push_subscriptions').upsert({ ...row, created_at: Date.now() }, { onConflict: 'user_id,id' });
  return !error;
}

export type TurnOn = 'on' | 'blocked' | 'unsupported' | 'no-keys' | 'failed';

/** Must run from a tap (iPhone refuses a permission prompt that isn't). */
export async function turnOnHere(): Promise<TurnOn> {
  if (!hasPush()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'failed';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const key = await publicKey();
  if (!key) return 'no-keys';
  try {
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another key can't receive our pushes: replace it.
    const old = sub?.options?.applicationServerKey;
    if (sub && old && btoa(String.fromCharCode(...new Uint8Array(old))) !== btoa(String.fromCharCode(...keyBytes(key)))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub = sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
    await saveTimeZone();
    return (await saveRow(sub)) ? 'on' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Stop this phone's reminders: tell the server first (while still signed in), then the browser. */
export async function turnOffHere(): Promise<void> {
  const sub = await currentSub();
  if (!sub) return;
  if (supabase) {
    try {
      await supabase.from('push_subscriptions').update({ deleted: true }).eq('id', await subscriptionId(sub.endpoint));
    } catch {
      /* offline: the browser side still stops below; the server marks it gone on the next failed send */
    }
  }
  try {
    await sub.unsubscribe();
  } catch {
    /* already gone */
  }
}

/** On every open: iPhone can drop a subscription silently, so re-save it while permission holds. */
export async function refreshHere(): Promise<void> {
  if (!hasPush() || Notification.permission !== 'granted') return;
  const sub = await currentSub();
  if (sub) await saveRow(sub);
}

export async function sendTest(): Promise<{ sent?: number; gone?: number; failed?: number; phones?: number; error?: string }> {
  if (!supabase) return { error: 'offline' };
  const { data, error } = await supabase.functions.invoke('send-reminders', { body: { mode: 'test' } });
  if (error) {
    try {
      const ctx = (error as { context?: Response }).context;
      return { error: ctx ? String(((await ctx.json()) as { error?: unknown }).error ?? 'failed') : 'failed' };
    } catch {
      return { error: 'failed' };
    }
  }
  return data ?? { error: 'failed' };
}

export type ReminderPrefs = { on: boolean; at: string };

export async function loadPrefs(): Promise<ReminderPrefs | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('user_settings').select('reminders_on,reminder_at').limit(1);
  if (error) return null;
  const r = data[0] as { reminders_on?: unknown; reminder_at?: unknown } | undefined;
  return { on: r ? r.reminders_on !== false : true, at: (r && hhmm(r.reminder_at)) || '08:00' };
}

export async function savePrefs(uid: string, p: Partial<ReminderPrefs>): Promise<boolean> {
  if (!supabase) return false;
  const patch: Record<string, unknown> = { user_id: uid };
  if (p.on !== undefined) patch.reminders_on = p.on;
  if (p.at !== undefined) patch.reminder_at = p.at;
  const { error } = await supabase.from('user_settings').upsert(patch, { onConflict: 'user_id' });
  return !error;
}

/** The digest goes out at the person's time in the phone's own time zone. */
async function saveTimeZone(): Promise<void> {
  if (!supabase) return;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = await supabase.auth.getUser();
  if (!tz || !data.user) return;
  await supabase.from('user_settings').upsert({ user_id: data.user.id, time_zone: tz }, { onConflict: 'user_id' });
}
