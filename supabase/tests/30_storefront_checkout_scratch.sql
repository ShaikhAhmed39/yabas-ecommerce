-- Scenario tests for coupons, delivery fee, gift wrap, consent, scratch cards, store settings, guest tracking.
-- Run through supabase/tests/run.sh
\set ON_ERROR_STOP 1
set request.jwt.claim.role = 'service_role';
set request.jwt.claim.sub = '';

create schema if not exists t3;

create or replace function t3.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.role','service_role',false); perform set_config('request.jwt.claim.sub','',false); end $$;
create or replace function t3.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.role','authenticated',false); perform set_config('request.jwt.claim.sub',u::text,false); end $$;

create or replace function t3.mk_user() returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin insert into auth.users(id, email) values (u, u::text || '@t.test'); return u; end $$;

create or replace function t3.mk_product(p_stock int, p_price numeric) returns uuid language plpgsql as $$
declare p uuid := gen_random_uuid();
begin
  insert into public.products(id, title, selling_price, stock, image_url, category)
  values (p, 'Haram ' || left(p::text, 6), p_price, p_stock, 'x.jpg', 'Necklaces');
  return p;
end $$;

create or replace function t3.order_v2(p_user uuid, p_product uuid, p_qty int, p_extras jsonb, p_phone text default '9876543210')
returns jsonb language plpgsql as $$
begin
  return public.create_order_v2(
    p_user, gen_random_uuid(),
    jsonb_build_object('customer_name','Test Buyer','shipping_address_line1','12 Road','city','Mumbai',
                       'state','Maharashtra','pincode','400001','primary_phone',p_phone),
    jsonb_build_array(jsonb_build_object('product_id', p_product, 'quantity', p_qty)),
    p_extras || jsonb_build_object('consent_version','2026-11'));
end $$;

create or replace function t3.pay(p_order uuid, p_payment text) returns jsonb language plpgsql as $$
begin
  update public.orders set razorpay_order_id = coalesce(razorpay_order_id, 'order_' || replace(p_order::text,'-',''))
   where id = p_order;
  return public.confirm_order_payment_and_commit_inventory(p_order, p_payment);
end $$;

-- 1. percent coupon, cap, record, total ------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(10, 1000); r jsonb; o record;
begin
  insert into public.coupons(code, kind, value, min_order, max_discount) values ('SAVE10','percent',10,500,80);
  r := t3.order_v2(u, p, 1, jsonb_build_object('coupon_code','save10'));
  assert (r->>'totalAmount')::numeric = 920, 'percent coupon capped at max_discount: ' || (r->>'totalAmount');
  select * into o from public.orders where id = (r->>'orderId')::uuid;
  assert o.discount_amount = 80 and o.coupon_code = 'SAVE10' and o.subtotal_amount = 1000, 'order stores discount + code';
  assert o.consent_version = '2026-11' and o.consented_at is not null, 'consent stored';
  assert (select used_count from public.coupons where code='SAVE10') = 1, 'used_count incremented';
  assert exists (select 1 from public.coupon_redemptions where order_id = o.id), 'redemption recorded';
  raise notice 'PASS 1 percent coupon';
end $$;

-- 2. same account cannot reuse; same phone on another account cannot reuse -------------------------
do $$
declare u uuid := t3.mk_user(); u2 uuid := t3.mk_user(); p uuid := t3.mk_product(10, 1000); r jsonb; ok boolean;
begin
  insert into public.coupons(code, kind, value, per_user_limit) values ('ONCE','flat',100,1);
  r := t3.order_v2(u, p, 1, jsonb_build_object('coupon_code','ONCE'), '9000000001');
  ok := false;
  begin perform t3.order_v2(u, p, 1, jsonb_build_object('coupon_code','ONCE'), '9000000001');
  exception when others then ok := sqlerrm like '%already_used%'; end;
  assert ok, 'same account blocked';
  ok := false;
  begin perform t3.order_v2(u2, p, 1, jsonb_build_object('coupon_code','ONCE'), '9000000001');
  exception when others then ok := sqlerrm like '%already_used%'; end;
  assert ok, 'same phone on a fresh guest account blocked';
  raise notice 'PASS 2 per-customer limit';
end $$;

