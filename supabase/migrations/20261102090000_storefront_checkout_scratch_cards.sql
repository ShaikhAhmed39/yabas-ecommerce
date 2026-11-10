-- =====================================================================
-- Storefront upgrade: multi-photo products, wishlist, store settings,
-- coupons, scratch cards, gift options, consent record, guest tracking.
--
-- Safe to run on top of 20261027185229_remote_schema.sql and
-- 20261028090000_production_orders_shipping_refunds.sql.
-- Everything is additive. Nothing existing is dropped or renamed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. helper: is the caller an admin?
-- ---------------------------------------------------------------------
create or replace function public.is_admin_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_users where id = (select auth.uid()))
$$;
revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. products: several photos (the first stays in image_url)
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists gallery_urls text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 2. wishlist (works for signed-in and guest sessions)
-- ---------------------------------------------------------------------
create table if not exists public.wishlist_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.wishlist_items enable row level security;
drop policy if exists wishlist_select_own on public.wishlist_items;
drop policy if exists wishlist_insert_own on public.wishlist_items;
drop policy if exists wishlist_delete_own on public.wishlist_items;
create policy wishlist_select_own on public.wishlist_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy wishlist_insert_own on public.wishlist_items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy wishlist_delete_own on public.wishlist_items for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.wishlist_items from anon;
grant select, insert, delete on public.wishlist_items to authenticated;
grant all on public.wishlist_items to service_role;

-- ---------------------------------------------------------------------
-- 3. store settings: business details, charges and switches.
--    Stored in site_settings under a cfg_ prefix. Only the keys below
--    can be read publicly or written by an admin.
-- ---------------------------------------------------------------------
create or replace function public.store_config_keys()
returns text[] language sql immutable as $$
  select array[
    'legal_name','address','support_email','support_phone','support_hours',
    'whatsapp_number','grievance_name','grievance_email','grievance_phone','gstin',
    'website_url','map_url','instagram_url','facebook_url',
    'processing_time','delivery_estimate','return_shipping_rule','policy_effective_date',
    'shipping_fee','free_shipping_threshold','gift_wrap_fee',
    'scratch_enabled','scratch_min_order','store_pickup_enabled'
  ]
$$;

create or replace function public.get_store_config()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(substr(s.key, 5), s.value), '{}'::jsonb)
  from public.site_settings s
  where s.key like 'cfg\_%' and substr(s.key, 5) = any (public.store_config_keys())
$$;
revoke all on function public.get_store_config() from public;
grant execute on function public.get_store_config() to anon, authenticated, service_role;

create or replace function public.admin_set_store_config(p_values jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  k text;
  v text;
  numeric_keys constant text[] := array['shipping_fee','free_shipping_threshold','gift_wrap_fee','scratch_min_order'];
  bool_keys    constant text[] := array['scratch_enabled','store_pickup_enabled'];
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then raise exception 'invalid settings'; end if;

  for k in select jsonb_object_keys(p_values) loop
    if not (k = any (public.store_config_keys())) then raise exception 'unknown setting %', k; end if;
    v := btrim(coalesce(p_values->>k, ''));
    if length(v) > 500 then raise exception 'setting % is too long', k; end if;
    if k = any (numeric_keys) and v <> '' and (v !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$') then
      raise exception 'setting % must be a number', k;
    end if;
    if k = any (bool_keys) and v not in ('', 'true', 'false') then
      raise exception 'setting % must be true or false', k;
    end if;
    if v = '' then
      delete from public.site_settings where key = 'cfg_' || k;
    else
      insert into public.site_settings (key, value) values ('cfg_' || k, v)
      on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
  return public.get_store_config();
end;
$$;
revoke all on function public.admin_set_store_config(jsonb) from public;
grant execute on function public.admin_set_store_config(jsonb) to authenticated, service_role;

-- internal numeric reader used by the checkout function (not exposed)
create or replace function public._cfg_num(p_key text)
returns numeric language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select nullif(value, '')::numeric from public.site_settings where key = 'cfg_' || p_key), 0)
$$;
revoke all on function public._cfg_num(text) from public;
grant execute on function public._cfg_num(text) to service_role;

