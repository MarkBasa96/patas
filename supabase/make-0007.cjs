// Run from the repo root: node supabase/make-0007.cjs. Builds supabase/migrations/0007_round4.sql from the same text blocks as schema.sql, so the two can't drift.
// (supabase/test/run-r4.mjs proves it: old schema + 0007 == fresh schema.sql, object for object.)
const fs = require('fs');
const s = fs.readFileSync('supabase/schema.sql', 'utf8');
const between = (a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('marker: ' + a.slice(0, 50)); return s.slice(i, j); };
const from = (a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker: ' + a.slice(0, 50)); return s.slice(i, j + b.length); };

const tables = between('-- Round 4 (migration 0007): Home\'s income and expenses, one row per month', '-- Where to send phone reminders.');
const caps = from("-- Round 4: 600 months is 50 years of cash flow", "execute function public.patas_row_cap('310');");
const storage = between('-- Round 4 (migration 0007): photos (your own, and one per person you owe). A second private bucket', '-- Deliberately NO update policy for "qr"');
const reminders = between('-- Round 4 (migration 0007): per-debt reminders. "Sent" is now per debt per local day', '-- A person\'s phones that still belong to them');
const batch = between('-- The sender\'s one call per run (service role only). For everyone with reminders on and a phone', '-- A push service said this address is gone');
const rls = from("execute format('alter table public.%I enable row level security', t);", "execute format('grant select, insert, update on public.%I to authenticated', t);");

const out = `-- 0007_round4 (2026-10-23): Patas round 4. Adds only: no column, row or table is removed or rewritten.
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
${tables}
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
${caps}

-- Row Level Security on the two new tables: exactly the rules every other table has.
do $$
declare t text;
begin
  foreach t in array array['cashflow_months', 'photos'] loop
    ${rls}
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
${storage}
-- ---------- reminders per debt ----------
${reminders}
${batch}
drop function if exists private.reminder_counts(uuid, date);
drop function if exists private.reminder_text(int, int, int, int);
`;
fs.writeFileSync('supabase/migrations/0007_round4.sql', out);
console.log('wrote', out.length, 'chars');