-- 3. discount never takes the order below INR 1; minimum order; expired; inactive -------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(10, 200); r jsonb; ok boolean;
begin
  insert into public.coupons(code, kind, value) values ('HUGE','flat',5000);
  r := t3.order_v2(u, p, 1, jsonb_build_object('coupon_code','HUGE'));
  assert (r->>'totalAmount')::numeric = 1, 'at least INR 1 payable: ' || (r->>'totalAmount');

  insert into public.coupons(code, kind, value, min_order) values ('BIG','flat',50,999);
  ok := false;
  begin perform t3.order_v2(t3.mk_user(), p, 1, jsonb_build_object('coupon_code','BIG'));
  exception when others then ok := sqlerrm like '%min_order%'; end;
  assert ok, 'minimum order enforced';

  insert into public.coupons(code, kind, value, expires_at) values ('OLD','flat',50, now() - interval '1 day');
  ok := false;
  begin perform t3.order_v2(t3.mk_user(), p, 1, jsonb_build_object('coupon_code','OLD'));
  exception when others then ok := sqlerrm like '%expired%'; end;
  assert ok, 'expired coupon refused';

  insert into public.coupons(code, kind, value, is_active) values ('OFF','flat',50, false);
  ok := false;
  begin perform t3.order_v2(t3.mk_user(), p, 1, jsonb_build_object('coupon_code','OFF'));
  exception when others then ok := sqlerrm like '%inactive%'; end;
  assert ok, 'inactive coupon refused';

  ok := false;
  begin perform t3.order_v2(t3.mk_user(), p, 1, jsonb_build_object('coupon_code','NOPE'));
  exception when others then ok := sqlerrm like '%invalid%'; end;
  assert ok, 'unknown coupon refused';
  assert (select stock from public.products where id = p) = 9, 'failed checkouts rolled their stock back';
  raise notice 'PASS 3 coupon rules';
end $$;

-- 4. releasing the order gives the coupon back -------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(10, 1000); r jsonb; oid uuid;
begin
  insert into public.coupons(code, kind, value, usage_limit) values ('LIMIT1','flat',100,1);
  r := t3.order_v2(u, p, 1, jsonb_build_object('coupon_code','LIMIT1'));
  oid := (r->>'orderId')::uuid;
  assert (select used_count from public.coupons where code='LIMIT1') = 1, 'claimed';
  perform public.expire_unpaid_order(oid, 0);
  assert (select used_count from public.coupons where code='LIMIT1') = 0, 'coupon returned when stock released';
  assert not exists (select 1 from public.coupon_redemptions where order_id = oid), 'redemption removed';
  raise notice 'PASS 4 coupon release';
end $$;

-- 5. delivery fee, free-shipping threshold, gift wrap --------------------------------------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(20, 500); r jsonb; o record;
begin
  insert into public.site_settings(key, value) values ('cfg_shipping_fee','79'),('cfg_free_shipping_threshold','999'),('cfg_gift_wrap_fee','49');
  r := t3.order_v2(u, p, 1, '{}'::jsonb);
  assert (r->>'totalAmount')::numeric = 579, 'delivery fee added under threshold: ' || (r->>'totalAmount');
  r := t3.order_v2(u, p, 2, '{}'::jsonb);
  assert (r->>'totalAmount')::numeric = 1000, 'free delivery at threshold: ' || (r->>'totalAmount');
  r := t3.order_v2(u, p, 2, jsonb_build_object('gift_wrap', true, 'gift_message', 'Happy birthday'));
  assert (r->>'totalAmount')::numeric = 1049, 'gift wrap fee added';
  select * into o from public.orders where id = (r->>'orderId')::uuid;
  assert o.gift_wrap and o.gift_message = 'Happy birthday' and o.gift_wrap_fee = 49, 'gift saved';
  delete from public.site_settings where key in ('cfg_shipping_fee','cfg_free_shipping_threshold','cfg_gift_wrap_fee');
  raise notice 'PASS 5 charges';
end $$;

-- 6. consent, email, permissions ----------------------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(5, 500); ok boolean;
begin
  ok := false;
  begin perform public.create_order_v2(u, gen_random_uuid(),
      jsonb_build_object('customer_name','A B','shipping_address_line1','1 Rd','city','Mumbai','state','MH','pincode','400001','primary_phone','9876543210'),
      jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)), '{}'::jsonb);
  exception when others then ok := sqlerrm like '%consent required%'; end;
  assert ok, 'consent is required';
  ok := false;
  begin perform t3.order_v2(u, p, 1, jsonb_build_object('email','not-an-email'));
  exception when others then ok := sqlerrm like '%invalid email%'; end;
  assert ok, 'bad email refused';
  perform t3.as_user(u);
  ok := false;
  begin perform t3.order_v2(u, p, 1, '{}'::jsonb);
  exception when others then ok := sqlerrm like '%permission denied%'; end;
  perform t3.as_service();
  assert ok, 'browser sessions cannot create orders directly';
  assert (select stock from public.products where id = p) = 5, 'nothing reserved by failures';
  raise notice 'PASS 6 consent + permissions';