-- ---------------------------------------------------------------------
-- 4. orders: gift options, discounts, charges, contact email, consent
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists customer_email   text,
  add column if not exists subtotal_amount  numeric(10,2),
  add column if not exists discount_amount  numeric(10,2) not null default 0,
  add column if not exists shipping_fee     numeric(10,2) not null default 0,
  add column if not exists gift_wrap        boolean not null default false,
  add column if not exists gift_wrap_fee    numeric(10,2) not null default 0,
  add column if not exists gift_message     text,
  add column if not exists coupon_code      text,
  add column if not exists consent_version  text,
  add column if not exists consented_at     timestamptz;

-- ---------------------------------------------------------------------
-- 5. coupons
-- ---------------------------------------------------------------------
create table if not exists public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description   text,
  kind          text not null check (kind in ('percent','flat')),
  value         numeric(10,2) not null check (value > 0),
  min_order     numeric(10,2) not null default 0 check (min_order >= 0),
  max_discount  numeric(10,2) check (max_discount is null or max_discount > 0),
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz,
  usage_limit   integer check (usage_limit is null or usage_limit > 0),
  used_count    integer not null default 0,
  per_user_limit integer not null default 1 check (per_user_limit > 0),
  is_active     boolean not null default true,
  owner_user_id uuid references auth.users(id) on delete cascade,
  source        text not null default 'manual' check (source in ('manual','scratch')),
  created_at    timestamptz not null default now(),
  constraint coupons_percent_range check (kind <> 'percent' or value <= 90)
);
alter table public.coupons enable row level security;
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons for all to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());
revoke all on public.coupons from anon;
grant select, insert, update, delete on public.coupons to authenticated;
grant all on public.coupons to service_role;

create table if not exists public.coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references public.coupons(id) on delete cascade,
  order_id        uuid not null references public.orders(id) on delete cascade,
  user_id         uuid,
  discount_amount numeric(10,2) not null,
  created_at      timestamptz not null default now(),
  unique (coupon_id, order_id)
);
create index if not exists idx_coupon_redemptions_user on public.coupon_redemptions (coupon_id, user_id);
alter table public.coupon_redemptions enable row level security;
drop policy if exists coupon_redemptions_admin_read on public.coupon_redemptions;
create policy coupon_redemptions_admin_read on public.coupon_redemptions for select to authenticated
  using (public.is_admin_user());
revoke all on public.coupon_redemptions from anon;
grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;

-- throttle for coupon guessing
create table if not exists public.coupon_attempts (
  user_id uuid not null,
  bucket  timestamptz not null,
  n       integer not null default 0,
  primary key (user_id, bucket)
);
alter table public.coupon_attempts enable row level security;
revoke all on public.coupon_attempts from anon, authenticated;
grant all on public.coupon_attempts to service_role;

