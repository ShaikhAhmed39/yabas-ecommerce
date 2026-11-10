/*
  Production hardening for Yaba's orders, delivery (Shiprocket), returns and refunds.

  Applies on top of 20261027185229_remote_schema.sql (the baseline pulled from the live DB).

  What this adds
  --------------
  * orders: human order number, updated_at, cancellation fields, refunded_amount, needs_attention flag,
            delivery_status now also allows rto_initiated / rto_delivered
  * shipments + shipment_events: one row per forward or return parcel, and the courier's event timeline
  * refunds: every refund we ask Razorpay for (idempotent, capped by what was actually paid)
  * order_events: audit trail of who/what changed an order and when
  * RPCs (service_role only) that do every money/stock/status change atomically:
      begin_shipment, save_shipment_progress, apply_shipping_update,
      begin_refund, finalize_refund, apply_refund_update,
      admin_set_delivery_status, cancel_order_restock, expire_unpaid_order,
      confirm_order_payment_and_commit_inventory (replaced: now survives late and duplicate payments)
  * Customers can read ONLY safe columns of their own shipments / events / refunds. They can never write.
*/

-- =====================================================================
-- 0. helpers
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

-- =====================================================================
-- 1. orders
-- =====================================================================
create sequence if not exists public.order_number_seq start 1001;

alter table public.orders
  add column if not exists order_number text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by text,
  add column if not exists refunded_amount numeric(10,2) not null default 0,
  add column if not exists needs_attention boolean not null default false,
  add column if not exists attention_reason text;

update public.orders o
set order_number = 'YB' || lpad(nextval('public.order_number_seq')::text, 6, '0')
from (select id from public.orders where order_number is null order by created_at, id) s
where o.id = s.id;

