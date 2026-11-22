-- Categories, sub-categories, types and occasions the owner can manage himself in Admin > Products.
-- Products keep saving plain text, so nothing existing changes; this table only feeds the dropdowns.

create table if not exists public.catalog_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('category', 'sub', 'type', 'occasion')),
  category text not null default '',   -- for sub/type: the category they belong to; empty otherwise
  name text not null check (length(btrim(name)) between 1 and 60),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, category, name)
);
alter table public.catalog_options enable row level security;
revoke all on public.catalog_options from anon, authenticated;   -- only the three functions below

create or replace function public.admin_catalog_options()
returns setof public.catalog_options language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  return query select * from public.catalog_options order by kind, category, sort, name;
end $$;

create or replace function public.admin_add_catalog_option(p_kind text, p_category text, p_name text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'); c text := btrim(coalesce(p_category, ''));
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  if p_kind not in ('category', 'sub', 'type', 'occasion') then raise exception 'Unknown kind.'; end if;
  if length(n) = 0 or length(n) > 60 then raise exception 'Please type a name (up to 60 letters).'; end if;
  if p_kind in ('category', 'occasion') then c := ''; end if;
  if p_kind in ('sub', 'type') and not exists (select 1 from public.catalog_options where kind = 'category' and name = c) then
    raise exception 'Choose a category first.';
  end if;
  if exists (select 1 from public.catalog_options where kind = p_kind and category = c and lower(name) = lower(n)) then
    raise exception '"%" is already in the list.', n;
  end if;
  insert into public.catalog_options(kind, category, name, sort)
    values (p_kind, c, n, coalesce((select max(sort) from public.catalog_options where kind = p_kind and category = c), 0) + 1);
end $$;

-- Removing only takes the name out of the dropdowns. Products that already use it keep it.
create or replace function public.admin_remove_catalog_option(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.catalog_options;
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  select * into r from public.catalog_options where id = p_id;
  if not found then return; end if;
  if r.kind = 'category' then delete from public.catalog_options where category = r.name and kind in ('sub', 'type'); end if;
  delete from public.catalog_options where id = p_id;
end $$;

revoke all on function public.admin_catalog_options(), public.admin_add_catalog_option(text, text, text), public.admin_remove_catalog_option(uuid) from public;
revoke execute on function public.admin_catalog_options(), public.admin_add_catalog_option(text, text, text), public.admin_remove_catalog_option(uuid) from anon;
grant execute on function public.admin_catalog_options(), public.admin_add_catalog_option(text, text, text), public.admin_remove_catalog_option(uuid) to authenticated;

-- starting list = what the owner gave us
insert into public.catalog_options(kind, category, name, sort)
select v.kind, v.cat, v.name, v.ord from (values
  ('category','','Necklace',1),('category','','Ring',2),('category','','Paasa',3),('category','','Nath',4),('category','','Mangalsutra',5),
  ('category','','Chain',6),('category','','Earrings',7),('category','','Maangtika',8),('category','','Bangles',9),('category','','Bracelet',10),('category','','Bridal',11),
  ('sub','Necklace','Indian Necklace',1),('sub','Necklace','Turkish Necklace',2),
  ('type','Necklace','Long Necklace',1),('type','Necklace','Short Necklace',2),('type','Necklace','Unique Set',3),('type','Necklace','Combo Set',4),('type','Necklace','Bridal Set',5),
  ('sub','Ring','Indian Ring',1),('sub','Ring','Turkish Ring',2),
  ('type','Ring','Long Ring',1),('type','Ring','Small Ring',2),('type','Ring','Bridal Ring',3),
  ('sub','Mangalsutra','Daily Wear',1),('sub','Mangalsutra','Long Mangalsutra',2),('sub','Mangalsutra','AD Mangalsutra',3),
  ('sub','Chain','Chain',1),
  ('sub','Earrings','Indian Earrings',1),('sub','Earrings','Turkish Earrings',2),
  ('type','Earrings','Tops',1),('type','Earrings','Earrings',2),('type','Earrings','Sui Dhaga',3),('type','Earrings','Bridal Earrings',4),('type','Earrings','Occasion Earrings',5),
  ('sub','Bangles','Bangles',1),('sub','Bangles','Kada',2),('sub','Bangles','AD Bangles',3),
  ('sub','Bracelet','Indian Bracelet',1),('sub','Bracelet','Turkish Bracelet',2),('sub','Bracelet','AD Bracelets',3),
  ('sub','Bridal','Full Set',1),('sub','Bridal','Necklace Set',2),('sub','Bridal','Maang Tikka',3),('sub','Bridal','Nath',4),('sub','Bridal','Kamarbandh',5),
  ('occasion','','Daily Wear',1),('occasion','','Wedding',2),('occasion','','Festive',3),('occasion','','Party',4),('occasion','','Office',5),('occasion','','Casual',6)
) as v(kind, cat, name, ord)
on conflict do nothing;