-- Internal quote: validates a code and returns the discount in paise.
-- Never granted to clients directly.
create or replace function public._coupon_quote(
  p_code text, p_user uuid, p_phone text, p_subtotal_paise bigint, p_lock boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c public.coupons%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_used integer;
  v_disc bigint;
begin
  if v_code = '' then return jsonb_build_object('ok', false, 'reason', 'none'); end if;

  if p_lock then
    select * into c from public.coupons where code = v_code for update;
  else
    select * into c from public.coupons where code = v_code;
  end if;

  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if c.owner_user_id is not null and c.owner_user_id is distinct from p_user then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not c.is_active then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  if c.starts_at > now() then return jsonb_build_object('ok', false, 'reason', 'not_started'); end if;
  if c.expires_at is not null and c.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return jsonb_build_object('ok', false, 'reason', 'used_up');
  end if;

  -- per-customer limit: by account and, when known, by phone number
  select count(*) into v_used
  from public.coupon_redemptions r
  left join public.orders o on o.id = r.order_id
  where r.coupon_id = c.id
    and (r.user_id = p_user or (p_phone is not null and o.primary_phone = p_phone));
  if v_used >= c.per_user_limit then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  if p_subtotal_paise < round(c.min_order * 100)::bigint then
    return jsonb_build_object('ok', false, 'reason', 'min_order', 'min_order', c.min_order);
  end if;

  if c.kind = 'percent' then
    v_disc := floor(p_subtotal_paise * c.value / 100)::bigint;
  else
    v_disc := round(c.value * 100)::bigint;
  end if;
  if c.max_discount is not null then v_disc := least(v_disc, round(c.max_discount * 100)::bigint); end if;
  v_disc := least(v_disc, greatest(p_subtotal_paise - 100, 0));   -- always leave at least INR 1 to pay
  if v_disc <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_discount'); end if;

  return jsonb_build_object('ok', true, 'coupon_id', c.id, 'code', c.code, 'kind', c.kind,
    'value', c.value, 'discount_paise', v_disc, 'description', c.description);
end;
$$;
revoke all on function public._coupon_quote(text, uuid, text, bigint, boolean) from public;
grant execute on function public._coupon_quote(text, uuid, text, bigint, boolean) to service_role;

-- Customer-facing preview. The real discount is always recomputed at order creation.
create or replace function public.preview_coupon(p_code text, p_subtotal numeric)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bucket timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 minutes';
  v_n integer;
  q jsonb;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if p_subtotal is null or p_subtotal <= 0 or p_subtotal > 10000000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  insert into public.coupon_attempts (user_id, bucket, n) values (v_uid, v_bucket, 1)
  on conflict (user_id, bucket) do update set n = public.coupon_attempts.n + 1
  returning n into v_n;
  if v_n > 20 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;
  delete from public.coupon_attempts where bucket < now() - interval '1 day';

  q := public._coupon_quote(p_code, v_uid, null, round(p_subtotal * 100)::bigint, false);
  if (q->>'ok')::boolean then
    return jsonb_build_object('ok', true, 'code', q->>'code', 'description', q->>'description',
      'discount', ((q->>'discount_paise')::bigint) / 100.0);
  end if;
  return jsonb_build_object('ok', false, 'reason', q->>'reason', 'min_order', q->'min_order');
end;
$$;
revoke all on function public.preview_coupon(text, numeric) from public;
grant execute on function public.preview_coupon(text, numeric) to authenticated, service_role;

-- A coupon claim is released when its order's stock is released (expired, cancelled, failed).
create or replace function public.release_coupon_on_order_release()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  for r in select coupon_id from public.coupon_redemptions where order_id = new.id loop
    update public.coupons set used_count = greatest(used_count - 1, 0) where id = r.coupon_id;
  end loop;
  delete from public.coupon_redemptions where order_id = new.id;
  return new;
end;
$$;
drop trigger if exists trg_release_coupon on public.orders;
create trigger trg_release_coupon after update of inventory_status on public.orders
  for each row
  when (old.inventory_status is distinct from 'released' and new.inventory_status = 'released')
  execute function public.release_coupon_on_order_release();

-- ---------------------------------------------------------------------
-- 6. order creation v2: wraps the existing reservation function and then
--    applies coupon, delivery fee, gift wrap, email and consent.
--    One transaction: any failure rolls back the stock reservation too.
-- ---------------------------------------------------------------------
create or replace function public.create_order_v2(
  p_user_id uuid, p_checkout_request_id uuid, p_customer jsonb, p_items jsonb, p_extras jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_order public.orders%rowtype;
  v_sub bigint;
  v_disc bigint := 0;
  v_ship bigint := 0;
  v_gift bigint := 0;
  v_total bigint;
  v_coupon text := nullif(btrim(coalesce(p_extras->>'coupon_code', '')), '');
  v_wrap boolean := coalesce((p_extras->>'gift_wrap')::boolean, false);
  v_msg text := nullif(btrim(coalesce(p_extras->>'gift_message', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_extras->>'email', ''))), '');
  v_consent text := nullif(btrim(coalesce(p_extras->>'consent_version', '')), '');
  v_fee numeric;
  v_free_over numeric;
  q jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if v_consent is null or length(v_consent) > 40 then raise exception 'consent required'; end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid email';
  end if;
  if v_msg is not null and length(v_msg) > 200 then raise exception 'gift message too long'; end if;

  v_res := public.create_order_with_inventory_reservation(p_user_id, p_checkout_request_id, p_customer, p_items);
  if coalesce((v_res->>'existing')::boolean, false) then return v_res; end if;

  select * into v_order from public.orders where id = (v_res->>'orderId')::uuid for update;
  v_sub := round(v_order.total_amount * 100)::bigint;

  if v_coupon is not null then
    q := public._coupon_quote(v_coupon, p_user_id, v_order.primary_phone, v_sub, true);
    if not coalesce((q->>'ok')::boolean, false) then
      raise exception 'invalid coupon: %', coalesce(q->>'reason', 'invalid');
    end if;
    v_disc := (q->>'discount_paise')::bigint;
  end if;

  v_fee := public._cfg_num('shipping_fee');
  v_free_over := public._cfg_num('free_shipping_threshold');
  if v_fee > 0 and not (v_free_over > 0 and (v_sub - v_disc) >= round(v_free_over * 100)) then
    v_ship := round(v_fee * 100)::bigint;
  end if;
  if v_wrap then v_gift := round(public._cfg_num('gift_wrap_fee') * 100)::bigint; end if;

  v_total := v_sub - v_disc + v_ship + v_gift;
  if v_total < 100 then raise exception 'minimum online payment amount is INR 1.00'; end if;

  update public.orders set
    subtotal_amount = v_sub / 100.0,
    discount_amount = v_disc / 100.0,
    shipping_fee = v_ship / 100.0,
    gift_wrap = v_wrap,
    gift_wrap_fee = v_gift / 100.0,
    gift_message = case when v_wrap then v_msg else null end,
    coupon_code = case when v_disc > 0 then upper(v_coupon) else null end,
    customer_email = v_email,
    consent_version = v_consent,
    consented_at = now(),
    total_amount = v_total / 100.0
  where id = v_order.id;

  if v_disc > 0 then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, discount_amount)
    values ((q->>'coupon_id')::uuid, v_order.id, p_user_id, v_disc / 100.0);
    update public.coupons set used_count = used_count + 1 where id = (q->>'coupon_id')::uuid;
  end if;

  return jsonb_set(v_res, '{totalAmount}', to_jsonb(v_total / 100.0));
