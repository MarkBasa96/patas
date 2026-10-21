# Patas security and privacy design (Phase 3, 2026-10-17)

Builds on the Phase 1 research (QR storage, reminders) and Kenshin's save-or-share ruling.
Reviewed by Kenshin 2026-10-17: GO-with-conditions; his High and Medium fixes are applied (see the end).
SQL: `supabase/schema.sql`. Proof: `supabase/test/run-local.mjs` (97 checks), `supabase/test/run-6f.mjs` (67 checks:
reminders and the MPIN) and `supabase/test/mutants.mjs` (breaks the rules 59 ways; the tests must catch every one).
Counts as of 1.0 (2026-10-21).

## In plain words

1. **Your rows are yours.** The database itself refuses to show or change another account's
   rows. This doesn't depend on the app behaving: a stranger calling the database directly with
   their own login gets nothing back.
2. **Signed-out visitors get nothing.** Not even an empty list: the request is refused.
3. **QR pictures sit in a locked box.** One private folder per account. The app downloads your
   QR with your own login and shows it. There is **no web link** to a QR, not even a short-lived
   one, so nothing can leak through browser history, screenshots of the address bar or logs.
   The server enforces this: it refuses to create shareable links, even for your own files.
4. **A QR can't be quietly swapped.** A saved QR's picture can never be changed in place: a QR can only
   get its picture on its first day, and a live QR's picture can't be removed. Replacing one makes a new QR,
   and the **server** stamps the date. The app shows "QR changed on <date>" for
   14 days whenever a QR is new, or a debt is pointed at a different QR. The phone can't fake or
   reset those dates.
5. **Limits for strangers.** Open sign-up means bots. Each account can hold at most 30 QRs,
   300 debts, 3,000 installments and 10,000 lines (about 22 MB at worst), and each QR file is at most
   256 KB. The free database (500 MB) still fits only about 20 maxed-out accounts, so usage alerts go on.
6. **Reminders can't be abused.** The server only ever sends to the real phone push services
   (Google, Apple, Mozilla, Microsoft), never to an address a user types.
7. **Delete my account really deletes.** The test proved that deleting an account in the database
   removes every row **but leaves the QR files behind**. So "Delete my account" runs on the server
   in two steps: remove the QR files first, then the account.

## Privacy note (proposed wording, Joe to approve)

Kenshin's redraft (F6), not legal advice. **APPROVED by Joe 2026-10-17.** `<email>` and `<link>` are filled in at go-live:

> Your debts and saved QR codes are private: other Patas users can't see them. I run this server and can
> technically access what is stored. I don't browse it; I would only look to fix a problem you report or
> where the law requires. It is never sold or used for ads. It is stored by Supabase (database and files)
> and served by Vercel; reminders reach your phone through its push service (Google, Apple, Mozilla or
> Microsoft), encrypted. A QR you save contains the account or mobile number of the person you pay, inside
> the picture. You are recording other people's details for your own use, so keep to what you need.
> Deleted items disappear from your lists at once and stay hidden on the server until you delete your account; "Delete my account" removes all your
> data and QR files. A copy of a QR you save or share is outside Patas. Contact: <email>. You can also
> complain to the National Privacy Commission. Full notice: <link>.

Why it reads this way: in v1 the saved QR is the **lender's**, so the picture holds someone else's
number (the database text has none, the picture does). "Never shared" would be untrue of the hosts.
Self-hosters run their own server and make their own promise.

## Decisions for Joe (four)

1. **Late fees after the installments.** DECIDED by Joe 2026-10-17: after. Changeable later at no cost.
2. **Extra check before replacing or deleting a QR.** DECIDED by Joe 2026-10-17: **not in v1**, keep the confirm
   step. An email code doesn't stop someone who already has your inbox, and an in-app check doesn't stop
   a stolen session that talks to the server directly. The server-side swap rules do the real work, plus
   a permanent "QR set on <date>" line and the payee name read from the picture. Revisit in Phase 6h.
