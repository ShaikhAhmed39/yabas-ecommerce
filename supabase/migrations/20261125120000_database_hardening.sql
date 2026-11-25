-- Database tidy-up from the Nov 2026 audit. Nothing here changes what customers or the owner see.
-- 1) Internal helper functions are no longer callable straight from the internet.
-- 2) Missing indexes on links between tables (keeps deleting a product / loading an order fast as data grows).
-- 3) Faster row-security checks (same rules, evaluated once per query instead of once per row).
-- 4) Old scheduler log rows are removed every night so the database does not fill up with them.

do $$
declare f text;
begin
  foreach f in array array['public._cfg_num(text)', 'public._coupon_quote(text, uuid, text, bigint, boolean)',
                           'public.release_coupon_on_order_release()', 'public.rls_auto_enable()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
  if to_regprocedure('public.store_config_keys()') is not null then
    execute 'alter function public.store_config_keys() set search_path = public, pg_temp';
  end if;
end $$;

create index if not exists idx_order_items_product on public.order_items (product_id);
create index if not exists idx_wishlist_items_product on public.wishlist_items (product_id);
create index if not exists idx_coupon_redemptions_order on public.coupon_redemptions (order_id);
create index if not exists idx_scratch_cards_coupon on public.scratch_cards (coupon_id);
create index if not exists idx_coupons_owner on public.coupons (owner_user_id);
create index if not exists idx_return_requests_order_user on public.return_requests (order_id, user_id);

alter policy "Users can view their own profile" on public.profiles using ((select auth.uid()) = id);
alter policy "Users can update their own profile" on public.profiles using ((select auth.uid()) = id);
alter policy admins_read_own_grant on public.admin_users using ((select auth.uid()) = id);
alter policy select_own_orders on public.orders using ((select auth.uid()) = user_id);
alter policy auth_insert_products on public.products with check (exists (select 1 from public.admin_users where admin_users.id = (select auth.uid())));
alter policy auth_update_products on public.products using (exists (select 1 from public.admin_users where admin_users.id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where admin_users.id = (select auth.uid())));
alter policy auth_delete_products on public.products using (exists (select 1 from public.admin_users where admin_users.id = (select auth.uid())));

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'yabas-prune-cron-history';
    perform cron.schedule('yabas-prune-cron-history', '17 3 * * *', $c$delete from cron.job_run_details where end_time < now() - interval '7 days'$c$);
  end if;
end $$;