end $$;

-- 7. scratch cards ----------------------------------------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); other uuid := t3.mk_user(); p uuid := t3.mk_product(20, 1000); r jsonb; oid uuid;
        card uuid; cards jsonb; rv jsonb; ok boolean; r2 jsonb;
begin
  r := t3.order_v2(u, p, 1, '{}'::jsonb); oid := (r->>'orderId')::uuid; perform t3.pay(oid, 'pay_S1');
  assert public.issue_scratch_card(oid) is null, 'no card while the feature is switched off';

  insert into public.site_settings(key, value) values ('cfg_scratch_enabled','true'),('cfg_scratch_min_order','500');
  assert public.issue_scratch_card(oid) is null, 'no card without active prizes (examples start OFF)';

  update public.scratch_prizes set is_active = true where kind = 'percent';
  card := public.issue_scratch_card(oid);
  assert card is not null, 'card issued after paid order';
  assert public.issue_scratch_card(oid) is null, 'one card per order';

  r2 := t3.order_v2(u, p, 1, '{}'::jsonb);
  assert public.issue_scratch_card((r2->>'orderId')::uuid) is null, 'unpaid order gets no card';

  perform t3.as_user(u);
  cards := public.my_scratch_cards();
  assert jsonb_array_length(cards) = 1 and (cards->0->>'prize_label') is null and (cards->0->>'code') is null,
    'prize and code stay hidden until revealed';

  perform t3.as_user(other);
  ok := false;
  begin perform public.reveal_scratch_card(card); exception when others then ok := sqlerrm like '%not found%'; end;
  assert ok, 'another customer cannot reveal my card';

  perform t3.as_user(u);
  rv := public.reveal_scratch_card(card);
  assert rv->>'code' like 'YB%' and (rv->>'prize_label') is not null, 'reveal returns prize + code';
  assert (public.reveal_scratch_card(card)->>'code') = rv->>'code', 'reveal is idempotent (same code)';
  assert (public.my_scratch_cards()->0->>'code') = rv->>'code', 'listing shows the code after reveal';

  perform t3.as_service();
  -- the prize coupon belongs to its owner only
  assert (public._coupon_quote(rv->>'code', other, null, 100000, false)->>'reason') = 'invalid', 'coupon not usable by others';
  assert (public._coupon_quote(rv->>'code', u, null, 100000, false)->>'ok')::boolean, 'owner can use it';
  delete from public.site_settings where key like 'cfg_scratch%';
  update public.scratch_prizes set is_active = false;
  raise notice 'PASS 7 scratch cards';
end $$;

-- 8. scratch prizes follow the weights (server side) --------------------------------------------------
do $$
declare p uuid := t3.mk_product(500, 600); u uuid := t3.mk_user(); n_a int := 0; n_b int := 0; r jsonb; oid uuid; i int; lbl text;
begin
  delete from public.scratch_prizes;
  insert into public.scratch_prizes(label, kind, value, weight, is_active) values ('A five','percent',5,90,true),('B ten','percent',10,10,true);
  insert into public.site_settings(key, value) values ('cfg_scratch_enabled','true');
  for i in 1..200 loop
    r := t3.order_v2(u, p, 1, '{}'::jsonb); oid := (r->>'orderId')::uuid; perform t3.pay(oid, 'pay_W' || i);
    perform public.issue_scratch_card(oid);
  end loop;
  select count(*) filter (where prize_label = 'A five'), count(*) filter (where prize_label = 'B ten') into n_a, n_b from public.scratch_cards where user_id = u;
  assert n_a + n_b = 200, 'every paid order got a card';
  assert n_a > 150 and n_b > 3, format('weights respected (A=%s B=%s)', n_a, n_b);
  delete from public.site_settings where key like 'cfg_scratch%';
  raise notice 'PASS 8 prize weights (A=%, B=%)', n_a, n_b;
