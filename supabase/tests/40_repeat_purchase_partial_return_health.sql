-- Scenario tests: buying the same product again later, returning 1 item out of 10, and the admin health check.
-- Run through supabase/tests/run.sh
\set ON_ERROR_STOP 1
set request.jwt.claim.role = 'service_role';
set request.jwt.claim.sub = '';

create schema if not exists t4;

create or replace function t4.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.role','service_role',false); perform set_config('request.jwt.claim.sub','',false); end $$;
create or replace function t4.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.role','authenticated',false); perform set_config('request.jwt.claim.sub',u::text,false); end $$;
create or replace function t4.mk_user() returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin insert into auth.users(id, email) values (u, u::text || '@t.test'); return u; end $$;
create or replace function t4.mk_product(p_stock int, p_price numeric default 800) returns uuid language plpgsql as $$
declare p uuid := gen_random_uuid();
begin
  insert into public.products(id, title, selling_price, stock, image_url, category)
  values (p, 'Necklace ' || left(p::text, 6), p_price, p_stock, 'x.jpg', 'Necklaces');
  return p;
end $$;
create or replace function t4.mk_order(p_user uuid, p_items jsonb) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := public.create_order_with_inventory_reservation(
    p_user, gen_random_uuid(),
    jsonb_build_object('customer_name','Test Buyer','shipping_address_line1','12 Road','city','Pune',
                       'state','Maharashtra','pincode','411001','primary_phone','9876543210'),
    p_items);
  return (r ->> 'orderId')::uuid;
end $$;
create or replace function t4.pay(p_order uuid, p_payment text) returns jsonb language plpgsql as $$
begin
  update public.orders set razorpay_order_id = coalesce(razorpay_order_id, 'order_' || replace(p_order::text,'-',''))
   where id = p_order;
  return public.confirm_order_payment_and_commit_inventory(p_order, p_payment);
end $$;

-- 1. the same customer buys the same necklace again two days later: no "already bought" error --------------------
do $$
declare u uuid := t4.mk_user(); p uuid := t4.mk_product(5); o1 uuid; o2 uuid; r jsonb;
begin
  o1 := t4.mk_order(u, jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)));
  r := t4.pay(o1, 'pay_R1');
  assert (r ->> 'success')::boolean, 'first purchase paid';
  update public.orders set created_at = now() - interval '2 days', paid_at = now() - interval '2 days' where id = o1;

  o2 := t4.mk_order(u, jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1)));
  assert o2 is not null and o2 <> o1, 'second order is a new order';
  r := t4.pay(o2, 'pay_R2');
  assert (r ->> 'success')::boolean, 'second purchase paid';
  assert (select stock from public.products where id = p) = 3, 'stock went down by one each time';
  raise notice 'PASS 1 repeat purchase of the same product';
end $$;

-- 2. a customer who bought 10 different items can ask to return just one ------------------------------------------
do $$
declare u uuid := t4.mk_user(); items jsonb := '[]'::jsonb; ps uuid[] := '{}'; p uuid; o uuid; ids uuid[]; i int; c int;
begin
  for i in 1..10 loop
    p := t4.mk_product(3); ps := ps || p;
    items := items || jsonb_build_array(jsonb_build_object('product_id', p, 'quantity', 1));
  end loop;
  o := t4.mk_order(u, items);
  perform t4.pay(o, 'pay_R3');
  select count(*) into c from public.order_items where order_id = o;
  assert c = 10, 'all 10 items are stored on the order: ' || c;

  update public.orders set delivery_status = 'delivered', delivered_at = now() where id = o;
  select array_agg(id order by id) into ids from public.order_items where order_id = o;

  insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status)
  values (o, ids[3], u, 'Wrong size', 'The necklace is too short for me.', 'requested');
  -- the same item cannot be returned twice, but any of the other 9 still can
  begin
    insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status)
    values (o, ids[3], u, 'Wrong size', 'The necklace is too short for me.', 'requested');
    assert false, 'duplicate return for the same item must be blocked';
  exception when unique_violation then null; end;
  insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status)
  values (o, ids[7], u, 'Colour', 'The colour is different from the photo.', 'requested');
  assert (select count(*) from public.return_requests where order_id = o) = 2, 'two separate returns on one order';
  raise notice 'PASS 2 return one item out of ten';
end $$;

-- 3. admin health check: admins only, read-only, sensible numbers ---------------------------------------------------
do $$
declare adm uuid := t4.mk_user(); cust uuid := t4.mk_user(); ok boolean := false; h jsonb;
begin
  insert into public.admin_users(id, email) values (adm, 'health@t.test');
  perform t4.as_user(cust);
  begin perform public.admin_system_health(); exception when others then ok := sqlerrm like '%permission denied%'; end;
  assert ok, 'customers cannot read the health check';
  perform t4.as_user(adm);
  h := public.admin_system_health();
  assert (h ->> 'db_size_mb')::numeric > 0, 'database size reported';
  assert h ? 'paid_not_shipped_48h' and h ? 'refunds_failed' and h ? 'timer_installed', 'expected fields present';
  perform t4.as_service();
  raise notice 'PASS 3 admin health check';
end $$;
