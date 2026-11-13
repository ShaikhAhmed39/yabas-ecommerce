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

-- stock alerts: anyone can ask, only admins can read
do $$
declare p uuid; adm uuid := t4.mk_user(); cust uuid := t4.mk_user(); ok boolean := false; n int;
begin
  insert into public.products(title, selling_price, stock, image_url, category) values ('Sold Out Haar', 500, 0, 'x', 'Necklace') returning id into p;
  insert into public.admin_users(id, email) values (adm, 'alerts@t.test');
  perform t4.as_user(cust);
  perform public.request_stock_alert(p, '  Buyer@Example.COM ');
  perform public.request_stock_alert(p, 'buyer@example.com');           -- same person twice: still one row
  begin perform public.request_stock_alert(p, 'not-an-email'); exception when others then ok := sqlerrm like '%valid email%'; end;
  assert ok, 'bad email refused';
  ok := false;
  begin perform public.admin_stock_alerts(); exception when others then ok := sqlerrm like '%permission denied%'; end;
  assert ok, 'customers cannot read the list';
  perform t4.as_user(adm);
  select waiting into n from public.admin_stock_alerts() where product_id = p;
  assert n = 1, 'one waiting person, got ' || coalesce(n::text, 'null');
  assert (select emails[1] from public.admin_stock_alerts() where product_id = p) = 'buyer@example.com', 'email normalised';
  perform public.admin_clear_stock_alerts(p);
  assert not exists (select 1 from public.admin_stock_alerts() where product_id = p), 'cleared';
  perform t4.as_service();
  delete from public.products where id = p;
  raise notice 'PASS 50b stock alerts';
end $$;
