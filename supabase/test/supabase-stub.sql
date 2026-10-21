-- The small part of Supabase that schema.sql leans on, rebuilt for a local in-memory Postgres.
-- It copies Supabase's risky defaults on purpose (anon and authenticated get ALL on new tables,
-- storage.objects is open to both), so the test proves schema.sql takes them away.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase default: every new table in public is fully granted to the API roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- Supabase's helper: the folder parts of a path, without the file name.
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated;

-- Supabase's auth.jwt(): the whole token as JSON.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated;

-- Stand-in for Supabase Storage's allow_any_operation(): the Storage server sets storage.operation
-- per request (for example 'storage.object.sign'); the helper compares it without the 'storage.' prefix.
create function storage.allow_any_operation(ops text[]) returns boolean language sql stable as $$
  select regexp_replace(coalesce(current_setting('storage.operation', true), ''), '^storage\.', '') = any(ops)
$$;
grant execute on function storage.allow_any_operation(text[]) to anon, authenticated;

-- Supabase keeps pgcrypto in "extensions" and secrets in Vault. Stand-ins: the same names, no
-- encryption (the real Vault encrypts at rest). Nobody but the owner can read them, as in Supabase.
create schema extensions;
create extension pgcrypto with schema extensions;
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique not null, secret text not null);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text) returns uuid language sql as $$
  insert into vault.secrets (name, secret) values (new_name, new_secret) returning id
$$;
revoke all on schema vault from public, anon, authenticated;
grant usage on schema extensions to anon, authenticated, service_role;