3. **Privacy note wording** above. DECIDED by Joe 2026-10-17: approved as written.
4. **How long deleted items stay on the server** before the purge. DECIDED by Joe 2026-10-17: 30 days (purge job in Phase 8, files through the Storage API). **Not built yet (1.0):** until it is, deleted items stay hidden on the server until the account is deleted, and the in-app note says exactly that (Kenshin go-public M-1, 2026-10-22).

## Who does what (server pieces, built in later phases)

| Piece | Phase | Rule |
|---|---|---|
| `delete-account` Edge Function | 6h | Checks the caller's login; needs a sign-in from the last 10 minutes; deletes `qr/<user>/` files through the Storage API, then the user (rows follow automatically). |
| Reminder sender (pg_cron every 15 min + Edge Function) | 6f | One digest per user per day at their local time. Uses the server key from Supabase secrets only. Logs "sent" in a private schema the API can't see. |
| Keep-alive ping (Vercel Cron, daily) | 6f | Free Supabase pauses after 7 idle days and reminders stop silently. Pro ($25/mo) removes that risk; not now. **Deferred (1.0):** the reminder sender queries the database through the API every 15 minutes; no Vercel Cron is set up. |
| MPIN | 6h | Gastos v3 design reused as is: private schema, peppered hash, 5 tries, server-checked. |

## Threats and answers

| Threat | Answer | Proven by |
|---|---|---|
| B reads or edits A's rows | RLS on every table, forced, own rows only | run-local: "B sees none…", "B cannot change…" |
| B writes a row "as" A | insert check `auth.uid() = user_id` | "B cannot write a row as A" |
| B links to A's debt or QR | composite foreign keys | "B cannot hang a payment…", "…link to A's QR" |
| Id collision or probing | key is (user, id) | "B reusing A's id makes B's own row" |
| Anon reads anything | all grants revoked from anon | "anon cannot read …" (6 tables) |
| TRUNCATE / hard delete (TRUNCATE ignores RLS) | only select, insert, update granted | "A cannot TRUNCATE", "A cannot hard-delete" |
| A row moved to another account | update check + key trigger | "A cannot move a row to B" |
| QR swapped in place | picture fields frozen; no storage update rule; a picture only on a QR's first day; a live QR's picture can't be removed (Kenshin F1) | "A cannot swap…", "Swap step 1–4", "A cannot remove the picture of a live QR" |
| Swap hidden by faking dates | server-set `added_at`, `qr_linked_at` | "…ignores a phone-sent added_at", "…cannot reset qr_linked_at", "Linking a different QR re-stamps…" |
| Shareable links made by hand (free image hosting) | read rule refuses the "sign" operations (F3) | "A cannot mint a signed link…" |
| Bucket made public | bucket forced private on every run | "QR bucket is private…" |
| Stray files dumped in storage | upload only for a live, fresh QR row, at its exact path | "A cannot upload a file with no QR row", "No upload for a soft-deleted QR" |
| A rule added by hand in the dashboard | inventory checks on every run | "Storage rules are exactly…", "Table rules: 3 per table…" |
| Name spoofing with bidi characters | text checks; source files hold no invisible characters | "Bidi-override in a name is refused" |
| Server used to call arbitrary addresses | push host allow-list | "Push endpoint…", "Lookalike push host…", "Any Apple push host…" |
| One fake time zone breaks reminders for all | time zone checked against Postgres's list (F4) | "A fake time zone is refused" |
| Bot fills the free plan | row caps with a lock (no racing past them), 256 KB files, usage alerts (F2) | "B cannot make QR 31" |
| Sync jams at the cap | an upsert of an existing row is an edit, not a new row (F5) | "At the cap, a sync upsert…still works" |
| Anonymous sign-ins switched on by mistake | insert rules refuse anonymous tokens (F12) | "Anonymous sign-ins cannot add rows" |
| Account deletion leaves QR files | server-side deletion, files first | "…but NOT A's QR file" (documents the trap) |

## Not covered by the local test (and when it gets covered)

- The local test copies Supabase's auth and storage rules; it is not Supabase itself. The same
  checks run against the real project and again in Phase 8. Most
  important to re-prove there: that `createSignedUrl` is refused while `download()`, `list()` and
  `remove()` still work (F3), and that bucket versioning is `DISABLED` (F12).
