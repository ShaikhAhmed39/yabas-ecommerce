-- product slugs: made from the title, unique, stable when the title changes, new fields optional
do $$
declare a uuid; b uuid; c uuid; sa text; sb text; sc text;
begin
  insert into public.products(title, selling_price, stock, image_url, category) values ('Kundan Choker & Set!', 999, 3, 'x', 'Necklace') returning id, slug into a, sa;
  insert into public.products(title, selling_price, stock, image_url, category) values ('Kundan Choker & Set!', 999, 3, 'x', 'Necklace') returning id, slug into b, sb;
  insert into public.products(title, selling_price, stock, image_url, category, slug) values ('Other', 1, 1, 'x', 'Bangles', 'My Custom Slug') returning id, slug into c, sc;
  assert sa = 'kundan-choker-and-set', 'slug from title: ' || sa;
  assert sb = 'kundan-choker-and-set-2', 'duplicate title gets -2: ' || sb;
  assert sc = 'my-custom-slug', 'typed slug is cleaned: ' || sc;
  update public.products set title = 'Totally New Name', stock = 2 where id = a;
  assert (select slug from public.products where id = a) = sa, 'slug does not change when title changes';
  assert (select certification from public.products where id = a) is null, 'certification stays empty unless filled';
  assert (select style_tags from public.products where id = a) = '{}', 'style tags default empty';
  begin insert into public.products(title, selling_price, stock, image_url, category, slug) values ('Dup', 1, 1, 'x', 'Bangles', 'my-custom-slug'); assert false, 'dup slug must fail';
  exception when unique_violation then null; end;
  delete from public.products where id in (a, b, c);
  raise notice 'PASS 50 product slugs';
end $$;
