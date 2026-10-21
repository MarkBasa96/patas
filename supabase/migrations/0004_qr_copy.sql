-- QR copy tracking (Kenshin's save/share ruling, section 4). Only one fact about a saved copy is ever
-- recorded: WHEN (server clock). A QR that replaces another carries the old one's copy date, so the
-- "QR changed" banner can say "you saved a copy of the old QR on <date>". The phone cannot fake,
-- back-date or clear either date.
alter table public.qr_items
  add column if not exists last_copy_saved_at timestamptz,
  add column if not exists replaces_id text check (replaces_id is null or replaces_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  add column if not exists old_copy_saved_at timestamptz;

create or replace function public.patas_qr_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := now();
    new.last_copy_saved_at := null;
    new.old_copy_saved_at := case when new.replaces_id is null then null else
      (select q.last_copy_saved_at from public.qr_items q where q.user_id = new.user_id and q.id = new.replaces_id) end;
  else
    new.added_at := old.added_at;   -- the phone cannot change it; kept quietly so a sync upsert never jams (F5)
    if new.payload_sha256 is distinct from old.payload_sha256
       or new.storage_path is distinct from old.storage_path then
      raise exception 'a QR cannot be changed in place; add a new one' using errcode = '42501';
    end if;
    new.replaces_id := old.replaces_id;             -- fixed when the QR is added
    new.old_copy_saved_at := old.old_copy_saved_at;
    -- "A copy was saved": any new non-null value becomes the server's time; it can never be cleared or back-dated.
    if new.last_copy_saved_at is not null and new.last_copy_saved_at is distinct from old.last_copy_saved_at then
      new.last_copy_saved_at := now();
    else
      new.last_copy_saved_at := old.last_copy_saved_at;
    end if;
  end if;
  return new;
end $$;
