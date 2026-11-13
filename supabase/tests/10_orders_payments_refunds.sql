-- Scenario tests for checkout, expiry, late/duplicate payments, cancellation and refunds.
-- Run through supabase/tests/run.sh (needs a scratch Postgres; see that file).
\set ON_ERROR_STOP 1
set request.jwt.claim.role = 'service_role';

create schema if not exists t;

create or replace function t.mk_user() returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin insert into auth.users(id, email) values (u, u::text || '@t.test'); return u; end $$;

create or replace function t.mk_product(p_stock int, p_price numeric default 500) returns uuid language plpgsql as $$
declare p uuid := gen_random_uuid();
begin
  insert into public.products(id, title, selling_price, stock, image_url, category)
  values (p, 'Test ring ' || left(p::text, 6), p_price, p_stock, 'x.jpg', 'Rings');
  return p;
end $$;

create or replace function t.mk_order(p_user uuid, p_product uuid, p_qty int) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := public.create_order_with_inventory_reservation(
    p_user, gen_random_uuid(),
    jsonb_build_object('customer_name','Test Buyer','shipping_address_line1','12 Road','city','Mumbai',
                       'state','Maharashtra','pincode','400001','primary_phone','9876543210'),
    jsonb_build_array(jsonb_build_object('product_id', p_product, 'quantity', p_qty)));
  return (r ->> 'orderId')::uuid;
end $$;

-- pays an order (attaches a razorpay order id first, like create-razorpay-order does)
create or replace function t.pay(p_order uuid, p_payment text) returns jsonb language plpgsql as $$
begin
  update public.orders set razorpay_order_id = coalesce(razorpay_order_id, 'order_' || replace(p_order::text,'-',''))
   where id = p_order;
  return public.confirm_order_payment_and_commit_inventory(p_order, p_payment);
end $$;

create or replace function t.stock(p_product uuid) returns int language sql as
$$ select stock from public.products where id = p_product $$;

-- 1. happy path --------------------------------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; r jsonb; n text;
begin
  o := t.mk_order(u, p, 2);
  assert t.stock(p) = 3, 'stock reserved at checkout';
  select order_number into n from public.orders where id = o;
  assert n ~ '^YB[0-9]{6}$', 'order number format: ' || n;

  r := t.pay(o, 'pay_T1');
  assert (r ->> 'success')::boolean and (r ->> 'inventoryStatus') = 'committed', 'paid + committed';
  r := public.confirm_order_payment_and_commit_inventory(o, 'pay_T1');
  assert (r ->> 'alreadyProcessed')::boolean, 'same payment again is idempotent';
  assert t.stock(p) = 3, 'stock not decremented twice';
  assert exists (select 1 from public.order_events where order_id = o and event_type = 'payment_captured'), 'audit row';
  raise notice 'PASS 1 happy path';
end $$;

-- 2. abandoned checkout expires and gives stock back --------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(4); o uuid; r jsonb;
begin
  o := t.mk_order(u, p, 3);
  assert t.stock(p) = 1;
  r := public.expire_unpaid_order(o, 30);
  assert not (r ->> 'expired')::boolean and r ->> 'reason' = 'too_recent', 'fresh order is not expired';

  update public.orders set created_at = now() - interval '2 hours' where id = o;
  r := public.expire_unpaid_order(o, 30);
  assert (r ->> 'expired')::boolean, 'old unpaid order expires';
  assert t.stock(p) = 4, 'stock restored';
  assert (select payment_status from public.orders where id = o) = 'cancelled';
  r := public.expire_unpaid_order(o, 30);
  assert not (r ->> 'expired')::boolean, 'second expiry is a no-op';
  assert t.stock(p) = 4, 'stock not restored twice';
  raise notice 'PASS 2 stock expiry';
end $$;

