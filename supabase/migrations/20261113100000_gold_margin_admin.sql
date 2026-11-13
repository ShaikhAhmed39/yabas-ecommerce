-- Admin "Gold rate" tab: see the market price and your margin, change the margin yourself.
-- Changing the margin re-prices the latest saved market rate straight away (no outside call),
-- and keeps that rate's original timestamp, so the website never claims the market price is newer than it is.

create or replace function public.admin_gold_rate_status()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r public.gold_rates%rowtype; m numeric;
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  select * into r from public.gold_rates order by created_at desc limit 1;
  select nullif(value, '')::numeric into m from public.site_settings where key = 'gold_margin_percent';
  return jsonb_build_object(
    'margin_percent', coalesce(m, 0),
    'raw_rate', r.raw_rate_per_gram,
    'final_rate', r.rate_per_gram_24k,
    'updated_at', r.created_at,
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'raw', raw_rate_per_gram, 'margin', margin_percent, 'final', rate_per_gram_24k))
                          from (select * from public.gold_rates order by created_at desc limit 8) h), '[]'::jsonb));
end $$;

create or replace function public.admin_set_gold_margin(p_percent numeric)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r public.gold_rates%rowtype;
begin
  if not public.is_admin_user() then raise exception 'permission denied'; end if;
  if p_percent is null or p_percent < 0 or p_percent > 60 then raise exception 'margin must be between 0 and 60'; end if;
  p_percent := round(p_percent, 2);

  insert into public.site_settings(key, value) values ('gold_margin_percent', p_percent::text)
  on conflict (key) do update set value = excluded.value;

  select * into r from public.gold_rates order by created_at desc limit 1;
  if found then
    update public.gold_rates
       set margin_percent = p_percent, rate_per_gram_24k = round(raw_rate_per_gram * (1 + p_percent / 100))
     where id = r.id;
  end if;
  return public.admin_gold_rate_status();
end $$;

revoke all on function public.admin_gold_rate_status() from public, anon;
revoke all on function public.admin_set_gold_margin(numeric) from public, anon;
grant execute on function public.admin_gold_rate_status() to authenticated;
grant execute on function public.admin_set_gold_margin(numeric) to authenticated;