end;
$$;
revoke all on function public.create_order_v2(uuid, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_order_v2(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 7. scratch cards. The prize is chosen on the server when a payment is
--    confirmed, and stays hidden from the browser until the customer
--    reveals it. The browser never decides anything.
-- ---------------------------------------------------------------------
create table if not exists public.scratch_prizes (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (length(label) between 2 and 80),
  kind         text not null check (kind in ('percent','flat')),
  value        numeric(10,2) not null check (value > 0),
  max_discount numeric(10,2) check (max_discount is null or max_discount > 0),
  min_order    numeric(10,2) not null default 0 check (min_order >= 0),
  valid_days   integer not null default 30 check (valid_days between 1 and 365),
  weight       integer not null default 10 check (weight > 0),
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint scratch_percent_range check (kind <> 'percent' or value <= 50)
);
alter table public.scratch_prizes enable row level security;
drop policy if exists scratch_prizes_admin_all on public.scratch_prizes;
create policy scratch_prizes_admin_all on public.scratch_prizes for all to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());
revoke all on public.scratch_prizes from anon;
grant select, insert, update, delete on public.scratch_prizes to authenticated;
grant all on public.scratch_prizes to service_role;

-- Example prizes. They start switched OFF. The owner decides the real ones in Admin > Scratch cards.
insert into public.scratch_prizes (label, kind, value, min_order, weight, is_active)
select * from (values
  ('5% off your next order',  'percent', 5::numeric,  0::numeric, 60, false),
  ('10% off your next order', 'percent', 10::numeric, 0::numeric, 30, false),
  ('Rs 100 off orders above Rs 999', 'flat', 100::numeric, 999::numeric, 10, false)
) v(label, kind, value, min_order, weight, is_active)
where not exists (select 1 from public.scratch_prizes);

create table if not exists public.scratch_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  prize_label  text not null,
  kind         text not null,
  value        numeric(10,2) not null,
  max_discount numeric(10,2),
  min_order    numeric(10,2) not null default 0,
  valid_days   integer not null default 30,
  status       text not null default 'unrevealed' check (status in ('unrevealed','revealed')),
  coupon_id    uuid references public.coupons(id) on delete set null,
  created_at   timestamptz not null default now(),
  revealed_at  timestamptz
);
create index if not exists idx_scratch_cards_user on public.scratch_cards (user_id, created_at desc);
alter table public.scratch_cards enable row level security;
drop policy if exists scratch_cards_admin_read on public.scratch_cards;
create policy scratch_cards_admin_read on public.scratch_cards for select to authenticated
  using (public.is_admin_user());
