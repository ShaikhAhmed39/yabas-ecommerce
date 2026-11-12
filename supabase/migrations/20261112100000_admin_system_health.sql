-- Admin "System health" tab: one read-only function that counts things that need a person.
-- Only an admin can call it. It changes no data.

create or replace function public.admin_system_health()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '{}'::jsonb;
  n bigint;
  ts timestamptz;
  st text;
  has_cron boolean := false;
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;

  -- database
  v := v || jsonb_build_object(
    'db_size_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'db_connections', (select count(*) from pg_stat_activity where datname = current_database()));

  -- paid orders still waiting for a shipment after 48 hours
  select count(*) into n from public.orders
   where payment_status = 'paid' and delivery_status in ('pending','processing')
     and coalesce(paid_at, created_at) < now() - interval '48 hours';
  v := v || jsonb_build_object('paid_not_shipped_48h', n);

  -- checkouts that never finished and still hold stock (the 15-minute timer should clear these)
  select count(*) into n from public.orders
   where payment_status = 'pending' and inventory_status = 'reserved'
     and created_at < now() - interval '2 hours';
  v := v || jsonb_build_object('stale_unpaid_holding_stock', n);

  select count(*) into n from public.orders where needs_attention;
  v := v || jsonb_build_object('orders_needing_attention', n);

  -- refunds
  select count(*) into n from public.refunds where status = 'failed';
  v := v || jsonb_build_object('refunds_failed', n);
  select count(*) into n from public.refunds
   where status in ('creating','pending') and created_at < now() - interval '3 days';
  v := v || jsonb_build_object('refunds_stuck_3d', n);

  -- shipments
  select count(*) into n from public.shipments where status = 'failed';
  v := v || jsonb_build_object('shipments_failed', n);
  select count(*) into n from public.shipments
   where status in ('awb_assigned','pickup_scheduled','picked_up','in_transit','out_for_delivery')
     and coalesce(last_event_at, created_at) < now() - interval '4 days';
  v := v || jsonb_build_object('shipments_no_update_4d', n);

  -- returns waiting for the owner
  select count(*) into n from public.return_requests
   where status = 'requested' and created_at < now() - interval '2 days';
  v := v || jsonb_build_object('returns_waiting_2d', n);

  -- stock
  select count(*) into n from public.products where stock < 0;
  v := v || jsonb_build_object('products_negative_stock', n);
  select count(*) into n from public.products where stock = 0;
  v := v || jsonb_build_object('products_sold_out', n);

  -- gold rate freshness
  select max(created_at) into ts from public.gold_rates;
  v := v || jsonb_build_object('gold_rate_last_at', ts);

  -- last message from Razorpay and from the courier
  select max(created_at) into ts from public.order_events where actor_type = 'razorpay';
  v := v || jsonb_build_object('last_razorpay_event_at', ts);
  select max(created_at) into ts from public.order_events where actor_type = 'shiprocket';
  v := v || jsonb_build_object('last_courier_event_at', ts);

  -- the 15-minute safety timer (only exists where pg_cron is installed)
  select exists (select 1 from pg_namespace where nspname = 'cron') into has_cron;
  if has_cron then
    begin
      execute $q$ select max(start_time), (array_agg(status order by start_time desc))[1]
                   from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                  where j.jobname = 'yabas-reconcile' $q$ into ts, st;
      v := v || jsonb_build_object('timer_installed',
              (select count(*) > 0 from cron.job where jobname = 'yabas-reconcile'),
              'timer_last_run_at', ts, 'timer_last_status', st);
    exception when others then
      v := v || jsonb_build_object('timer_installed', null);
    end;
  else
    v := v || jsonb_build_object('timer_installed', false);
  end if;

  v := v || jsonb_build_object('checked_at', now());
  return v;
end $$;

revoke all on function public.admin_system_health() from public, anon;
grant execute on function public.admin_system_health() to authenticated;
