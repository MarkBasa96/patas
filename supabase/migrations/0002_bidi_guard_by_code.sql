-- Applied 2026-10-19 to the Supabase project "patas". 0001_init is schema.sql as it stood before this change.
-- The bidi-override guard is built from character codes (8234-8238, 8294-8297, 8206, 8207)
-- so no invisible character ever has to be typed into this file.
create or replace function public.patas_clean_line(t text, maxlen int) returns boolean
language sql immutable set search_path = '' as $$
  select t is not null
     and char_length(t) <= maxlen
     and t !~ '[[:cntrl:]]'
     and t !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(8206) || chr(8207) || ']')
$$;

create or replace function public.patas_clean_note(t text, maxlen int) returns boolean
language sql immutable set search_path = '' as $$
  select t is not null
     and char_length(t) <= maxlen
     and regexp_replace(t, '[' || chr(10) || chr(13) || chr(9) || ']', '', 'g') !~ '[[:cntrl:]]'
     and t !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(8206) || chr(8207) || ']')
$$;
