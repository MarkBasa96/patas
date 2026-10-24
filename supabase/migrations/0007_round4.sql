-- 0007_round4 (2026-10-23): Patas round 4. Adds only: no column, row or table is removed or rewritten.
-- Built from the same text as schema.sql by supabase/make-0007.cjs (re-run it after any schema.sql change); supabase/test/run-r4.mjs checks that the old schema
-- plus this file equals a fresh schema.sql, object for object. Apply once, in order, after 0006.
--   * user_settings.display_name (the Home greeting)
--   * debts: currency; per-debt reminders (remind_days, remind_on, remind_at; default {0,1} = the old behaviour);
--     recurring debts (kind 'recurring' + recurring_amount_centavos / _every / _first / _until)
--   * cashflow_months (income and expenses per month; this month's typed numbers are carried over)
--   * photos + a private "photos" bucket (your photo, and one per person you owe)
--   * reminders per debt: private.reminder_sent_debt, private.reminder_events, private.reminder_words, a new
--     public.reminder_batch (same output shape, so the send-reminders function is unchanged); the old
--     private.reminder_counts and private.reminder_text are dropped (nothing else used them)

-- ---------- columns on existing tables ----------
alter table public.user_settings add column if not exists display_name text not null default '' check (public.patas_clean_line(display_name, 40));

alter table public.debts drop constraint if exists debts_kind_check;
alter table public.debts add constraint debts_kind_check check (kind in ('one_time', 'installments', 'recurring'));
alter table public.debts add column if not exists remind_days smallint[] not null default '{0,1}'
               check (remind_days <@ array[0, 1, 3, 7]::smallint[] and cardinality(remind_days) <= 4);
alter table public.debts add column if not exists remind_on date;
alter table public.debts add column if not exists remind_at time;
alter table public.debts add column if not exists currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$');
alter table public.debts add column if not exists recurring_amount_centavos bigint check (recurring_amount_centavos between 1 and 99999999999);
alter table public.debts add column if not exists recurring_every text check (recurring_every in ('monthly', 'biweekly', 'weekly'));
alter table public.debts add column if not exists recurring_first date;
alter table public.debts add column if not exists recurring_until date;
alter table public.debts drop constraint if exists debts_recurring;
alter table public.debts add constraint debts_recurring check (
    (kind = 'recurring') = (recurring_amount_centavos is not null and recurring_every is not null and recurring_first is not null)
    and (kind = 'recurring' or (recurring_amount_centavos is null and recurring_every is null and recurring_first is null and recurring_until is null))
    and (recurring_until is null or recurring_until >= recurring_first));

-- ---------- new tables ----------
-- Round 4 (migration 0007): Home's income and expenses, one row per month, so Reports can show the months.
-- The row's id IS the month ("2026-10"), so the same month typed on two phones is one row.
create table if not exists public.cashflow_months (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null check (id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  income_centavos   bigint not null default 0 check (income_centavos between 0 and 99999999999),
  expenses_centavos bigint not null default 0 check (expenses_centavos between 0 and 99999999999),
  created_at        bigint not null,
  deleted           boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);

-- Round 4 (migration 0007): photos. "me" is the person's own profile photo; "p-<16 hex>" is the photo of someone
-- they owe, and the id is fixed by that person's name (the first 16 hex of sha256 of the trimmed, lowercased name),
-- so one name has one photo. The file lives in the private "photos" bucket at <user_id>/<id>.jpg, nowhere else.
create table if not exists public.photos (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (id = 'me' or id ~ '^p-[0-9a-f]{16}$'),
  person_key   text not null default '' check (public.patas_clean_line(person_key, 60)),
  storage_path text not null,
  created_at   bigint not null,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  constraint photos_path check (storage_path = user_id::text || '/' || id || '.jpg'),
  constraint photos_who check (
    (id = 'me' and person_key = '')
    or (id = 'p-' || left(encode(extensions.digest(person_key, 'sha256'), 'hex'), 16) and person_key <> ''))
);


create index if not exists cashflow_sync      on public.cashflow_months (user_id, updated_at, id);
create index if not exists photos_sync        on public.photos (user_id, updated_at, id);

do $$
declare t text;
begin
  foreach t in array array['cashflow_months', 'photos'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before insert or update on public.%1$I
                    for each row execute function public.patas_touch()', t);
    execute format('drop trigger if exists %1$s_keep_key on public.%1$I', t);
    execute format('create trigger %1$s_keep_key before update on public.%1$I
                    for each row execute function public.patas_keep_key()', t);
  end loop;
end $$;
-- Round 4: 600 months is 50 years of cash flow; 310 photos is one per debt (300) plus the profile photo and room to spare.
drop trigger if exists cashflow_cap on public.cashflow_months;
create trigger cashflow_cap before insert on public.cashflow_months for each row execute function public.patas_row_cap('600');
drop trigger if exists photos_cap on public.photos;
create trigger photos_cap before insert on public.photos for each row execute function public.patas_row_cap('310');

-- Row Level Security on the two new tables: exactly the rules every other table has.
do $$
declare t text;
begin
  foreach t in array array['cashflow_months', 'photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows: read" on public.%I', t);
    execute format('drop policy if exists "own rows: add" on public.%I', t);
    execute format('drop policy if exists "own rows: change" on public.%I', t);
    execute format('create policy "own rows: read" on public.%I for select to authenticated
                    using ((select auth.uid()) = user_id)', t);
    -- Anonymous sign-ins (if ever switched on by mistake) also get the authenticated role: refuse them (F12).
    execute format('create policy "own rows: add" on public.%I for insert to authenticated
                    with check ((select auth.uid()) = user_id
                                and coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false)', t);
    execute format('create policy "own rows: change" on public.%I for update to authenticated
                    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    -- No delete policy on purpose: deletes are soft so they sync. Account deletion runs server-side.
    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- This month's typed cash-flow numbers become the first cashflow_months row (each person's own month, own time zone).
insert into public.cashflow_months (user_id, id, income_centavos, expenses_centavos, created_at)
select s.user_id, to_char(now() at time zone s.time_zone, 'YYYY-MM'), s.cashflow_income_centavos, s.cashflow_expenses_centavos,
       (extract(epoch from now()) * 1000)::bigint
  from public.user_settings s
 where s.cashflow_income_centavos > 0 or s.cashflow_expenses_centavos > 0
on conflict (user_id, id) do nothing;

-- ---------- photos bucket ----------
-- Round 4 (migration 0007): photos (your own, and one per person you owe). A second private bucket with the same
-- walls as QR codes: own folder only, no shareable links, a file only where a live photos row says. Unlike a QR, a
-- new photo may replace the old file in place (a face is not something a swap can steal money with), so there is
-- an update policy here and none for "qr". JPEG only, at most 64 KB (the app sends a 256 px square, ~20 KB; Kenshin round 4 M-2: keeps a scripted account to ~20 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 65536, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 65536, allowed_mime_types = array['image/jpeg'];

drop policy if exists "photos: read own" on storage.objects;
drop policy if exists "photos: add own" on storage.objects;
drop policy if exists "photos: change own" on storage.objects;
drop policy if exists "photos: remove own" on storage.objects;

create policy "photos: read own" on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not storage.allow_any_operation(array['object.sign', 'object.sign_many', 'render.image_sign'])
  );
create policy "photos: add own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.photos p where p.user_id = (select auth.uid()) and p.storage_path = objects.name and not p.deleted)
  );
create policy "photos: change own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.photos p where p.user_id = (select auth.uid()) and p.storage_path = objects.name and not p.deleted)
  );
create policy "photos: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ---------- reminders per debt ----------
-- Round 4 (migration 0007): per-debt reminders. "Sent" is now per debt per local day, so each debt reminds at
-- most once a day, at its own time; one run still sends one push per person with everything due in that run.
create table if not exists private.reminder_sent_debt (
  user_id    uuid not null references auth.users (id) on delete cascade,
  debt_id    text not null,
  local_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, debt_id, local_date)
);
alter table private.reminder_sent_debt enable row level security;
revoke all on private.reminder_sent_debt from public, anon, authenticated;

-- What reminds a person on one day: for each debt with reminders on, every amount still unpaid (same oldest-first
-- rule as the app's balance(): an amount is covered once total credits reach everything due up to and including
-- it) whose due date is exactly one of the debt's remind_days away, plus the debt's own extra date (days = -1)
-- while something is still unpaid. Installments, one-time debts with a pay-by date, and recurring debts (their
-- dates made the app's way: n months / 7n / 14n days from the first date, until the end date). Counted, never named.
create or replace function private.reminder_events(p_uid uuid, p_day date)
returns table (debt_id text, days int)
language sql stable set search_path = '' as $$
  with live as (
    select d.* from public.debts d
     where d.user_id = p_uid and not d.deleted and d.settled_on is null and d.remind
  ), credits as (
    select l.debt_id, sum(l.amount_centavos) as c from public.debt_lines l
     where l.user_id = p_uid and not l.deleted
       and (l.kind in ('payment', 'writeoff') or (l.kind = 'adjustment' and l.adjust_sign = -1))
     group by l.debt_id
  ), debits as (
    select l.debt_id, sum(l.amount_centavos) as d from public.debt_lines l
     where l.user_id = p_uid and not l.deleted
       and not (l.kind in ('payment', 'writeoff') or (l.kind = 'adjustment' and l.adjust_sign = -1))
     group by l.debt_id
  ), plan as (
    select i.debt_id, i.due_on,
           sum(i.amount_centavos) over (partition by i.debt_id order by i.due_on, i.seq) as upto
      from public.installments i join live lv on lv.id = i.debt_id and lv.kind = 'installments'
     where i.user_id = p_uid and not i.deleted
  ), rec as (
    select lv.id as debt_id, g.due_on, lv.recurring_amount_centavos * (g.n + 1) as upto
      from live lv
      cross join lateral (
        select s.n, case lv.recurring_every
                      when 'weekly' then lv.recurring_first + 7 * s.n
                      when 'biweekly' then lv.recurring_first + 14 * s.n
                      else (lv.recurring_first + make_interval(months => s.n))::date end as due_on
          from generate_series(0, least(600, greatest(0, ((p_day + 7) - lv.recurring_first) / 7 + 1))) as s(n)
      ) g
     where lv.kind = 'recurring' and g.due_on <= p_day + 7
       and (lv.recurring_until is null or g.due_on <= lv.recurring_until)
  ), unpaid as (
    select p.debt_id, p.due_on from plan p left join credits c on c.debt_id = p.debt_id
     where coalesce(c.c, 0) < p.upto
    union all
    select r.debt_id, r.due_on from rec r left join credits c on c.debt_id = r.debt_id
     where coalesce(c.c, 0) < r.upto
    union all
    select lv.id, lv.due_on from live lv
      left join credits c on c.debt_id = lv.id left join debits b on b.debt_id = lv.id
     where lv.kind = 'one_time' and lv.due_on is not null
       and coalesce(b.d, 0) > coalesce(c.c, 0)
  )
  select distinct u.debt_id, (u.due_on - p_day)::int
    from unpaid u join live lv on lv.id = u.debt_id
   where (u.due_on - p_day) = any (lv.remind_days)
  union
  select lv.id, -1 from live lv
   where lv.remind_on = p_day and exists (select 1 from unpaid u where u.debt_id = lv.id)
$$;

-- The words on the phone. Counts only: no names, no amounts (Kenshin: minimal payload).
create or replace function private.reminder_words(p_days int[]) returns text
language sql immutable set search_path = '' as $$
  select array_to_string(array_remove(array[
    (select case when n > 0 then 'Due today: ' || n || case when n = 1 then ' payment.' else ' payments.' end end from (select count(*) n from unnest(p_days) d where d = 0) x),
    (select case when n > 0 then 'Due tomorrow: ' || n || case when n = 1 then ' payment.' else ' payments.' end end from (select count(*) n from unnest(p_days) d where d = 1) x),
    (select case when n > 0 then 'Due in 3 days: ' || n || case when n = 1 then ' payment.' else ' payments.' end end from (select count(*) n from unnest(p_days) d where d = 3) x),
    (select case when n > 0 then 'Due in 7 days: ' || n || case when n = 1 then ' payment.' else ' payments.' end end from (select count(*) n from unnest(p_days) d where d = 7) x),
    (select case when n > 0 then 'Reminder: ' || n || case when n = 1 then ' debt to check.' else ' debts to check.' end end from (select count(*) n from unnest(p_days) d where d = -1) x)
  ], null), ' ')
$$;

revoke all on function private.reminder_events(uuid, date), private.reminder_words(int[])
  from public, anon, authenticated;


-- The sender's one call per run (service role only). For everyone with reminders on and a phone, the debts whose
-- reminder time (the debt's own, else the account's) has passed today in the person's own time zone and that have
-- an event today. Each such debt is claimed for the day (reminder_sent_debt), so a second or racing run sends
-- nothing again; only debts claimed in THIS call count. One push per person per run, with every claimed debt.
-- At most once by design: a failed send is not retried that day; better a missed nudge than a spam loop.
create or replace function public.reminder_batch(p_secret text, p_now timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare out jsonb := '[]'::jsonb; r record; claimed int[]; body text;
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'patas_cron_secret') then
    return '{"result":"refused"}';
  end if;
  for r in
    select s.user_id, s.reminder_at, (p_now at time zone s.time_zone)::date as today, (p_now at time zone s.time_zone)::time as now_t
      from public.user_settings s
     where s.reminders_on
       and exists (select 1 from private.live_subs(s.user_id))
  loop
    begin -- one person's broken data never stops everyone else's digest (Kenshin audit L-4)
      with ev as (
        select e.debt_id, e.days from private.reminder_events(r.user_id, r.today) e
          join public.debts d on d.user_id = r.user_id and d.id = e.debt_id
         where coalesce(d.remind_at, r.reminder_at) <= r.now_t
           and not exists (select 1 from private.reminder_sent_debt x
                            where x.user_id = r.user_id and x.debt_id = e.debt_id and x.local_date = r.today)
      ), fresh as (
        insert into private.reminder_sent_debt (user_id, debt_id, local_date)
        select distinct r.user_id, ev.debt_id, r.today from ev
        on conflict do nothing
        returning debt_id
      )
      select array_agg(ev.days) into claimed from ev join fresh on fresh.debt_id = ev.debt_id;
      if claimed is null then continue; end if;
      body := private.reminder_words(claimed);
      out := out || jsonb_build_object('user_id', r.user_id, 'body', body, 'subs',
        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth_secret)), '[]')
           from private.live_subs(r.user_id) p));
    exception when others then
      null; -- skipped this run; its claims rolled back with it, so the next run tries again
    end;
  end loop;
  return jsonb_build_object('result', 'ok', 'digests', out);
end $$;


drop function if exists private.reminder_counts(uuid, date);
drop function if exists private.reminder_text(int, int, int, int);