-- 3. late payment, stock still there -> order recovered ------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(3); o uuid; r jsonb;
begin
  o := t.mk_order(u, p, 1);
  update public.orders set created_at = now() - interval '2 hours' where id = o;
  perform public.expire_unpaid_order(o, 30);
  assert t.stock(p) = 3;
  r := t.pay(o, 'pay_T3');
  assert (r ->> 'success')::boolean and (r ->> 'recovered')::boolean, 'late payment recovered';
  assert t.stock(p) = 2, 'stock taken again';
  assert (select status from public.orders where id = o) = 'pending', 'order is live again';
  assert (select cancelled_at from public.orders where id = o) is null;
  raise notice 'PASS 3 late payment recovered';
end $$;

-- 4. late payment, item sold out meanwhile -> refund required, then refunded ---------------------
do $$
declare u uuid := t.mk_user(); u2 uuid := t.mk_user(); p uuid := t.mk_product(1); o uuid; o2 uuid; r jsonb; rf jsonb;
begin
  o := t.mk_order(u, p, 1);
  update public.orders set created_at = now() - interval '2 hours' where id = o;
  perform public.expire_unpaid_order(o, 30);
  o2 := t.mk_order(u2, p, 1);                       -- someone else grabs the last piece
  assert t.stock(p) = 0;

  r := t.pay(o, 'pay_T4');
  assert not (r ->> 'success')::boolean and (r ->> 'needsRefund')::boolean, 'needs refund';
  assert (select payment_status from public.orders where id = o) = 'paid', 'money is in';
  assert (select status from public.orders where id = o) = 'cancelled', 'order stays cancelled';
  assert (select needs_attention from public.orders where id = o), 'flagged for admin';
  assert t.stock(p) = 0, 'stock untouched';

  r := t.pay(o, 'pay_T4');                          -- retried webhook
  assert (r ->> 'needsRefund')::boolean and (r ->> 'alreadyProcessed')::boolean, 'idempotent';

  rf := public.begin_refund(o, null, 50000, 'late_payment', 'system');
  assert not (rf ->> 'existing')::boolean;
  perform public.finalize_refund((rf ->> 'refundId')::uuid, 'rfnd_T4', 'processed', 'normal', null);
  assert (select payment_status from public.orders where id = o) = 'refunded', 'fully refunded';
  assert (select refunded_amount from public.orders where id = o) = 500.00;
  raise notice 'PASS 4 late payment with no stock -> refund';
end $$;

-- 5. duplicate payment on an already paid order ---------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; r jsonb; rf jsonb;
begin
  o := t.mk_order(u, p, 1);
  perform t.pay(o, 'pay_T5a');
  r := public.confirm_order_payment_and_commit_inventory(o, 'pay_T5b');
  assert not (r ->> 'success')::boolean and (r ->> 'duplicatePayment')::boolean, 'duplicate detected';
  assert (select razorpay_payment_id from public.orders where id = o) = 'pay_T5a', 'original payment kept';

  rf := public.begin_refund(o, null, 50000, 'duplicate_payment', 'system', 'pay_T5b', 50000);
  perform public.finalize_refund((rf ->> 'refundId')::uuid, 'rfnd_T5', 'processed', 'normal', null);
  assert (select payment_status from public.orders where id = o) = 'paid', 'original order stays paid';
  assert (select refunded_amount from public.orders where id = o) = 0, 'refund belongs to the other payment';

  begin
    perform public.begin_refund(o, null, 50000, 'duplicate_payment', 'system', 'pay_T5b', 50000);
    assert false, 'second refund of the same duplicate must fail';
  exception when raise_exception then
    assert sqlerrm like 'refund exceeds%', 'cap per payment: ' || sqlerrm;
  end;
  raise notice 'PASS 5 duplicate payment';
end $$;

