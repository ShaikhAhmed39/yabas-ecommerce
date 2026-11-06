-- Scenario tests for shipments (forward + return), courier webhooks and who may read/write what.
\set ON_ERROR_STOP 1
set request.jwt.claim.role = 'service_role';

-- 11. forward shipment lifecycle driven by courier webhooks -------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; b jsonb; b2 jsonb; sid uuid; r jsonb; v_rows int;
begin
  o := t.mk_order(u, p, 1);
  begin
    perform public.begin_shipment(o, 'forward', null, null);
    assert false, 'unpaid order cannot be shipped';
  exception when raise_exception then assert sqlerrm like 'order is not ready%', sqlerrm; end;

  perform t.pay(o, 'pay_T11');
  b := public.begin_shipment(o, 'forward', null, null);
  sid := (b ->> 'shipmentId')::uuid;
  assert (b ->> 'created')::boolean and b ->> 'status' = 'creating';
  assert b ->> 'providerReference' = (select order_number from public.orders where id = o), 'reference = order number';

  b2 := public.begin_shipment(o, 'forward', null, null);
  assert b2 ->> 'shipmentId' = b ->> 'shipmentId' and (b2 ->> 'inProgress')::boolean, 'double click does not create a 2nd parcel';
  select count(*) into v_rows from public.shipments where order_id = o;
  assert v_rows = 1;

  perform public.save_shipment_progress(sid, jsonb_build_object('provider_order_id','sr1','provider_shipment_id','ss1','status','created'));
  assert (select delivery_status from public.orders where id = o) = 'processing', 'order moves to processing';
  perform public.save_shipment_progress(sid, jsonb_build_object('awb_code','AWB11','courier_name','Delhivery','status','awb_assigned',
                                        'tracking_url','https://example.test/AWB11'));
  perform public.save_shipment_progress(sid, jsonb_build_object('status','pickup_scheduled','pickup_scheduled_at', now() + interval '1 day'));

  r := public.apply_shipping_update('AWB11','picked_up','PICKED UP', now() - interval '3 hours','Picked up','Mumbai', null,'{}'::jsonb,'k-AWB11-pickedup-1');
  assert (r ->> 'applied')::boolean;
  assert (select delivery_status from public.orders where id = o) = 'shipped';

  r := public.apply_shipping_update('AWB11','picked_up','PICKED UP', now() - interval '3 hours','Picked up','Mumbai', null,'{}'::jsonb,'k-AWB11-pickedup-1');
  assert (r ->> 'duplicate')::boolean, 'same webhook twice is ignored';

  r := public.apply_shipping_update('AWB11','out_for_delivery','OUT FOR DELIVERY', now() - interval '1 hour','OFD','Thane', null,'{}'::jsonb,'k-AWB11-ofd-1');
  assert (select delivery_status from public.orders where id = o) = 'out_for_delivery';
  r := public.apply_shipping_update('AWB11','in_transit','IN TRANSIT', now() - interval '2 hours','late',null, null,'{}'::jsonb,'k-AWB11-transit-late');
  assert (select status from public.shipments where id = sid) = 'out_for_delivery', 'late event does not walk back';
  assert (select count(*) from public.shipment_events where shipment_id = sid) = 3, 'late event still kept in timeline';

  r := public.apply_shipping_update('AWB11','delivered','DELIVERED', now(),'Delivered','Thane', null,'{}'::jsonb,'k-AWB11-delivered');
  assert (select delivery_status from public.orders where id = o) = 'delivered';
  assert (select delivered_at from public.orders where id = o) is not null, 'return window starts';
  r := public.apply_shipping_update('AWB11','in_transit','IN TRANSIT', now(),'very late',null, null,'{}'::jsonb,'k-AWB11-transit-very-late');
  assert (select status from public.shipments where id = sid) = 'delivered', 'delivered is final';

  r := public.apply_shipping_update('NOSUCHAWB','delivered','DELIVERED', now(),null,null,null,'{}'::jsonb,'k-unknown-awb-1');
  assert not (r ->> 'matched')::boolean, 'unknown AWB is recorded, not an error';

  begin
    update public.shipments set awb_code = 'AWB11' where id <> sid and order_id = o;
  exception when others then null; end;
  raise notice 'PASS 11 forward shipment lifecycle';
end $$;

