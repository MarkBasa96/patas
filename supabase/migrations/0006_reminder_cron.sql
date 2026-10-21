-- The 15-minute schedule for reminders (Phase 6f). Cloud only: the local test Postgres has no pg_cron
-- or pg_net, so this file is not in schema.sql. Run once on the project after send-reminders is deployed.
-- The cron secret is read from Vault at run time, so it is never written here or in the job's text.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'patas-reminders';
select cron.schedule('patas-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://gskqcnruifymcvogqewh.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-patas-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'patas_cron_secret')),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 20000)
$$);

-- Old sent-log rows are only needed for "today": keep 40 days, daily at 03:10 UTC.
select cron.unschedule(jobid) from cron.job where jobname = 'patas-reminder-log-trim';
select cron.schedule('patas-reminder-log-trim', '10 3 * * *', $$
  delete from private.reminder_sent where local_date < current_date - 40
$$);
