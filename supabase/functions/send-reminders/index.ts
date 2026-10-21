// Sends phone reminders (SPEC 6, Phase 6f). Three calls, all POST:
//  {"mode":"cron"}  from the 15-minute schedule (migration 0006), with the cron secret in x-patas-cron.
//                   The database decides who gets a digest and claims it (once a day per person).
//  {"mode":"test"}  "Send test reminder" in Settings: the caller's own phones only, once per 2 minutes.
//  {"mode":"keys"}  a signed-in person turning reminders on: makes the push keys on first use and
//                   answers with the PUBLIC key only.
// Rules (Kenshin's 6f conditions): push hosts re-checked in code, no redirects, counts-only words, one
// person's failure never stops the others, nothing about a person (address, words) is ever logged.
// Deployed with verify_jwt off: every mode checks its own caller (secret, or the person's token).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'; // pinned, same as the app (Kenshin audit L-6)
import { newSenderKeys, send, unb64u, type SenderKeys, type Sub } from './webpush.ts';

// Who to contact about this sender, as push services ask (RFC 8292). The app's address, not a person.
const SUBJECT = 'https://patas-fawn.vercel.app'; // the public address (go-live 2026-10-21)
const OPEN_URL = SUBJECT + '/';

const cors = {
  'Access-Control-Allow-Origin': '*', // safe: every call needs a secret or the caller's own token
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
type Admin = ReturnType<typeof admin>;

// Declarative Web Push shape (iOS 18.4+ shows it by itself); the service worker reads the same JSON.
const message = (body: string) => ({ web_push: 8030, notification: { title: 'Patas', body, navigate: OPEN_URL, lang: 'en-PH', dir: 'ltr' } });

/** The push keys, made once (insert-only in the database, so a race keeps the first pair). */
async function keys(db: Admin): Promise<SenderKeys & { publicB64: string }> {
  let { data } = await db.rpc('reminder_vapid');
  if (!data?.public) {
    const k = await newSenderKeys();
    await db.rpc('reminder_vapid_init', { p_public: k.publicB64, p_private: k.privateJson });
    ({ data } = await db.rpc('reminder_vapid'));
  }
  if (!data?.public || !data?.private) throw new Error('no keys');
  return { privateJwk: JSON.parse(data.private), publicRaw: unb64u(data.public), publicB64: data.public };
}

async function deliver(db: Admin, k: SenderKeys, userId: string, subs: Sub[], body: string) {
  let sent = 0, gone = 0, failed = 0;
  for (const s of subs) {
    const r = await send(s, message(body), k, SUBJECT);
    if (r === 'sent') sent++;
    else if (r === 'gone') { gone++; await db.rpc('reminder_gone', { p_user: userId, p_id: s.id }); }
    else failed++;
  }
  return { sent, gone, failed };
}

// The project's public (anon) key: the app sends it on every call; the environment's copy is the fallback
// (Kenshin audit L-5: newer projects may not set SUPABASE_ANON_KEY).
const anonKey = (req: Request) => req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';

async function signedIn(req: Request, db: Admin) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user || data.user.is_anonymous) return null;
  return { user: data.user, token };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  let mode = '';
  try { mode = String((await req.json())?.mode ?? ''); } catch { /* handled below */ }
  const db = admin();

  try {
    if (mode === 'cron') {
      const secret = req.headers.get('x-patas-cron') ?? '';
      const { data, error } = await db.rpc('reminder_batch', { p_secret: secret });
      if (error) return reply(500, { error: 'batch_failed' });
      if (data?.result !== 'ok') return reply(403, { error: 'refused' });
      const digests = (data.digests ?? []) as { user_id: string; body: string; subs: Sub[] }[];
      if (!digests.length) return reply(200, { people: 0 });
      const k = await keys(db);
      const total = { people: digests.length, sent: 0, gone: 0, failed: 0, errors: 0 };
      for (const d of digests) {
        try { // one person's trouble never stops the others
          const r = await deliver(db, k, d.user_id, d.subs, d.body);
          total.sent += r.sent; total.gone += r.gone; total.failed += r.failed;
        } catch { total.errors++; }
      }
      console.log(JSON.stringify({ mode, ...total })); // counts only
      return reply(200, total);
    }

    if (mode === 'test' || mode === 'keys') {
      const who = await signedIn(req, db);
      if (!who) return reply(401, { error: 'not_logged_in' });
      const k = await keys(db);
      if (mode === 'keys') return reply(200, { publicKey: k.publicB64 });
      // Claim as the person (their own token), so the database applies their own rules and limit.
      const asUser = createClient(Deno.env.get('SUPABASE_URL')!, anonKey(req), {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${who.token}` } },
      });
      const { data, error } = await asUser.rpc('reminder_test_claim');
      if (error) return reply(500, { error: 'claim_failed' });
      if (data?.result === 'wait') return reply(429, { error: 'wait' });
      if (data?.result !== 'ok') return reply(403, { error: 'refused' });
      const subs = (data.subs ?? []) as Sub[];
      if (!subs.length) return reply(200, { sent: 0, gone: 0, failed: 0, phones: 0 });
      const r = await deliver(db, k, who.user.id, subs, 'Test reminder. Reminders work on this phone.');
      return reply(200, { ...r, phones: subs.length });
    }
    return reply(400, { error: 'unknown_mode' });
  } catch {
    return reply(500, { error: 'failed' });
  }
});