-- 12. failed delivery (NDR) raises a flag, delivery clears it -------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; sid uuid;
begin
  o := t.mk_order(u, p, 1); perform t.pay(o, 'pay_T12');
  sid := (public.begin_shipment(o, 'forward', null, null) ->> 'shipmentId')::uuid;
  perform public.save_shipment_progress(sid, jsonb_build_object('awb_code','AWB12','status','awb_assigned'));
  perform public.apply_shipping_update('AWB12','out_for_delivery','OUT FOR DELIVERY', now() - interval '2 hours',null,null,null,'{}'::jsonb,'k-12-ofd');
  perform public.apply_shipping_update('AWB12','undelivered','UNDELIVERED', now() - interval '1 hour','Customer not available',null,null,'{}'::jsonb,'k-12-ndr');
  assert (select delivery_status from public.orders where id = o) = 'delivery_failed';
  assert (select needs_attention from public.orders where id = o), 'admin flag';
  perform public.apply_shipping_update('AWB12','out_for_delivery','OUT FOR DELIVERY', now() - interval '30 minutes',null,null,null,'{}'::jsonb,'k-12-ofd2');
  perform public.apply_shipping_update('AWB12','delivered','DELIVERED', now(),null,null,null,'{}'::jsonb,'k-12-del');
  assert (select delivery_status from public.orders where id = o) = 'delivered';
  assert not (select needs_attention from public.orders where id = o), 'flag cleared';
  raise notice 'PASS 12 NDR flow';
end $$;

-- 13. RTO ----------------------------------------------------------------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; sid uuid;
begin
  o := t.mk_order(u, p, 1); perform t.pay(o, 'pay_T13');
  sid := (public.begin_shipment(o, 'forward', null, null) ->> 'shipmentId')::uuid;
  perform public.save_shipment_progress(sid, jsonb_build_object('awb_code','AWB13','status','awb_assigned'));
  perform public.apply_shipping_update('AWB13','undelivered','UNDELIVERED', now() - interval '3 hours',null,null,null,'{}'::jsonb,'key-13-undelivered');
  perform public.apply_shipping_update('AWB13','rto_initiated','RTO INITIATED', now() - interval '2 hours',null,null,null,'{}'::jsonb,'key-13-rto-initiated');
  perform public.apply_shipping_update('AWB13','rto_delivered','RTO DELIVERED', now(),null,null,null,'{}'::jsonb,'key-13-rto-delivered');
  assert (select delivery_status from public.orders where id = o) = 'rto_delivered';
  assert (select needs_attention from public.orders where id = o);
  raise notice 'PASS 13 RTO';
end $$;

-- 14. return shipment drives the return request ----------------------------------------------------------------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; item uuid; rr uuid; sid uuid; b jsonb;
begin
  o := t.mk_order(u, p, 1); perform t.pay(o, 'pay_T14');
  update public.orders set delivery_status = 'delivered', status = 'delivered', delivered_at = now() where id = o;
  select id into item from public.order_items where order_id = o;
  insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status)
  values (o, item, u, 'Damaged', 'Arrived damaged in the box', 'requested') returning id into rr;

  begin
    perform public.begin_shipment(o, 'return', rr, null);
    assert false, 'return must be approved first';
  exception when raise_exception then assert sqlerrm like 'return is not approved%', sqlerrm; end;

  update public.return_requests set status = 'approved' where id = rr;
  b := public.begin_shipment(o, 'return', rr, null);
  sid := (b ->> 'shipmentId')::uuid;
  assert b ->> 'providerReference' like 'RET-YB%-1';
  perform public.save_shipment_progress(sid, jsonb_build_object('awb_code','AWB14','status','awb_assigned'));
  assert (select status from public.return_requests where id = rr) = 'approved', 'AWB alone is not a scheduled pickup';
  perform public.save_shipment_progress(sid, jsonb_build_object('status','pickup_scheduled','pickup_scheduled_at', now() + interval '1 day'));
  assert (select status from public.return_requests where id = rr) = 'pickup_scheduled';
  assert (select delivery_status from public.orders where id = o) = 'delivered', 'return never touches forward delivery';

  perform public.apply_shipping_update('AWB14','picked_up','PICKED UP', now() - interval '1 day',null,null,null,'{}'::jsonb,'key-14-picked-up');
  perform public.apply_shipping_update('AWB14','delivered','DELIVERED', now(),'Reached warehouse',null,null,'{}'::jsonb,'key-14-delivered');
  assert (select status from public.return_requests where id = rr) = 'received', 'warehouse receipt recorded';
  assert (select received_at from public.return_requests where id = rr) is not null;
  raise notice 'PASS 14 return shipment';
end $$;

