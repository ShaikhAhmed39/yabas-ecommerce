-- Clean product web addresses (slugs) + optional jewellery detail fields for search engines.
-- Everything is additive: nothing is removed or renamed, existing pages keep working.

create or replace function public.slugify_text(t text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(replace(coalesce(t, ''), '&', ' and ')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'product')
$$;

alter table public.products
  add column if not exists slug text,
  add column if not exists purity text,          -- e.g. 22K gold look, 925 silver. Only filled when it is TRUE.
  add column if not exists plating text,         -- e.g. 1 gram gold plated
  add column if not exists stone_type text,
  add column if not exists certification text,   -- e.g. BIS hallmark. Leave EMPTY unless the piece really has it.
  add column if not exists care_notes text,
  add column if not exists style_tags text[] not null default '{}';

-- slug is made from the title once and then never changes by itself (so shared links keep working)
create or replace function public.products_set_slug()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare base text; candidate text; n int := 1;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := public.slugify_text(new.slug);
  else
    base := public.slugify_text(new.title); candidate := base;
    while exists (select 1 from public.products p where p.slug = candidate and p.id <> new.id) loop
      n := n + 1; candidate := base || '-' || n;
    end loop;
    new.slug := candidate;
  end if;
  return new;
end $$;

drop trigger if exists products_set_slug on public.products;
create trigger products_set_slug before insert or update of slug on public.products
  for each row execute function public.products_set_slug();

-- fill the slug of the pieces that already exist (the trigger runs for each row)
update public.products set slug = null where slug is null;

create unique index if not exists products_slug_key on public.products (slug);
alter table public.products alter column slug set not null;