alter table public.orders
  alter column order_number set default ('YB' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  alter column order_number set not null;

create unique index if not exists orders_order_number_key on public.orders (order_number);
create index if not exists idx_orders_attention on public.orders (needs_attention) where needs_attention;
create index if not exists idx_orders_delivery_status on public.orders (delivery_status, payment_status);

alter table public.orders drop constraint if exists orders_delivery_status_check;
alter table public.orders add constraint orders_delivery_status_check check (
  delivery_status in ('pending','processing','shipped','out_for_delivery','delivered',
                      'delivery_failed','rto_initiated','rto_delivered','cancelled')
);

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (
  payment_status in ('pending','paid','failed','cancelled','refunded')
) not valid;

alter table public.orders drop constraint if exists orders_refunded_amount_check;
alter table public.orders add constraint orders_refunded_amount_check check (refunded_amount >= 0);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. products: weight used for the courier booking
-- =====================================================================
alter table public.products
  add column if not exists weight_grams integer not null default 100;

alter table public.products drop constraint if exists products_weight_grams_check;
alter table public.products add constraint products_weight_grams_check check (weight_grams > 0 and weight_grams <= 20000);

-- =====================================================================
-- 3. return_requests: one active request per item, received_at
-- =====================================================================
alter table public.return_requests
  add column if not exists received_at timestamptz;

-- Cancel older duplicates (race-condition leftovers) so the unique index can be built.
update public.return_requests rr
set status = 'cancelled',
    admin_note = coalesce(rr.admin_note || ' ', '') || '[auto-cancelled duplicate request]',
    updated_at = now()
where rr.id in (
  select id from (
    select id,
           row_number() over (partition by order_item_id order by created_at, id) as rn
    from public.return_requests
    where status not in ('rejected','cancelled')
  ) t
  where t.rn > 1
);

create unique index if not exists uq_return_requests_active_item
  on public.return_requests (order_item_id)
  where status not in ('rejected','cancelled');

drop trigger if exists trg_return_requests_updated_at on public.return_requests;
create trigger trg_return_requests_updated_at before update on public.return_requests
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4. shipments (forward + return parcels)
-- =====================================================================
create table if not exists public.shipments (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete restrict,
  return_request_id    uuid references public.return_requests(id) on delete restrict,
  direction            text not null check (direction in ('forward','return')),
  provider             text not null default 'shiprocket',
  provider_reference   text not null,
  attempt              integer not null default 1,
  provider_order_id    text,
  provider_shipment_id text,
  awb_code             text,
  courier_name         text,
  courier_id           text,
  status               text not null default 'creating' check (status in (
                         'creating','failed','created','awb_assigned','pickup_scheduled','picked_up',
                         'in_transit','out_for_delivery','delivered','undelivered',
                         'rto_initiated','rto_delivered','cancelled','lost')),
  raw_status           text,
  tracking_url         text,
  label_url            text,
  manifest_url         text,
  pickup_scheduled_at  timestamptz,
  etd                  timestamptz,
  picked_up_at         timestamptz,
  delivered_at         timestamptz,
  last_event_at        timestamptz,
  error                text,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint shipments_return_link_check check (
    (direction = 'return' and return_request_id is not null) or (direction = 'forward' and return_request_id is null)
  )
);

create unique index if not exists uq_shipments_provider_reference on public.shipments (provider_reference);
create unique index if not exists uq_shipments_awb on public.shipments (awb_code) where awb_code is not null;
create unique index if not exists uq_shipments_active_forward
  on public.shipments (order_id) where direction = 'forward' and status <> 'cancelled';
create unique index if not exists uq_shipments_active_return
  on public.shipments (return_request_id) where direction = 'return' and status <> 'cancelled';
create index if not exists idx_shipments_order on public.shipments (order_id);
create index if not exists idx_shipments_active on public.shipments (last_event_at)
  where status in ('created','awb_assigned','pickup_scheduled','picked_up','in_transit','out_for_delivery','undelivered','rto_initiated');

drop trigger if exists trg_shipments_updated_at on public.shipments;
create trigger trg_shipments_updated_at before update on public.shipments
  for each row execute function public.set_updated_at();

create table if not exists public.shipment_events (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid references public.shipments(id) on delete cascade,
  awb_code      text not null,
  raw_status    text,
  mapped_status text,
  event_time    timestamptz not null default now(),
  activity      text,
  location      text,
  payload       jsonb not null default '{}'::jsonb,
  dedupe_key    text not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_shipment_events_dedupe on public.shipment_events (dedupe_key);
create index if not exists idx_shipment_events_shipment on public.shipment_events (shipment_id, event_time desc);

-- =====================================================================
-- 5. refunds
-- =====================================================================
create table if not exists public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete restrict,
  return_request_id  uuid references public.return_requests(id) on delete restrict,
  payment_id         text not null,
  razorpay_refund_id text,
  amount_paise       bigint not null check (amount_paise > 0),
  status             text not null default 'creating' check (status in ('creating','pending','processed','failed')),
  speed_processed    text,
  reason             text not null check (reason in ('return','cancellation','late_payment','duplicate_payment','admin')),
  idempotency_key    text not null,
  error              text,
  created_by         text not null default 'system',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  processed_at       timestamptz
);
create unique index if not exists uq_refunds_idempotency on public.refunds (idempotency_key);
create unique index if not exists uq_refunds_razorpay_id on public.refunds (razorpay_refund_id) where razorpay_refund_id is not null;
create unique index if not exists uq_refunds_active_per_return
  on public.refunds (return_request_id) where return_request_id is not null and status in ('creating','pending','processed');
create index if not exists idx_refunds_order on public.refunds (order_id);
create index if not exists idx_refunds_open on public.refunds (updated_at) where status in ('creating','pending');

drop trigger if exists trg_refunds_updated_at on public.refunds;
create trigger trg_refunds_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 6. order_events (audit trail)
-- =====================================================================
create table if not exists public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  actor_type  text not null check (actor_type in ('customer','admin','system','razorpay','shiprocket')),
  actor_id    uuid,
  event_type  text not null,
  from_value  text,
  to_value    text,
  note        text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_order_events_order on public.order_events (order_id, created_at desc);

-- =====================================================================
-- 7. RLS + grants (new tables): customers read safe columns of their own rows, nobody writes
-- =====================================================================
alter table public.shipments        enable row level security;
alter table public.shipment_events  enable row level security;
alter table public.refunds          enable row level security;
alter table public.order_events     enable row level security;

revoke all on table public.shipments, public.shipment_events, public.refunds, public.order_events
  from anon, authenticated;
grant all on table public.shipments, public.shipment_events, public.refunds, public.order_events
  to service_role;

-- Column-level grants hide provider ids, label/manifest URLs, raw payloads and Razorpay ids from customers.
grant select (id, order_id, return_request_id, direction, courier_name, awb_code, status,
              tracking_url, pickup_scheduled_at, etd, picked_up_at, delivered_at, last_event_at, created_at)
  on public.shipments to authenticated;
grant select (id, shipment_id, mapped_status, activity, location, event_time)
  on public.shipment_events to authenticated;
grant select (id, order_id, return_request_id, amount_paise, status, reason, created_at, processed_at)
  on public.refunds to authenticated;

drop policy if exists "Customers can view their own shipments" on public.shipments;
create policy "Customers can view their own shipments" on public.shipments
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = shipments.order_id and o.user_id = (select auth.uid())));

drop policy if exists "Customers can view their own shipment events" on public.shipment_events;
create policy "Customers can view their own shipment events" on public.shipment_events
  for select to authenticated
  using (exists (select 1 from public.shipments s join public.orders o on o.id = s.order_id
                 where s.id = shipment_events.shipment_id and o.user_id = (select auth.uid())));

drop policy if exists "Customers can view their own refunds" on public.refunds;
create policy "Customers can view their own refunds" on public.refunds
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = refunds.order_id and o.user_id = (select auth.uid())));