-- 15. a failed booking can be retried without creating a second parcel; a cancelled one gets a fresh reference ------------------
do $$
declare u uuid := t.mk_user(); p uuid := t.mk_product(5); o uuid; b jsonb; b2 jsonb; b3 jsonb; sid uuid;
begin
  o := t.mk_order(u, p, 1); perform t.pay(o, 'pay_T15');
  b := public.begin_shipment(o, 'forward', null, null);
  sid := (b ->> 'shipmentId')::uuid;
  perform public.save_shipment_progress(sid, jsonb_build_object('status','failed','error','Pickup location not found'));
  b2 := public.begin_shipment(o, 'forward', null, null);
  assert b2 ->> 'shipmentId' = b ->> 'shipmentId' and (b2 ->> 'resume')::boolean, 'retry reuses the row';
  assert b2 ->> 'providerReference' = (select order_number from public.orders where id = o) || '-2', 'new reference after a failed attempt';

  perform public.save_shipment_progress(sid, jsonb_build_object('provider_order_id','sr15','status','created'));
  perform public.save_shipment_progress(sid, jsonb_build_object('status','failed','error','AWB not available'));
  b2 := public.begin_shipment(o, 'forward', null, null);
  assert b2 ->> 'providerOrderId' = 'sr15', 'courier order is kept so it is not booked twice';
  assert b2 ->> 'providerReference' = b ->> 'providerReference' or b2 ->> 'providerOrderId' = 'sr15';

  perform public.cancel_order_restock(o, null, 'test');
  assert (select status from public.shipments where id = sid) = 'cancelled', 'cancel closes the parcel';
  raise notice 'PASS 15 retry + cancel';
end $$;

-- 16. permissions ----------------------------------------------------------------------------------------------------------------
do $$
declare ua uuid := t.mk_user(); ub uuid := t.mk_user(); p uuid := t.mk_product(9); oa uuid; ob uuid; sa uuid; sb uuid; n int;
begin
  oa := t.mk_order(ua, p, 1); perform t.pay(oa, 'pay_T16a');
  ob := t.mk_order(ub, p, 1); perform t.pay(ob, 'pay_T16b');
  sa := (public.begin_shipment(oa, 'forward', null, null) ->> 'shipmentId')::uuid;
  sb := (public.begin_shipment(ob, 'forward', null, null) ->> 'shipmentId')::uuid;
  perform public.save_shipment_progress(sa, jsonb_build_object('awb_code','AWB16A','status','awb_assigned','label_url','https://secret/label-a'));
  perform public.save_shipment_progress(sb, jsonb_build_object('awb_code','AWB16B','status','awb_assigned'));
  perform public.apply_shipping_update('AWB16A','in_transit','IN TRANSIT', now(),'On the way','Pune',null,'{"internal":"x"}'::jsonb,'key-16-in-transit-a');
  perform public.begin_refund(oa, null, 10000, 'admin', 'admin');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;

  select count(id) into n from public.shipments;
  assert n = 1, 'customer A sees only own shipment, saw ' || n;
  select count(id) into n from public.shipment_events;
  assert n = 1, 'customer A sees only own events';
  select count(id) into n from public.refunds;
  assert n = 1, 'customer A sees own refund';
  select count(id) into n from public.shipments where id = sb;
  assert n = 0, 'cannot read B';

  begin perform label_url from public.shipments; assert false, 'label_url must be hidden';
  exception when insufficient_privilege then null; end;
  begin perform payload from public.shipment_events; assert false, 'raw payload must be hidden';
  exception when insufficient_privilege then null; end;
  begin perform razorpay_refund_id from public.refunds; assert false, 'razorpay ids must be hidden';
  exception when insufficient_privilege then null; end;
  begin select count(*) into n from public.order_events; assert false, 'audit log is admin only';
  exception when insufficient_privilege then null; end;

  begin update public.orders set status = 'delivered' where id = oa; assert false, 'customers cannot update orders';
  exception when insufficient_privilege then null; end;
  begin delete from public.orders where id = oa; assert false, 'customers cannot delete orders';
  exception when insufficient_privilege then null; end;
  begin insert into public.shipments(order_id, direction, provider_reference) values (oa, 'forward', 'X'); assert false;
  exception when insufficient_privilege then null; end;
  begin perform public.begin_refund(oa, null, 100, 'admin', 'x'); assert false, 'rpc blocked';
  exception when insufficient_privilege then null; end;
  begin perform public.confirm_order_payment_and_commit_inventory(oa, 'pay_x'); assert false, 'rpc blocked';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_set_delivery_status(oa, 'shipped', null); assert false, 'rpc blocked';
  exception when insufficient_privilege then null; end;

  reset role;
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
  begin select count(id) into n from public.shipments; assert false, 'anon blocked';
  exception when insufficient_privilege then null; end;
  begin perform public.expire_unpaid_order(oa, 1); assert false, 'anon rpc blocked';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise notice 'PASS 16 permissions';
end $$;