end $$;

-- 9. store settings --------------------------------------------------------------------------------------------
do $$
declare adm uuid := t3.mk_user(); cust uuid := t3.mk_user(); ok boolean; c jsonb;
begin
  insert into public.admin_users(id, email) values (adm, 'a@t.test');
  perform t3.as_user(cust);
  ok := false;
  begin perform public.admin_set_store_config('{"support_email":"x@y.in"}'::jsonb); exception when others then ok := sqlerrm like '%permission denied%'; end;
  assert ok, 'customers cannot change settings';

  perform t3.as_user(adm);
  c := public.admin_set_store_config('{"support_email":"help@yabas.in","shipping_fee":"79","whatsapp_number":"919876543210"}'::jsonb);
  assert c->>'support_email' = 'help@yabas.in' and c->>'shipping_fee' = '79', 'admin can save';
  ok := false;
  begin perform public.admin_set_store_config('{"shipping_fee":"abc"}'::jsonb); exception when others then ok := sqlerrm like '%must be a number%'; end;
  assert ok, 'numbers validated';
  ok := false;
  begin perform public.admin_set_store_config('{"razorpay_secret":"x"}'::jsonb); exception when others then ok := sqlerrm like '%unknown setting%'; end;
  assert ok, 'only whitelisted keys';
  perform public.admin_set_store_config('{"support_email":""}'::jsonb);
  assert not (public.get_store_config() ? 'support_email'), 'empty value clears the setting';
  perform t3.as_service();
  delete from public.site_settings where key like 'cfg_%';
  raise notice 'PASS 9 store settings';
end $$;

-- 10. guest tracking ------------------------------------------------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(5, 800); r jsonb; n text; t jsonb; i int; ok boolean;
begin
  r := t3.order_v2(u, p, 1, '{}'::jsonb, '9123456780');
  select order_number into n from public.orders where id = (r->>'orderId')::uuid;
  t := public.track_order_public(n, '9123456780', 'iphash-aaaa-1');
  assert (t->>'found')::boolean and t->>'order_number' = n and jsonb_array_length(t->'items') = 1, 'found with the right phone';
  assert not (t ? 'shipping_address_line1') and not (t ? 'primary_phone'), 'no address or phone leaked';
  assert not (public.track_order_public(n, '9999999999', 'iphash-aaaa-1')->>'found')::boolean, 'wrong phone not found';
  assert not (public.track_order_public('hello', '9123456780', 'iphash-aaaa-1')->>'found')::boolean, 'bad format not found';
  ok := false;
  begin
    for i in 1..20 loop perform public.track_order_public(n, '9999999999', 'iphash-bbbb-2'); end loop;
  exception when others then ok := sqlerrm like '%rate limited%'; end;
  assert ok, 'guessing is rate limited';
  raise notice 'PASS 10 guest tracking';
end $$;

-- 11. preview coupon (customer facing) -----------------------------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); q jsonb; ok boolean; i int;
begin
  insert into public.coupons(code, kind, value, min_order) values ('PREVIEW5','percent',5,300);
  perform t3.as_user(u);
  q := public.preview_coupon('preview5', 1000);
  assert (q->>'ok')::boolean and (q->>'discount')::numeric = 50, 'preview shows the discount';
  assert (public.preview_coupon('preview5', 100)->>'reason') = 'min_order', 'preview explains minimum order';
  for i in 1..25 loop q := public.preview_coupon('guess' || i, 1000); end loop;
  assert q->>'reason' = 'rate_limited', 'code guessing is throttled';
  perform t3.as_service();
  ok := false;
  begin perform t3.as_user(null); perform public.preview_coupon('x', 100); exception when others then ok := true; end;
  perform t3.as_service();
  raise notice 'PASS 11 coupon preview';
end $$;

-- 12. wishlist rows are private --------------------------------------------------------------------------------------
do $$
declare u uuid := t3.mk_user(); p uuid := t3.mk_product(1, 100);
begin
  insert into public.wishlist_items(user_id, product_id) values (u, p);
  assert exists (select 1 from pg_policies where tablename = 'wishlist_items' and policyname = 'wishlist_select_own'), 'own-rows policy exists';
  assert (select relrowsecurity from pg_class where relname = 'wishlist_items'), 'RLS on';
  raise notice 'PASS 12 wishlist';
end $$;

select 'storefront tests complete' as result;