-- =====================================================================
-- 8. internal helpers
-- =====================================================================
create or replace function public.log_order_event(
  p_order_id uuid, p_actor_type text, p_actor_id uuid, p_event_type text,
  p_from text, p_to text, p_note text, p_payload jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  insert into public.order_events (order_id, actor_type, actor_id, event_type, from_value, to_value, note, payload)
  values (p_order_id, p_actor_type, p_actor_id, p_event_type, p_from, p_to, p_note, coalesce(p_payload, '{}'::jsonb));
$fn$;

create or replace function public.shipment_status_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $fn$
  select case p_status
    when 'creating' then 0 when 'failed' then 0 when 'created' then 1 when 'awb_assigned' then 2
    when 'pickup_scheduled' then 3 when 'picked_up' then 4 when 'in_transit' then 5
    when 'out_for_delivery' then 6 when 'undelivered' then 6 when 'delivered' then 7
    when 'rto_initiated' then 8 when 'rto_delivered' then 9 when 'lost' then 10 when 'cancelled' then 10
    else -1 end;
$fn$;

-- put stock back for every line of an order (used by expiry and cancellation)
create or replace function public.restock_order_items(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_item record;
begin
  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
    order by product_id
  loop
    update public.products set stock = stock + v_item.quantity where id = v_item.product_id;
  end loop;
end;
$fn$;

-- =====================================================================
-- 9. confirm payment (replaces the baseline version: same name + signature)
--    Now survives: late payment after expiry, duplicate payment on one order.
--    Instead of raising, it tells the caller when a refund is required.
-- =====================================================================
create or replace function public.confirm_order_payment_and_commit_inventory(
  p_order_id uuid, p_razorpay_payment_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_prod public.products%rowtype;
  v_short boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission denied';
  end if;
  if p_order_id is null or p_razorpay_payment_id !~ '^pay_[A-Za-z0-9]+$' then
    raise exception 'invalid payment confirmation';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  -- 1) exactly the same payment again -> idempotent
  if v_order.payment_status = 'paid' and v_order.razorpay_payment_id = p_razorpay_payment_id then
    if v_order.inventory_status = 'committed' then
      return jsonb_build_object('success', true, 'alreadyProcessed', true, 'orderId', v_order.id,
        'paymentStatus', 'paid', 'inventoryStatus', 'committed');
    end if;
    return jsonb_build_object('success', false, 'needsRefund', true, 'alreadyProcessed', true,
      'orderId', v_order.id, 'paymentStatus', 'paid', 'inventoryStatus', v_order.inventory_status,
      'reason', 'order_not_fulfillable');
  end if;

  -- 2) a different payment already settled this order -> this one is a duplicate, caller refunds it
  if v_order.payment_status = 'paid' and v_order.razorpay_payment_id is distinct from p_razorpay_payment_id then
    perform public.log_order_event(v_order.id, 'razorpay', null, 'duplicate_payment', null, p_razorpay_payment_id,
      'A second payment was captured for an already-paid order');
    update public.orders set needs_attention = true,
      attention_reason = 'Duplicate payment captured - refund issued/required' where id = v_order.id;
    return jsonb_build_object('success', false, 'duplicatePayment', true, 'needsRefund', true,
      'orderId', v_order.id, 'paymentStatus', v_order.payment_status, 'inventoryStatus', v_order.inventory_status,
      'reason', 'duplicate_payment');
  end if;

  -- 3) normal path: stock is reserved -> commit it
  if v_order.inventory_status = 'reserved' then
    update public.orders
       set payment_status = 'paid',
           razorpay_payment_id = p_razorpay_payment_id,
           paid_at = coalesce(paid_at, now()),
           payment_error = null,
           inventory_status = 'committed'
     where id = p_order_id;
    perform public.log_order_event(p_order_id, 'razorpay', null, 'payment_captured', v_order.payment_status, 'paid',
      null, jsonb_build_object('payment_id', p_razorpay_payment_id));
    return jsonb_build_object('success', true, 'alreadyProcessed', false, 'orderId', p_order_id,
      'paymentStatus', 'paid', 'inventoryStatus', 'committed');
  end if;

  -- 4) late payment: the reservation was released (expired / failed). Try to take the stock again.
  if v_order.inventory_status = 'released' and v_order.payment_status in ('cancelled','failed') then
    for v_item in
      select product_id, sum(quantity)::integer as quantity, bool_or(product_id is null) as missing
      from public.order_items where order_id = p_order_id
      group by product_id order by product_id
    loop
      if v_item.product_id is null then v_short := true; exit; end if;
      select * into v_prod from public.products where id = v_item.product_id for update;
      if not found or v_prod.stock < v_item.quantity then v_short := true; exit; end if;
    end loop;

    if not v_short then
      for v_item in
        select product_id, sum(quantity)::integer as quantity
        from public.order_items where order_id = p_order_id group by product_id order by product_id
      loop
        update public.products set stock = stock - v_item.quantity where id = v_item.product_id;
      end loop;
      update public.orders
         set payment_status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
             paid_at = coalesce(paid_at, now()), payment_error = null, inventory_status = 'committed',
             status = 'pending', delivery_status = 'pending',
             cancelled_at = null, cancel_reason = null, cancelled_by = null
       where id = p_order_id;
      perform public.log_order_event(p_order_id, 'razorpay', null, 'late_payment_recovered', v_order.payment_status,
        'paid', 'Payment arrived after the reservation expired; stock was still available');
      return jsonb_build_object('success', true, 'alreadyProcessed', false, 'recovered', true,
        'orderId', p_order_id, 'paymentStatus', 'paid', 'inventoryStatus', 'committed');
    end if;

    update public.orders
       set payment_status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
           paid_at = coalesce(paid_at, now()),
           payment_error = 'Paid after the order expired and stock was gone - refund required',
           needs_attention = true, attention_reason = 'Late payment, item out of stock - refund required'
     where id = p_order_id;
    perform public.log_order_event(p_order_id, 'razorpay', null, 'late_payment_refund_required', v_order.payment_status,
      'paid', 'Payment arrived after expiry and stock is unavailable');
    return jsonb_build_object('success', false, 'needsRefund', true, 'orderId', p_order_id,
      'paymentStatus', 'paid', 'inventoryStatus', 'released', 'reason', 'insufficient_stock_after_expiry');
  end if;

  raise exception 'order payment/inventory state requires reconciliation';
