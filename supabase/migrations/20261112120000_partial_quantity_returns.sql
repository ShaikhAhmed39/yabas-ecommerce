-- Partial returns: a customer who bought 3 pieces of one product can return 1 or 2 of them.
-- Before: one active return per order line (the whole line). Now: any number of returns per line,
-- as long as the quantities of the active ones add up to no more than what was bought.

alter table public.return_requests add column if not exists quantity integer not null default 1;
alter table public.return_requests drop constraint if exists return_requests_quantity_check;
alter table public.return_requests add constraint return_requests_quantity_check check (quantity >= 1);

-- returns that already exist covered the whole line
update public.return_requests rr
   set quantity = greatest(oi.quantity, 1)
  from public.order_items oi
 where oi.id = rr.order_item_id and rr.quantity = 1 and oi.quantity > 1;

drop index if exists public.uq_return_requests_active_item;
create index if not exists idx_return_requests_item on public.return_requests (order_item_id);

-- One place that creates a return. It locks the order line so two taps / two tabs cannot return more than was bought.
create or replace function public.create_return_request(
  p_user_id uuid, p_order_id uuid, p_item_id uuid, p_quantity integer, p_reason text, p_description text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.order_items%rowtype;
  v_active integer;
  v_row public.return_requests%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'permission denied'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'invalid quantity'; end if;

  select * into v_item from public.order_items where id = p_item_id and order_id = p_order_id for update;
  if not found then raise exception 'item not on order'; end if;

  select coalesce(sum(quantity), 0) into v_active from public.return_requests
   where order_item_id = p_item_id and status not in ('rejected','cancelled');
  if v_active + p_quantity > v_item.quantity then
    raise exception 'return quantity exceeds purchase (bought %, already returning %)', v_item.quantity, v_active;
  end if;

  insert into public.return_requests(order_id, order_item_id, user_id, reason, description, status, quantity)
  values (p_order_id, p_item_id, p_user_id, p_reason, p_description, 'requested', p_quantity)
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'order_id', v_row.order_id, 'order_item_id', v_row.order_item_id,
                            'status', v_row.status, 'quantity', v_row.quantity, 'created_at', v_row.created_at);
end $$;

revoke all on function public.create_return_request(uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_return_request(uuid, uuid, uuid, integer, text, text) to service_role;
