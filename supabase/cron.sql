-- Run ONCE in Supabase -> SQL Editor, after deploying the functions and setting CRON_SECRET.
-- Replace <PROJECT_REF> and <CRON_SECRET>. Requires the pg_cron and pg_net extensions (Database -> Extensions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Safety net every 15 minutes: settles lost payments, frees abandoned stock, retries refunds, polls stale parcels.
select cron.schedule(
  'yabas-reconcile',
  '*/15 * * * *',
  $$ select net.http_post(
       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/reconcile-orders',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
       body    := '{}'::jsonb
     ); $$
);

-- To remove:  select cron.unschedule('yabas-reconcile');