revoke all on public.scratch_cards from anon;
grant select on public.scratch_cards to authenticated;
grant all on public.scratch_cards to service_role;

create or replace function public.issue_scratch_card(p_order_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders%rowtype;
  v_total_weight integer;
  v_pick numeric;
  v_run integer := 0;
  p public.scratch_prizes%rowtype;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if coalesce((select value from public.site_settings where key = 'cfg_scratch_enabled'), 'false') <> 'true' then
    return null;
  end if;

  select * into o from public.orders where id = p_order_id;
  if not found or o.user_id is null or o.payment_status <> 'paid' then return null; end if;
  if o.total_amount < public._cfg_num('scratch_min_order') then return null; end if;
  if exists (select 1 from public.scratch_cards where order_id = p_order_id) then return null; end if;

  select coalesce(sum(weight), 0) into v_total_weight from public.scratch_prizes where is_active;
  if v_total_weight <= 0 then return null; end if;

  v_pick := random() * v_total_weight;
  for p in select * from public.scratch_prizes where is_active order by id loop
    v_run := v_run + p.weight;
    if v_pick < v_run then exit; end if;
  end loop;

  insert into public.scratch_cards (user_id, order_id, prize_label, kind, value, max_discount, min_order, valid_days)
  values (o.user_id, o.id, p.label, p.kind, p.value, p.max_discount, p.min_order, p.valid_days)
  on conflict (order_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.issue_scratch_card(uuid) from public;
grant execute on function public.issue_scratch_card(uuid) to service_role;

create or replace function public.my_scratch_cards()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'order_number', o.order_number,
    'status', c.status,
    'created_at', c.created_at,
    'prize_label', case when c.status = 'revealed' then c.prize_label end,
    'code', case when c.status = 'revealed' then cp.code end,
    'valid_until', case when c.status = 'revealed' then cp.expires_at end,
    'min_order', case when c.status = 'revealed' then c.min_order end
  ) order by c.created_at desc), '[]'::jsonb)
  from public.scratch_cards c
  join public.orders o on o.id = c.order_id
  left join public.coupons cp on cp.id = c.coupon_id
  where c.user_id = (select auth.uid())
$$;
revoke all on function public.my_scratch_cards() from public;
grant execute on function public.my_scratch_cards() to authenticated, service_role;

