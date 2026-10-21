-- Applied 2026-10-19 to the Supabase project "patas".
-- Payment method for payment lines (Cash, GCash, Maya, ...), from the approved Log payment screen.
alter table public.debt_lines
  add column if not exists method text not null default '' check (public.patas_clean_line(method, 20));
