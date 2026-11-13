-- "Notify me" for sold-out pieces: the product page stays live and collects emails; the owner reads them in Admin > Products.

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  constraint stock_alerts_email_ok check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  unique (product_id, email)
);
alter table public.stock_alerts enable row level security;
-- no direct table access for anyone: only the two functions below
revoke all on public.stock_alerts from anon, authenticated;

create or replace function public.request_stock_alert(p_product_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if e !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then raise exception 'Please enter a valid email address.'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then raise exception 'Product not found.'; end if;
  -- a visitor cannot flood one product with fake addresses
  if (select count(*) from public.stock_alerts where product_id = p_product_id and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'Too many requests. Please try again later.';
  end if;
  insert into public.stock_alerts(product_id, email) values (p_product_id, e) on conflict do nothing;
end $$;

create or replace function public.admin_stock_alerts()
returns table (product_id uuid, title text, in_stock boolean, emails text[], waiting int)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  return query
    select p.id, p.title, p.stock > 0, array_agg(a.email order by a.created_at), count(*)::int
    from public.stock_alerts a join public.products p on p.id = a.product_id
    group by p.id, p.title, p.stock order by count(*) desc;
end $$;

create or replace function public.admin_clear_stock_alerts(p_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  delete from public.stock_alerts where product_id = p_product_id;
end $$;

revoke all on function public.request_stock_alert(uuid, text), public.admin_stock_alerts(), public.admin_clear_stock_alerts(uuid) from public;
grant execute on function public.request_stock_alert(uuid, text) to anon, authenticated;
revoke execute on function public.admin_stock_alerts(), public.admin_clear_stock_alerts(uuid) from anon;
grant execute on function public.admin_stock_alerts(), public.admin_clear_stock_alerts(uuid) to authenticated;