-- 6. return refund lifecycle + caps -----------------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5, 1000); o uuid; item uuid; rr uuid; rf jsonb; rf2 jsonb; r jsonb;
begin
  o := t.mk_order(u, p, 1);
  perform t.pay(o, 'pay_T6');
  update public.orders set delivery_status = 'delivered', status = 'delivered', delivered_at = now() where id = o;
  select id into item from public.order_items where order_id = o;
  insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status, refund_amount)
  values (o, item, u, 'Damaged', 'Arrived damaged in the box', 'refund_pending', 300) returning id into rr;

  begin
    perform public.begin_refund(o, rr, 40000, 'return', 'admin');
    assert false, 'amount must match the approved amount';
  exception when raise_exception then
    assert sqlerrm like 'refund amount does not match%', sqlerrm;
  end;

  rf := public.begin_refund(o, rr, 30000, 'return', 'admin');
  rf2 := public.begin_refund(o, rr, 30000, 'return', 'admin');
  assert (rf2 ->> 'existing')::boolean and rf2 ->> 'refundId' = rf ->> 'refundId', 'no second refund row';
  assert rf ->> 'idempotencyKey' = 'yb-rfd-' || (rf ->> 'refundId'), 'idempotency key format';
  assert length(rf ->> 'idempotencyKey') >= 10, 'razorpay needs >= 10 chars';

  perform public.finalize_refund((rf ->> 'refundId')::uuid, 'rfnd_T6', 'pending', null, null);
  assert (select status from public.return_requests where id = rr) = 'refund_initiated';
  assert (select refunded_amount from public.orders where id = o) = 300;

  r := public.apply_refund_update('rfnd_T6', 'processed', 'normal', null);
  assert (r ->> 'matched')::boolean;
  assert (select status from public.return_requests where id = rr) = 'completed', 'return completes';
  assert (select payment_status from public.orders where id = o) = 'paid', 'partial refund keeps order paid';

  r := public.apply_refund_update('rfnd_T6', 'failed', null, 'late flip');
  assert (r ->> 'ignored')::boolean, 'processed is final';
  r := public.apply_refund_update('rfnd_UNKNOWN', 'processed', null, null);
  assert not (r ->> 'matched')::boolean, 'dashboard refunds we do not know are ignored';

  begin
    perform public.begin_refund(o, null, 80000, 'admin', 'admin');
    assert false, 'must not refund more than was paid';
  exception when raise_exception then
    assert sqlerrm like 'refund exceeds%', sqlerrm;
  end;
  rf := public.begin_refund(o, null, 70000, 'admin', 'admin');
  perform public.finalize_refund((rf ->> 'refundId')::uuid, 'rfnd_T6b', 'processed', 'normal', null);
  assert (select payment_status from public.orders where id = o) = 'refunded', 'fully refunded';
  raise notice 'PASS 6 refund lifecycle';
end $$;

-- 7. failed refund goes back to refund_pending ---------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5, 1000); o uuid; item uuid; rr uuid; rf jsonb;
begin
  o := t.mk_order(u, p, 1);
  perform t.pay(o, 'pay_T7');
  select id into item from public.order_items where order_id = o;
  insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status, refund_amount)
  values (o, item, u, 'Damaged', 'Arrived damaged in the box', 'refund_pending', 1000) returning id into rr;
  rf := public.begin_refund(o, rr, 100000, 'return', 'admin');
  perform public.finalize_refund((rf ->> 'refundId')::uuid, null, 'failed', null, 'BAD_REQUEST');
  assert (select status from public.return_requests where id = rr) = 'refund_pending', 'can retry';
  assert (select needs_attention from public.orders where id = o), 'admin alerted';
  rf := public.begin_refund(o, rr, 100000, 'return', 'admin');      -- retry allowed after a failure
  assert not (rf ->> 'existing')::boolean, 'a failed refund does not block a retry';
  raise notice 'PASS 7 failed refund retry';
end $$;

