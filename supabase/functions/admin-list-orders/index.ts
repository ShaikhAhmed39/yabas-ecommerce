// Admin read API for orders (service role, after the admin allow-list check).
// POST { view?, search?, page? (0-based), page_size?, events_for_order? }
import { errorResponse, HttpError, isUuid, json, preflight, readJson, requirePost } from "../_shared/http.ts";
import { requireAdmin, type Db } from "../_shared/supabase.ts";
import { shippingMode } from "../_shared/shipping/provider.ts";

const ORDER_COLUMNS =
  "id,order_number,user_id,total_amount,status,payment_method,customer_name,shipping_address_line1,shipping_address_line2,city,state,pincode,primary_phone,backup_phone,created_at,updated_at,paid_at,payment_status,delivery_status,delivered_at,inventory_status,razorpay_order_id,razorpay_payment_id,refunded_amount,needs_attention,attention_reason,cancel_reason,cancelled_at";
const SHIPMENT_COLUMNS =
  "id,order_id,return_request_id,direction,provider_reference,attempt,awb_code,courier_name,status,raw_status,tracking_url,label_url,pickup_scheduled_at,etd,picked_up_at,delivered_at,last_event_at,error,created_at";
const REFUND_COLUMNS = "id,order_id,return_request_id,amount_paise,status,reason,error,razorpay_refund_id,created_at,processed_at";
const RETURN_COLUMNS =
  "id,order_id,order_item_id,reason,description,status,admin_note,rejection_reason,pickup_scheduled_at,received_at,refund_amount,refund_initiated_at,created_at,updated_at";

const VIEWS = ["all", "unpaid", "to_ship", "in_transit", "delivered", "attention", "cancelled", "returns"] as const;
const CLOSED_RETURN = "(completed,rejected,cancelled)";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function openReturnOrderIds(db: Db): Promise<string[]> {
  const { data } = await db.from("return_requests").select("order_id").not("status", "in", CLOSED_RETURN).limit(1000);
  return [...new Set(((data ?? []) as Row[]).map((r) => r.order_id as string))];
}

// deno-lint-ignore no-explicit-any
function applyView(q: any, view: string, returnOrderIds: string[]) {
  switch (view) {
    case "unpaid": return q.eq("payment_status", "pending").neq("status", "cancelled");
    case "to_ship": return q.eq("payment_status", "paid").in("delivery_status", ["pending", "processing"]).neq("status", "cancelled");
    case "in_transit": return q.in("delivery_status", ["shipped", "out_for_delivery"]);
    case "delivered": return q.eq("delivery_status", "delivered");
    case "attention": return q.eq("needs_attention", true);
    case "cancelled": return q.eq("status", "cancelled");
    case "returns": return q.in("id", returnOrderIds.length ? returnOrderIds : ["00000000-0000-0000-0000-000000000000"]);
    default: return q;
  }
}

function group(rows: Row[] | null | undefined, key: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const r of rows ?? []) (out[String(r[key])] ??= []).push(r);
  return out;
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { db } = await requireAdmin(req);
    const body = await readJson(req);

    // detail: one order's audit timeline
    if (body.events_for_order !== undefined) {
      if (!isUuid(body.events_for_order)) throw new HttpError(400, "Invalid order.");
      const { data: events } = await db.from("order_events")
        .select("id,actor_type,event_type,from_value,to_value,note,created_at")
        .eq("order_id", body.events_for_order).order("created_at", { ascending: false }).limit(200);
      return json({ success: true, events: events ?? [] }, 200, req);
    }

    const view = VIEWS.includes(body.view as never) ? String(body.view) : "all";
    const page = Math.max(0, Math.floor(Number(body.page) || 0));
    const pageSize = Math.min(100, Math.max(5, Math.floor(Number(body.page_size) || 20)));
    const from = page * pageSize;
    // keep only characters that are safe inside a PostgREST .or() filter
    const search = typeof body.search === "string" ? body.search.replace(/[^\p{L}\p{N}\s@._+-]/gu, "").trim().slice(0, 60) : "";

    const returnOrderIds = await openReturnOrderIds(db);
    let q = applyView(db.from("orders").select(ORDER_COLUMNS, { count: "exact" }), view, returnOrderIds);
    if (search) {
      q = q.or(
        `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,primary_phone.ilike.%${search}%,pincode.eq.${search},razorpay_payment_id.eq.${search}`,
      );
    }
    const { data: orders, count, error } = await q.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) {
      console.error("Admin order list failed:", error.message);
      throw new HttpError(500, "Could not load orders.");
    }
    const rows = (orders ?? []) as Row[];
    const ids = rows.map((o) => o.id as string);

    const counts: Record<string, number> = {};
    const [items, ships, returns, refunds] = await Promise.all([
      db.from("order_items").select("id,order_id,product_id,product_title,unit_price,quantity").in("order_id", ids),
      db.from("shipments").select(SHIPMENT_COLUMNS).in("order_id", ids).order("created_at", { ascending: false }),
      db.from("return_requests").select(RETURN_COLUMNS).in("order_id", ids).order("created_at", { ascending: false }),
      db.from("refunds").select(REFUND_COLUMNS).in("order_id", ids).order("created_at", { ascending: false }),
      ...VIEWS.map(async (v) => {
        const { count: c } = await applyView(db.from("orders").select("id", { count: "exact", head: true }), v, returnOrderIds);
        counts[v] = c ?? 0;
      }),
    ]);
    const byItems = group(items.data, "order_id"), byShips = group(ships.data, "order_id");
    const byReturns = group(returns.data, "order_id"), byRefunds = group(refunds.data, "order_id");

    return json({
      success: true, mode: shippingMode(), page, page_size: pageSize, total: count ?? 0, counts,
      orders: rows.map((o) => ({
        ...o, items: byItems[o.id] ?? [], shipments: byShips[o.id] ?? [],
        returns: byReturns[o.id] ?? [], refunds: byRefunds[o.id] ?? [],
      })),
    }, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