create or replace function public.reveal_scratch_card(p_card_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c public.scratch_cards%rowtype;
  v_uid uuid := (select auth.uid());
  v_code text;
  v_coupon uuid;
  v_exp timestamptz;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  select * into c from public.scratch_cards where id = p_card_id and user_id = v_uid for update;
  if not found then raise exception 'card not found'; end if;

  if c.status = 'unrevealed' then
    v_code := 'YB' || substr(upper(replace(gen_random_uuid()::text, '-', '')), 1, 8);
    v_exp := now() + make_interval(days => c.valid_days);
    insert into public.coupons (code, description, kind, value, min_order, max_discount, expires_at,
                                usage_limit, per_user_limit, owner_user_id, source)
    values (v_code, c.prize_label, c.kind, c.value, c.min_order, c.max_discount, v_exp, 1, 1, v_uid, 'scratch')
    returning id into v_coupon;
    update public.scratch_cards set status = 'revealed', coupon_id = v_coupon, revealed_at = now() where id = c.id;
  else
    select cp.code, cp.expires_at into v_code, v_exp from public.coupons cp where cp.id = c.coupon_id;
  end if;

  return jsonb_build_object('id', c.id, 'status', 'revealed', 'prize_label', c.prize_label,
    'code', v_code, 'valid_until', v_exp, 'min_order', c.min_order);
end;
$$;
revoke all on function public.reveal_scratch_card(uuid) from public;
grant execute on function public.reveal_scratch_card(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. guest order tracking (order number + phone). Called only by the
--    track-order edge function. Rate limited per caller.
-- ---------------------------------------------------------------------
create table if not exists public.public_lookup_throttle (
  ip_hash text not null,
  bucket  timestamptz not null,
  n       integer not null default 0,
  primary key (ip_hash, bucket)
);
alter table public.public_lookup_throttle enable row level security;
revoke all on public.public_lookup_throttle from anon, authenticated;
grant all on public.public_lookup_throttle to service_role;

create or replace function public.track_order_public(p_order_number text, p_phone text, p_ip_hash text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 minutes';
  v_n integer;
  o public.orders%rowtype;
  v_ship jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if p_ip_hash is null or length(p_ip_hash) < 8 then raise exception 'invalid request'; end if;

  insert into public.public_lookup_throttle (ip_hash, bucket, n) values (p_ip_hash, v_bucket, 1)
  on conflict (ip_hash, bucket) do update set n = public.public_lookup_throttle.n + 1
  returning n into v_n;
  delete from public.public_lookup_throttle where bucket < now() - interval '1 day';
  if v_n > 15 then raise exception 'rate limited'; end if;

  if p_order_number is null or p_order_number !~* '^YB[0-9]{4,10}$' or p_phone is null or p_phone !~ '^[0-9]{10}$' then
    return jsonb_build_object('found', false);
  end if;

  select * into o from public.orders
  where order_number = upper(p_order_number) and (primary_phone = p_phone or backup_phone = p_phone);
  if not found then return jsonb_build_object('found', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'direction', s.direction, 'status', s.status, 'courier_name', s.courier_name,
      'awb_code', s.awb_code, 'tracking_url', s.tracking_url, 'etd', s.etd, 'delivered_at', s.delivered_at,
      'events', (select coalesce(jsonb_agg(jsonb_build_object(
                    'status', e.mapped_status, 'activity', e.activity, 'location', e.location, 'time', e.event_time)
                  order by e.event_time desc), '[]'::jsonb)
                 from public.shipment_events e where e.shipment_id = s.id)
    ) order by s.created_at desc), '[]'::jsonb)
  into v_ship
  from public.shipments s where s.order_id = o.id and s.status <> 'creating';

  return jsonb_build_object(
    'found', true,
    'order_number', o.order_number,
    'created_at', o.created_at,
    'status', o.status,
    'payment_status', o.payment_status,
    'delivery_status', o.delivery_status,
    'total_amount', o.total_amount,
    'city', o.city,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'title', i.product_title, 'quantity', i.quantity, 'unit_price', i.unit_price)), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id),
    'shipments', v_ship
  );
end;
$$;
revoke all on function public.track_order_public(text, text, text) from public;
grant execute on function public.track_order_public(text, text, text) to service_role;