-- 8. cancelling a paid order restocks it -----------------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; r jsonb;
begin
  o := t.mk_order(u, p, 2);
  perform t.pay(o, 'pay_T8');
  assert t.stock(p) = 3;
  r := public.cancel_order_restock(o, null, 'customer asked');
  assert (r ->> 'cancelled')::boolean and (r ->> 'needsRefund')::boolean;
  assert t.stock(p) = 5, 'stock back';
  r := public.cancel_order_restock(o, null, 'again');
  assert (r ->> 'alreadyCancelled')::boolean and t.stock(p) = 5, 'idempotent';
  assert (select inventory_status from public.orders where id = o) = 'released';
  raise notice 'PASS 8 cancel + restock';
end $$;

-- 8b. customer-initiated cancel is recorded as the customer's, and is refused once the parcel moves -------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; o2 uuid; r jsonb;
begin
  o := t.mk_order(u, p, 1);
  perform t.pay(o, 'pay_T8B');
  r := public.cancel_order_restock(o, u, 'changed my mind', 'customer');
  assert (r ->> 'cancelled')::boolean;
  assert (select cancelled_by from public.orders where id = o) = 'customer';
  assert exists (select 1 from public.order_events where order_id = o and event_type = 'order_cancelled' and actor_type = 'customer');

  o2 := t.mk_order(u, p, 1);
  perform t.pay(o2, 'pay_T8C');
  update public.orders set delivery_status = 'shipped', status = 'shipped' where id = o2;
  begin perform public.cancel_order_restock(o2, u, 'too late', 'customer'); assert false, 'must refuse';
  exception when others then assert sqlerrm like '%can no longer be cancelled%', sqlerrm; end;
  raise notice 'PASS 8b customer cancel';
end $$;

-- 9. delivery state machine ----------------------------------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; o2 uuid; d1 timestamptz; d2 timestamptz;
begin
  o := t.mk_order(u, p, 1);
  begin
    perform public.admin_set_delivery_status(o, 'shipped', null);
    assert false, 'unpaid order cannot ship';
  exception when raise_exception then assert sqlerrm like 'order is not paid%', sqlerrm; end;

  perform t.pay(o, 'pay_T9');
  begin
    perform public.admin_set_delivery_status(o, 'delivered', null);   -- allowed from processing only; order is pending
    assert false, 'pending -> delivered is not allowed';
  exception when raise_exception then assert sqlerrm like 'cannot move delivery%', sqlerrm; end;

  perform public.admin_set_delivery_status(o, 'processing', null);
  perform public.admin_set_delivery_status(o, 'shipped', null);
  perform public.admin_set_delivery_status(o, 'delivered', null);
  select delivered_at into d1 from public.orders where id = o;
  assert d1 is not null;
  begin
    perform public.admin_set_delivery_status(o, 'shipped', null);
    assert false, 'delivered is final';
  exception when raise_exception then assert sqlerrm like 'cannot move delivery%', sqlerrm; end;
  select delivered_at into d2 from public.orders where id = o;
  assert d1 = d2, 'return window start is never reset';

  begin
    perform public.admin_set_delivery_status(o, 'cancelled', null);
    assert false, 'cancel must go through cancel_order_restock';
  exception when raise_exception then assert sqlerrm like 'invalid delivery status%', sqlerrm; end;
  raise notice 'PASS 9 delivery state machine';
end $$;

-- 10. a return request for the same item cannot be duplicated ----------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; item uuid;
begin
  o := t.mk_order(u, p, 1);
  perform t.pay(o, 'pay_T10');
  select id into item from public.order_items where order_id = o;
  perform public.create_return_request(u, o, item, 1, 'Damaged', 'Arrived damaged in the box');
  begin
    perform public.create_return_request(u, o, item, 1, 'Damaged', 'Double click second request');
    assert false, 'duplicate must be rejected';
  exception when others then assert sqlerrm like '%exceeds purchase%', 'wrong error: ' || sqlerrm; end;
  update public.return_requests set status = 'rejected' where order_item_id = item;
  perform public.create_return_request(u, o, item, 1, 'Wrong item', 'New request after a rejection');
  raise notice 'PASS 10 duplicate returns blocked';
end $$;