end;
$fn$;

-- =====================================================================
-- 10. stock expiry for abandoned checkouts
-- =====================================================================
create or replace function public.expire_unpaid_order(p_order_id uuid, p_min_age_minutes integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_order public.orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if v_order.payment_status <> 'pending' or v_order.inventory_status <> 'reserved' or v_order.status <> 'pending' then
    return jsonb_build_object('expired', false, 'reason', 'not_pending');
  end if;
  if v_order.created_at > now() - make_interval(mins => greatest(p_min_age_minutes, 0)) then
    return jsonb_build_object('expired', false, 'reason', 'too_recent');
  end if;

  update public.orders
     set payment_status = 'cancelled', status = 'cancelled', delivery_status = 'cancelled',
         cancelled_at = now(), cancel_reason = 'Payment not completed in time', cancelled_by = 'system'
   where id = p_order_id;
  perform public.release_failed_order_inventory(p_order_id);
  perform public.log_order_event(p_order_id, 'system', null, 'expired_unpaid', 'pending', 'cancelled',
    'Checkout expired without payment; stock released');
  return jsonb_build_object('expired', true);
end;
$fn$;

-- =====================================================================
-- 11. delivery status state machine (manual admin changes)
-- =====================================================================
create or replace function public.admin_set_delivery_status(
  p_order_id uuid, p_next text, p_actor uuid, p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order public.orders%rowtype;
  v_allowed text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if p_next not in ('processing','shipped','out_for_delivery','delivered','delivery_failed','rto_initiated','rto_delivered') then
    raise exception 'invalid delivery status';
  end if;
  if v_order.payment_status <> 'paid' or v_order.status = 'cancelled' or v_order.inventory_status <> 'committed' then
    raise exception 'order is not paid and active';
  end if;

  v_allowed := case v_order.delivery_status
    when 'pending'          then array['processing']
    when 'processing'       then array['shipped','out_for_delivery','delivered']
    when 'shipped'          then array['out_for_delivery','delivered','delivery_failed']
    when 'out_for_delivery' then array['delivered','delivery_failed']
    when 'delivery_failed'  then array['shipped','out_for_delivery','delivered','rto_initiated']
    when 'rto_initiated'    then array['rto_delivered']
    else array[]::text[] end;

  if not (p_next = any (v_allowed)) then
    raise exception 'cannot move delivery from % to %', v_order.delivery_status, p_next;
  end if;

  update public.orders
     set delivery_status = p_next,
         status = p_next,
         delivered_at = case when p_next = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
         needs_attention = case when p_next = 'delivered' then false
                                when p_next in ('delivery_failed','rto_initiated','rto_delivered') then true
                                else needs_attention end,
         attention_reason = case when p_next = 'delivered' then null
                                 when p_next = 'delivery_failed' then 'Delivery attempt failed'
                                 when p_next = 'rto_initiated' then 'Parcel is returning to origin'
                                 when p_next = 'rto_delivered' then 'Parcel back at origin - decide refund or re-ship'
                                 else attention_reason end
   where id = p_order_id;

  perform public.log_order_event(p_order_id, 'admin', p_actor, 'delivery_status_changed',
    v_order.delivery_status, p_next, p_note);

  return jsonb_build_object('orderId', p_order_id, 'from', v_order.delivery_status, 'to', p_next);
end;
$fn$;

-- =====================================================================
-- 12. cancel an order (admin): restock + mark cancelled; caller then refunds
-- =====================================================================
create or replace function public.cancel_order_restock(p_order_id uuid, p_actor uuid, p_reason text, p_by text default 'admin')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_order public.orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('cancelled', true, 'alreadyCancelled', true, 'needsRefund',
      v_order.payment_status = 'paid');
  end if;
  if v_order.delivery_status not in ('pending','processing') then
    raise exception 'order can no longer be cancelled (delivery is %)', v_order.delivery_status;
  end if;
  if exists (select 1 from public.shipments
             where order_id = p_order_id and direction = 'forward'
               and status in ('picked_up','in_transit','out_for_delivery','delivered','undelivered','rto_initiated','rto_delivered')) then
    raise exception 'shipment already with the courier';
  end if;

  update public.shipments set status = 'cancelled'
   where order_id = p_order_id and direction = 'forward' and status <> 'cancelled';

  if v_order.inventory_status in ('reserved','committed') then
    perform public.restock_order_items(p_order_id);
  end if;

  update public.orders
     set status = 'cancelled', delivery_status = 'cancelled',
         inventory_status = case when inventory_status in ('reserved','committed') then 'released' else inventory_status end,
         payment_status = case when payment_status = 'pending' then 'cancelled' else payment_status end,
         cancelled_at = now(), cancel_reason = left(coalesce(p_reason, 'Cancelled'), 500), cancelled_by = case when p_by = 'customer' then 'customer' else 'admin' end,
         needs_attention = false, attention_reason = null
   where id = p_order_id;

  perform public.log_order_event(p_order_id, case when p_by = 'customer' then 'customer' else 'admin' end, p_actor, 'order_cancelled', v_order.status, 'cancelled', p_reason);

  return jsonb_build_object('cancelled', true, 'alreadyCancelled', false,
    'needsRefund', v_order.payment_status = 'paid');
end;
$fn$;

-- =====================================================================
-- 13. shipments
-- =====================================================================
create or replace function public.begin_shipment(
  p_order_id uuid, p_direction text, p_return_request_id uuid, p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order public.orders%rowtype;
  v_rr public.return_requests%rowtype;
  v_ship public.shipments%rowtype;
  v_attempt integer;
  v_ref text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if p_direction not in ('forward','return') then raise exception 'invalid direction'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if p_direction = 'forward' then
    if v_order.payment_status <> 'paid' or v_order.status = 'cancelled'
       or v_order.inventory_status <> 'committed'
       or v_order.delivery_status not in ('pending','processing') then
      raise exception 'order is not ready to ship';
    end if;
    select * into v_ship from public.shipments
     where order_id = p_order_id and direction = 'forward' and status <> 'cancelled';
  else
    if p_return_request_id is null then raise exception 'return request required'; end if;
    select * into v_rr from public.return_requests
     where id = p_return_request_id and order_id = p_order_id for update;
    if not found then raise exception 'return request not found'; end if;
    if v_rr.status not in ('approved','pickup_scheduled') then raise exception 'return is not approved'; end if;
    select * into v_ship from public.shipments
     where return_request_id = p_return_request_id and direction = 'return' and status <> 'cancelled';
  end if;

  if v_ship.id is not null then
    if v_ship.status = 'failed' or (v_ship.status = 'creating' and v_ship.updated_at < now() - interval '2 minutes') then
      v_attempt := v_ship.attempt + 1;
      v_ref := v_ship.provider_reference;
      if v_ship.provider_order_id is null then
        v_ref := case when p_direction = 'forward'
                      then v_order.order_number || '-' || v_attempt
                      else 'RET-' || v_order.order_number || '-' || v_attempt end;
      end if;
      update public.shipments
         set status = 'creating', attempt = v_attempt, provider_reference = v_ref, error = null
       where id = v_ship.id
       returning * into v_ship;
      return jsonb_build_object('shipmentId', v_ship.id, 'created', false, 'resume', true, 'inProgress', false,
        'status', v_ship.status, 'attempt', v_ship.attempt, 'providerReference', v_ship.provider_reference,
        'providerOrderId', v_ship.provider_order_id, 'providerShipmentId', v_ship.provider_shipment_id,
        'awbCode', v_ship.awb_code);
    end if;

    return jsonb_build_object('shipmentId', v_ship.id, 'created', false, 'resume', false,
      'inProgress', v_ship.status = 'creating', 'status', v_ship.status, 'attempt', v_ship.attempt,
      'providerReference', v_ship.provider_reference, 'providerOrderId', v_ship.provider_order_id,
      'providerShipmentId', v_ship.provider_shipment_id, 'awbCode', v_ship.awb_code);
  end if;

  if p_direction = 'forward' then
    select coalesce(max(attempt), 0) + 1 into v_attempt from public.shipments
     where order_id = p_order_id and direction = 'forward';
    v_ref := case when v_attempt = 1 then v_order.order_number else v_order.order_number || '-' || v_attempt end;
  else
    select coalesce(max(attempt), 0) + 1 into v_attempt from public.shipments
     where return_request_id = p_return_request_id and direction = 'return';
    v_ref := 'RET-' || v_order.order_number || '-' || v_attempt;
  end if;

  insert into public.shipments (order_id, return_request_id, direction, provider_reference, attempt, status, created_by)
  values (p_order_id, case when p_direction = 'return' then p_return_request_id end, p_direction, v_ref, v_attempt, 'creating', p_actor)
  returning * into v_ship;

  perform public.log_order_event(p_order_id, case when p_actor is null then 'system' else 'admin' end, p_actor,
    p_direction || '_shipment_started', null, v_ref, null);

  return jsonb_build_object('shipmentId', v_ship.id, 'created', true, 'resume', false, 'inProgress', false,
    'status', v_ship.status, 'attempt', v_ship.attempt, 'providerReference', v_ship.provider_reference,
    'providerOrderId', null, 'providerShipmentId', null, 'awbCode', null);
end;
$fn$;

create or replace function public.save_shipment_progress(p_shipment_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ship public.shipments%rowtype;
  v_new_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;

  select * into v_ship from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'shipment not found'; end if;

  v_new_status := coalesce(p_patch ->> 'status', v_ship.status);

  update public.shipments set
    provider_order_id    = case when p_patch ? 'provider_order_id'    then p_patch ->> 'provider_order_id'    else provider_order_id end,
    provider_shipment_id = case when p_patch ? 'provider_shipment_id' then p_patch ->> 'provider_shipment_id' else provider_shipment_id end,
    awb_code             = case when p_patch ? 'awb_code'             then nullif(p_patch ->> 'awb_code', '') else awb_code end,
    courier_name         = case when p_patch ? 'courier_name'         then p_patch ->> 'courier_name'         else courier_name end,
    courier_id           = case when p_patch ? 'courier_id'           then p_patch ->> 'courier_id'           else courier_id end,
    tracking_url         = case when p_patch ? 'tracking_url'         then p_patch ->> 'tracking_url'         else tracking_url end,
    label_url            = case when p_patch ? 'label_url'            then p_patch ->> 'label_url'            else label_url end,
    manifest_url         = case when p_patch ? 'manifest_url'         then p_patch ->> 'manifest_url'         else manifest_url end,
    pickup_scheduled_at  = case when p_patch ? 'pickup_scheduled_at'  then nullif(p_patch ->> 'pickup_scheduled_at', '')::timestamptz else pickup_scheduled_at end,
    etd                  = case when p_patch ? 'etd'                  then nullif(p_patch ->> 'etd', '')::timestamptz else etd end,
    error                = case when p_patch ? 'error'                then nullif(p_patch ->> 'error', '')    else error end,
    status               = v_new_status
  where id = p_shipment_id
  returning * into v_ship;

  if v_ship.direction = 'forward' and v_new_status in ('created','awb_assigned','pickup_scheduled') then
    update public.orders set delivery_status = 'processing', status = 'processing'
     where id = v_ship.order_id and delivery_status = 'pending' and status <> 'cancelled';
  end if;

  if v_ship.direction = 'return' and v_new_status = 'pickup_scheduled' then
    update public.return_requests
       set status = 'pickup_scheduled',
           pickup_scheduled_at = coalesce(v_ship.pickup_scheduled_at, pickup_scheduled_at, now())
     where id = v_ship.return_request_id and status = 'approved';
  end if;

  -- a cancelled return pickup puts the return back to 'approved' so a new pickup can be booked
  if v_ship.direction = 'return' and v_new_status = 'cancelled' then
    update public.return_requests set status = 'approved', pickup_scheduled_at = null
     where id = v_ship.return_request_id and status = 'pickup_scheduled';
  end if;

  if v_new_status = 'failed' then
    perform public.log_order_event(v_ship.order_id, 'system', null, v_ship.direction || '_shipment_failed', null, null, v_ship.error);
  end if;

  return jsonb_build_object('shipmentId', v_ship.id, 'status', v_ship.status, 'awbCode', v_ship.awb_code);
end;
$fn$;

create or replace function public.apply_shipping_update(
  p_awb text, p_mapped_status text, p_raw_status text, p_event_time timestamptz,
  p_activity text, p_location text, p_etd timestamptz, p_payload jsonb, p_dedupe_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ship public.shipments%rowtype;
  v_order public.orders%rowtype;
  v_rr public.return_requests%rowtype;
  v_event_id uuid;
  v_time timestamptz := coalesce(p_event_time, now());
  v_new text;
  v_next_delivery text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if p_awb is null or length(btrim(p_awb)) = 0 then raise exception 'awb required'; end if;
  if p_dedupe_key is null or length(p_dedupe_key) < 8 then raise exception 'dedupe key required'; end if;

  select * into v_ship from public.shipments where awb_code = p_awb for update;

  insert into public.shipment_events (shipment_id, awb_code, raw_status, mapped_status, event_time, activity, location, payload, dedupe_key)
  values (v_ship.id, p_awb, p_raw_status, p_mapped_status, v_time, left(p_activity, 500), left(p_location, 200),
          coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('duplicate', true, 'matched', v_ship.id is not null);
  end if;
  if v_ship.id is null then
    return jsonb_build_object('duplicate', false, 'matched', false);
  end if;

  -- unmapped courier text: keep the event, change nothing else
  if p_mapped_status is null then
    update public.shipments
       set raw_status = p_raw_status, etd = coalesce(p_etd, etd),
           last_event_at = greatest(coalesce(last_event_at, v_time), v_time)
     where id = v_ship.id;
    return jsonb_build_object('duplicate', false, 'matched', true, 'applied', false);
  end if;

  -- never walk backwards, never leave a final state
  if v_ship.status in ('delivered','rto_delivered','cancelled','lost') then
    v_new := v_ship.status;
  elsif public.shipment_status_rank(p_mapped_status) >= public.shipment_status_rank(v_ship.status) then
    v_new := p_mapped_status;
  else
    v_new := v_ship.status;
  end if;

  update public.shipments set
    status = v_new,
    raw_status = p_raw_status,
    etd = coalesce(p_etd, etd),
    last_event_at = greatest(coalesce(last_event_at, v_time), v_time),
    picked_up_at = case when v_new in ('picked_up','in_transit','out_for_delivery','delivered') and picked_up_at is null then v_time else picked_up_at end,
    delivered_at = case when v_new = 'delivered' and delivered_at is null then v_time else delivered_at end,
    error = null
  where id = v_ship.id;

  if v_ship.direction = 'forward' then
    select * into v_order from public.orders where id = v_ship.order_id for update;

    v_next_delivery := case v_new
      when 'picked_up' then 'shipped' when 'in_transit' then 'shipped'
      when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
      when 'undelivered' then 'delivery_failed' when 'rto_initiated' then 'rto_initiated'
      when 'rto_delivered' then 'rto_delivered' else null end;

    if v_next_delivery is not null
       and v_order.delivery_status not in ('cancelled','delivered')
       and v_order.delivery_status <> v_next_delivery then
      update public.orders set
        delivery_status = v_next_delivery,
        status = v_next_delivery,
        delivered_at = case when v_next_delivery = 'delivered' then coalesce(delivered_at, v_time) else delivered_at end,
        needs_attention = case when v_next_delivery = 'delivered' then false
                               when v_next_delivery in ('delivery_failed','rto_initiated','rto_delivered') then true
                               else needs_attention end,
        attention_reason = case when v_next_delivery = 'delivered' then null
                                when v_next_delivery = 'delivery_failed' then 'Courier could not deliver (NDR) - contact customer'
                                when v_next_delivery = 'rto_initiated' then 'Parcel is returning to origin'
                                when v_next_delivery = 'rto_delivered' then 'Parcel back at origin - decide refund or re-ship'
                                else attention_reason end
      where id = v_order.id;
      perform public.log_order_event(v_order.id, 'shiprocket', null, 'delivery_status_changed',
        v_order.delivery_status, v_next_delivery, p_activity, jsonb_build_object('awb', p_awb, 'raw', p_raw_status));
    end if;

    if v_new in ('lost','cancelled') and v_ship.status <> v_new then
      update public.orders set needs_attention = true,
        attention_reason = case v_new when 'lost' then 'Courier marked the shipment as lost'
                                      else 'Shipment was cancelled at the courier' end
       where id = v_order.id;
    end if;
  else
    select * into v_rr from public.return_requests where id = v_ship.return_request_id for update;
    if v_new = 'pickup_scheduled' and v_rr.status = 'approved' then
      update public.return_requests set status = 'pickup_scheduled',
             pickup_scheduled_at = coalesce(pickup_scheduled_at, v_time)
       where id = v_rr.id;
    elsif v_new = 'delivered' and v_rr.status in ('approved','pickup_scheduled') then
      update public.return_requests set status = 'received', received_at = coalesce(received_at, v_time)
       where id = v_rr.id;
      perform public.log_order_event(v_rr.order_id, 'shiprocket', null, 'return_received', v_rr.status, 'received', p_activity);
    elsif v_new in ('undelivered','lost','rto_initiated') and v_ship.status <> v_new then
      update public.orders set needs_attention = true, attention_reason = 'Return pickup or transit problem - check return'
       where id = v_ship.order_id;
    end if;
  end if;

  return jsonb_build_object('duplicate', false, 'matched', true, 'applied', true, 'status', v_new,
    'previousStatus', v_ship.status, 'direction', v_ship.direction, 'orderId', v_ship.order_id);
end;
$fn$;

-- =====================================================================
-- 14. refunds
-- =====================================================================
create or replace function public.sync_refund_effects(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ref public.refunds%rowtype;
  v_order public.orders%rowtype;
  v_sum bigint;
begin
  select * into v_ref from public.refunds where id = p_refund_id;
  if not found then return; end if;

  select * into v_order from public.orders where id = v_ref.order_id for update;

  select coalesce(sum(amount_paise), 0) into v_sum
    from public.refunds
   where order_id = v_ref.order_id and payment_id = v_order.razorpay_payment_id and status in ('pending','processed');

  update public.orders
     set refunded_amount = v_sum / 100.0,
         payment_status = case when v_sum >= round(total_amount * 100) then 'refunded' else payment_status end
   where id = v_ref.order_id;

  if v_ref.status = 'failed' then
    update public.orders set needs_attention = true,
      attention_reason = 'A refund failed - check Razorpay and retry' where id = v_ref.order_id;
  end if;

  if v_ref.return_request_id is not null then
    if v_ref.status = 'pending' then
      update public.return_requests
         set status = 'refund_initiated', refund_initiated_at = coalesce(refund_initiated_at, now())
       where id = v_ref.return_request_id and status in ('refund_pending','refund_initiated');
    elsif v_ref.status = 'processed' then
      update public.return_requests
         set status = 'completed', refund_initiated_at = coalesce(refund_initiated_at, now())
       where id = v_ref.return_request_id and status in ('refund_pending','refund_initiated');
    elsif v_ref.status = 'failed' then
      update public.return_requests
         set status = 'refund_pending',
             admin_note = left(coalesce(admin_note || E'\n', '') || 'Refund failed: ' || coalesce(v_ref.error, 'unknown'), 2000)
       where id = v_ref.return_request_id and status in ('refund_pending','refund_initiated');
    end if;
  end if;

  perform public.log_order_event(v_ref.order_id, 'razorpay', null, 'refund_' || v_ref.status, null,
    (v_ref.amount_paise / 100.0)::text, v_ref.error,
    jsonb_build_object('refund_id', v_ref.id, 'razorpay_refund_id', v_ref.razorpay_refund_id, 'reason', v_ref.reason));
end;
$fn$;

create or replace function public.begin_refund(
  p_order_id uuid, p_return_request_id uuid, p_amount_paise bigint, p_reason text, p_actor text,
  p_payment_id text default null, p_payment_max_paise bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order public.orders%rowtype;
  v_rr public.return_requests%rowtype;
  v_existing public.refunds%rowtype;
  v_payment text;
  v_cap bigint;
  v_done bigint;
  v_row public.refunds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if p_amount_paise is null or p_amount_paise <= 0 then raise exception 'invalid refund amount'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;

  v_payment := coalesce(p_payment_id, v_order.razorpay_payment_id);
  if v_payment is null then raise exception 'order has no captured payment'; end if;

  if v_payment = v_order.razorpay_payment_id then
    if v_order.payment_status not in ('paid') then raise exception 'order is not in a refundable state'; end if;
    v_cap := round(v_order.total_amount * 100)::bigint;
  else
    if p_payment_max_paise is null then raise exception 'payment amount required for a different payment'; end if;
    v_cap := p_payment_max_paise;
  end if;

  if p_return_request_id is not null then
    select * into v_rr from public.return_requests
     where id = p_return_request_id and order_id = p_order_id for update;
    if not found then raise exception 'return request not found'; end if;

    select * into v_existing from public.refunds
     where return_request_id = p_return_request_id and status in ('creating','pending','processed');
    if found then
      return jsonb_build_object('refundId', v_existing.id, 'existing', true, 'status', v_existing.status,
        'razorpayRefundId', v_existing.razorpay_refund_id, 'idempotencyKey', v_existing.idempotency_key,
        'paymentId', v_existing.payment_id, 'amountPaise', v_existing.amount_paise);
    end if;

    if v_rr.status <> 'refund_pending' then raise exception 'return is not ready for refund'; end if;
    if v_rr.refund_amount is null or round(v_rr.refund_amount * 100)::bigint <> p_amount_paise then
      raise exception 'refund amount does not match the approved amount';
    end if;
  end if;

  select coalesce(sum(amount_paise), 0) into v_done from public.refunds
   where payment_id = v_payment and status in ('creating','pending','processed');

  if v_done + p_amount_paise > v_cap then
    raise exception 'refund exceeds the refundable amount';
  end if;

  insert into public.refunds (order_id, return_request_id, payment_id, amount_paise, reason, created_by, idempotency_key)
  values (p_order_id, p_return_request_id, v_payment, p_amount_paise, p_reason, coalesce(p_actor, 'system'), 'pending-key')
  returning * into v_row;

  update public.refunds set idempotency_key = 'yb-rfd-' || id::text where id = v_row.id returning * into v_row;

  return jsonb_build_object('refundId', v_row.id, 'existing', false, 'status', v_row.status,
    'razorpayRefundId', null, 'idempotencyKey', v_row.idempotency_key,
    'paymentId', v_row.payment_id, 'amountPaise', v_row.amount_paise);
end;
$fn$;

create or replace function public.finalize_refund(
  p_refund_id uuid, p_razorpay_refund_id text, p_status text, p_speed_processed text, p_error text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_ref public.refunds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if p_status not in ('pending','processed','failed') then raise exception 'invalid refund status'; end if;

  select * into v_ref from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'refund not found'; end if;

  if v_ref.status in ('processed','failed') and v_ref.status <> p_status then
    return jsonb_build_object('refundId', v_ref.id, 'status', v_ref.status, 'ignored', true);
  end if;

  update public.refunds
     set razorpay_refund_id = coalesce(p_razorpay_refund_id, razorpay_refund_id),
         status = p_status,
         speed_processed = coalesce(p_speed_processed, speed_processed),
         error = case when p_status = 'failed' then left(p_error, 500) else null end,
         processed_at = case when p_status = 'processed' then coalesce(processed_at, now()) else processed_at end
   where id = p_refund_id;

  perform public.sync_refund_effects(p_refund_id);
  return jsonb_build_object('refundId', p_refund_id, 'status', p_status, 'ignored', false,
    'previousStatus', v_ref.status, 'orderId', v_ref.order_id);
end;
$fn$;

create or replace function public.apply_refund_update(
  p_razorpay_refund_id text, p_status text, p_speed_processed text, p_error text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_ref public.refunds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;

  select * into v_ref from public.refunds where razorpay_refund_id = p_razorpay_refund_id for update;
  if not found then return jsonb_build_object('matched', false); end if;

  return public.finalize_refund(v_ref.id, p_razorpay_refund_id, p_status, p_speed_processed, p_error)
         || jsonb_build_object('matched', true);
end;
$fn$;

-- =====================================================================
-- 15. lock the new functions to service_role
-- =====================================================================
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.log_order_event(uuid, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.shipment_status_rank(text) from public, anon, authenticated;
revoke all on function public.restock_order_items(uuid) from public, anon, authenticated;
revoke all on function public.expire_unpaid_order(uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_set_delivery_status(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_order_restock(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.begin_shipment(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_shipment_progress(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.apply_shipping_update(text, text, text, timestamptz, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.sync_refund_effects(uuid) from public, anon, authenticated;
revoke all on function public.begin_refund(uuid, uuid, bigint, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.finalize_refund(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_refund_update(text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_order_payment_and_commit_inventory(uuid, text) from public, anon, authenticated;

grant execute on function public.log_order_event(uuid, text, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.shipment_status_rank(text) to service_role;
grant execute on function public.restock_order_items(uuid) to service_role;
grant execute on function public.expire_unpaid_order(uuid, integer) to service_role;
grant execute on function public.admin_set_delivery_status(uuid, text, uuid, text) to service_role;
grant execute on function public.cancel_order_restock(uuid, uuid, text, text) to service_role;
grant execute on function public.begin_shipment(uuid, text, uuid, uuid) to service_role;
grant execute on function public.save_shipment_progress(uuid, jsonb) to service_role;
grant execute on function public.apply_shipping_update(text, text, text, timestamptz, text, text, timestamptz, jsonb, text) to service_role;
grant execute on function public.sync_refund_effects(uuid) to service_role;
grant execute on function public.begin_refund(uuid, uuid, bigint, text, text, text, bigint) to service_role;
grant execute on function public.finalize_refund(uuid, text, text, text, text) to service_role;
grant execute on function public.apply_refund_update(text, text, text, text) to service_role;
grant execute on function public.confirm_order_payment_and_commit_inventory(uuid, text) to service_role;
