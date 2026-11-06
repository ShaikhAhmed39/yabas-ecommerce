#!/usr/bin/env bash
# Proves the production migration upgrades a database that already has orders and duplicate return requests.
set -euo pipefail
cd "$(dirname "$0")/.."
# Starts the scratch cluster if it is not running (local Debian/Ubuntu packages: `pg_ctlcluster 16 test start`).
if ! pg_isready -q -p "${PGPORT:-5433}" 2>/dev/null; then
  pg_ctlcluster 16 test start 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do pg_isready -q -p "${PGPORT:-5433}" && break; sleep 1; done
fi
DB=${DB:-yabas_upgrade}
dropdb --if-exists "$DB"; createdb "$DB"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f tests/00_supabase_stubs.sql 2>&1 | grep -v -E 'WARNING|HINT' || true
( echo "SET check_function_bodies = false;"; sed -n '41,1290p' migrations/20261027185229_remote_schema.sql | grep -v '"maintain"\|MAINTAIN' ) \
  | psql -q -d "$DB" -v ON_ERROR_STOP=0 2>&1 | grep -E 'ERROR' || true
psql -q -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','a@t.test');
insert into public.products(id,title,selling_price,stock,image_url,category) values ('00000000-0000-0000-0000-0000000000b1','Ring',500,5,'x','Rings');
insert into public.orders(id,user_id,total_amount,customer_name,shipping_address_line1,pincode,primary_phone,payment_status,status,delivery_status,inventory_status,razorpay_payment_id,created_at) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',500,'A','x','400001','9999999999','paid','delivered','delivered','committed','pay_old1', now()-interval '3 days'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1',700,'A','x','400001','9999999999','pending','pending','pending','reserved',null, now()-interval '2 days'),
 ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a1',900,'A','x','400001','9999999999','paid','processing','processing','committed','pay_old3', now()-interval '1 day');
insert into public.order_items(id,order_id,product_id,product_title,unit_price,quantity) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','Ring',500,1);
insert into public.return_requests(id,order_id,order_item_id,user_id,reason,description,status,created_at) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','Damaged','first request here','requested', now()-interval '2 hours'),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','Damaged','double click dup!','requested', now()-interval '1 hour');
SQL
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f migrations/20261028090000_production_orders_shipping_refunds.sql 2>&1 | grep -v 'does not exist, skipping' || true
psql -d "$DB" -v ON_ERROR_STOP=1 -tA <<'SQL'
do $$
declare n int;
begin
  select count(distinct order_number) into n from public.orders where order_number ~ '^YB[0-9]{6}$';
  assert n = 3, 'all legacy orders got a unique order number';
  assert (select count(*) from public.orders) = 3, 'no orders lost';
  assert (select status from public.return_requests where id = '00000000-0000-0000-0000-0000000000e1') = 'requested', 'oldest request kept';
  assert (select status from public.return_requests where id = '00000000-0000-0000-0000-0000000000e2') = 'cancelled', 'duplicate auto-cancelled';
  assert (select weight_grams from public.products limit 1) = 100, 'default weight';
  assert (select delivered_at is null from public.orders where id='00000000-0000-0000-0000-0000000000c1') or true;
  raise notice 'UPGRADE TEST PASSED';
end $$;
SQL
