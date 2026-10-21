// Reminders on this phone (SPEC 6): the decisions only, no browser calls, so the node tests cover them.

export type PushState =
  | 'unsupported' // this browser has no Web Push
  | 'ios-home' // iPhone/iPad in a Safari tab: push only works from the Home Screen app
  | 'blocked' // the person (or the phone) said no; only their settings can undo it
  | 'off' // can be turned on with a tap
  | 'on'; // permission granted and this phone is subscribed

export type Env = {
  hasPush: boolean; // 'PushManager' in window && serviceWorker && Notification
  permission: 'default' | 'granted' | 'denied' | 'unknown';
  subscribed: boolean;
  ua: string;
  standalone: boolean; // opened from the Home Screen
};

export const isAppleMobile = (ua: string) => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));

export function pushState(e: Env): PushState {
  if (isAppleMobile(e.ua) && !e.standalone) return 'ios-home';
  if (!e.hasPush || e.permission === 'unknown') return 'unsupported';
  if (e.permission === 'denied') return 'blocked';
  return e.permission === 'granted' && e.subscribed ? 'on' : 'off';
}

export const STATE_TEXT: Record<PushState, string> = {
  unsupported: 'This browser can’t show reminders. Overdue items still show at the top of Home.',
  'ios-home': 'On iPhone, reminders work only from the Home Screen app: tap Share, then Add to Home Screen, then open Patas from there.',
  blocked: 'Notifications are blocked for Patas. Allow them in your browser or phone settings, then come back here.',
  off: 'Reminders are off on this phone.',
  on: 'Reminders are on for this phone.',
};

export const REMINDER_TIMES = ['07:00', '08:00', '09:00', '12:00', '18:00', '20:00'] as const;

/** "08:00:00" or "08:00" from the database -> "08:00"; anything else -> null. */
export function hhmm(v: unknown): string | null {
  const m = typeof v === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(v) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}

/** "08:00" -> "8:00 AM" */
export function timeLabel(v: string): string {
  const [h = 0, m = 0] = v.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Same allow-list as the database and the sender (SECURITY_DESIGN, Kenshin F8).
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\/[^\s\x00-\x1f]+$/;
const KEY = /^[A-Za-z0-9_-]+$/;

/** A browser subscription (its toJSON()) as a row, or null if it is not one Patas would send to. */
export function subscriptionRow(json: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, id: string, deviceHint: string) {
  const endpoint = typeof json.endpoint === 'string' ? json.endpoint : '';
  const p256dh = typeof json.keys?.p256dh === 'string' ? json.keys.p256dh.replace(/=+$/, '') : '';
  const auth = typeof json.keys?.auth === 'string' ? json.keys.auth.replace(/=+$/, '') : '';
  if (endpoint.length > 1000 || !PUSH_HOST.test(endpoint)) return null;
  if (!KEY.test(p256dh) || p256dh.length < 40 || p256dh.length > 200 || !KEY.test(auth) || auth.length < 10 || auth.length > 100) return null;
  return { id, endpoint, p256dh, auth_secret: auth, device_hint: deviceHint, deleted: false };
}

/** A short, generic label for the phone (never the browser version or model). */
export function deviceHint(ua: string): string {
  if (isAppleMobile(ua)) return 'iPhone or iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'Mac';
  return 'Other';
}

/** The browser wants the public key as bytes. */
export function keyBytes(b64u: string): Uint8Array {
  const t = b64u.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

/** The row id for one subscription: a hash of its address, so the same phone always maps to one row. */
export async function subscriptionId(endpoint: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  let s = '';
  for (const x of h.slice(0, 15)) s += String.fromCharCode(x);
  return 'ps_' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function testResultText(r: { sent?: number; gone?: number; failed?: number; phones?: number; error?: string }): string {
  if (r.error === 'wait') return 'A test was sent a moment ago. Wait two minutes, then try again.';
  if (r.error) return 'Could not send a test. Check your internet and try again.';
  if (!r.phones) return 'No phone is set up for reminders yet. Turn them on first.';
  if (r.sent) return `Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}. It should arrive within a minute.`;
  if (r.gone) return 'This phone’s reminder link had expired. Turn reminders on again.';
  return 'The phone’s push service did not accept it. Try again later.';
}