- Real Storage API behaviour (content-type spoofing, the size limit, `download()`), push delivery,
  and the Edge Functions: phases 6e, 6f, 6h.
- The QR decode-and-match check on upload and before save/share: Phase 6e (Kenshin's checklist).
  It is the last line against a swap by someone holding your login, so no real QR goes in before it.
- Parallel requests racing the row cap: the lock is in, but the test uses one connection.

## Kenshin's conditions (2026-10-17)

| When | What | Status |
|---|---|---|
| Before applying the schema | F1 swap fix, F4 time zone, F5 sync traps | done, tested |
| Before open sign-up | F2 caps + lock + usage alerts, F3 no signed links, F12 dashboard settings | caps, lock, F3, F12 rules done; alerts and dashboard check at go-live |
| Before any real QR goes in | Phase 6e decode-and-match check; Kenshin's F10 tests | done 2026-10-20 (decode on add, re-check on every show, tamper control caught) |
| Phase 6e | download with `cache: 'no-store'` (F9); CSP `img-src blob:`; leave `payload_sha256` out of CSV and picture-free backups (F7) | no-store and CSP done 2026-10-20; F7 export rule lands with 6g |
| Phase 6e save/share ruling | copy built on the phone, white margin + date caption only, decoded and matched before it is offered, files-only share, `qr-<date>-<4>.png`, only `last_copy_saved_at` recorded, stale-copy line from the server (migration 0004) | done 2026-10-20; still owed: lock closes the sheet (with the MPIN, 6h), real-phone tests (wallet upload matrix, exiftool, iPhone Save Image, Android wrapper) |
| Phase 6f | sender re-checks the host in code, `redirect: 'manual'`, minimal payload, per-user error guard; unsubscribe on sign-out (F4, F8) | later |
| From the first apply | table changes as numbered migrations (F11) | rule noted in schema.sql |

---

### Technical

- `force row level security` on all six tables; policies `to authenticated` only, `(select auth.uid())`
  form; no delete policies; `revoke all … from anon, public, authenticated` then
  `grant select, insert, update … to authenticated`. Insert checks also refuse `auth.jwt() ->> 'is_anonymous'`.
  Proven against Supabase's real default (`alter default privileges … grant all … to anon, authenticated`),
  copied in `supabase-stub.sql`.
- Storage: bucket `qr` private, `file_size_limit 262144`, `image/png`. Select: own folder and
  `not storage.allow_any_operation(array['object.sign','object.sign_many','render.image_sign'])`. Insert: own
  folder, not anonymous, a live `qr_items` row with `storage_path = objects.name` and `added_at > now() - 1 day`.
  Delete: own folder and no live row at that path. No update policy. `qr_items_path` pins `<user_id>/<id>.png`.
- QR serving: `storage.from('qr').download(path)` with `cache: 'no-store'` → Blob → `URL.createObjectURL`,
  revoked on close; offline copy in IndexedDB keyed by user id, cleared on sign-out. No signed URLs, enforced
  by the select policy (supersedes SPEC 7/8's earlier wording; features.json F04 text predates this).
- `payload_sha256 = sha256(user_id || ':' || id || ':' || decoded text)`: `:` can't appear in an id, so the input
  is unambiguous. Fast sha256 is brute-forceable from a database-only leak if a wallet's payload is a template
  plus a mobile number, so it never leaves the database except with the QR pictures.
- Push: endpoint regex anchored to `fcm.googleapis.com`, `*.push.apple.com`,
  `updates.push.services.mozilla.com`, `*.notify.windows.com` followed by `/`; keys base64url-shaped.
- Row cap: `pg_advisory_xact_lock(hashtext(table), hashtext(user_id))`, skips rows that already exist, counts
  deleted rows. Caps: QR 30, debts 300, installments 3,000, lines 10,000, push 10.
- Tests (1.0): `run-local.mjs` 97 checks, `run-6f.mjs` 67 checks; `mutants.mjs` 59 mutants, each must flip at least one check from PASS to
  FAIL (a crash doesn't count as caught).
