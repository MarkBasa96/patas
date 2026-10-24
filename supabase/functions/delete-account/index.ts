// Deletes the caller's whole account: their QR and photo files, then the user (every row follows by cascade).
// Rules (docs/SECURITY_DESIGN.md, "Who does what"):
//  - the caller must be logged in (a valid access token), not anonymous;
//  - the sign-in must be recent (last 10 minutes), so a stolen old session cannot wipe an account;
//  - the body must say {"confirm":"DELETE"}, so a stray request cannot do it;
//  - the service key is read from the function's own environment and never leaves it.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'; // pinned, same as send-reminders (Kenshin L-6)

const RECENT_MS = 10 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*', // safe: every call needs the caller's own access token
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'not_logged_in' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return reply(401, { error: 'not_logged_in' });
  if (user.is_anonymous) return reply(403, { error: 'not_allowed' });

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  if (body.confirm !== 'DELETE') return reply(400, { error: 'confirmation_required' });

  const last = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  if (!last || Date.now() - last > RECENT_MS) return reply(403, { error: 'recent_login_required' });

  // 1. The person's QR and photo files, through the Storage API (rows cascade, files do not).
  //    The user is deleted only once both folders are proven empty, so a failure here can be retried (Kenshin M-1).
  for (const bucket of ['qr', 'photos'] as const) {
    for (let guard = 0; guard < 50; guard++) {
      const { data: files, error: listErr } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
      if (listErr) return reply(500, { error: 'could_not_list_files' });
      if (!files || files.length === 0) break;
      const { error: rmErr } = await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
      if (rmErr) return reply(500, { error: 'could_not_remove_files' });
    }
    // A remove that silently skipped something must not lead to deleting the user with files left behind.
    const { data: left, error: leftErr } = await admin.storage.from(bucket).list(user.id, { limit: 1 });
    if (leftErr || (left && left.length > 0)) return reply(500, { error: 'could_not_remove_files' });
  }

  // 2. The user. Every table points at auth.users with "on delete cascade", so all rows go with it.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return reply(500, { error: 'could_not_delete_user' });

  return reply(200, { ok: true });
});
