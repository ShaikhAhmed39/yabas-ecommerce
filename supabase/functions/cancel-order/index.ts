// Customer cancels their own order BEFORE the parcel is picked up. Same atomic flow as the admin action.
import { cleanText, errorResponse, HttpError, json, preflight, readJson, requirePost, requireUuid } from "../_shared/http.ts";
import { adminClient, authenticate } from "../_shared/supabase.ts";
import { getShippingProvider } from "../_shared/shipping/provider.ts";
import { cancelOrder } from "../_shared/orders.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user } = await authenticate(req);
    const body = await readJson(req);
    const orderId = requireUuid(body.order_id, "order");
    const reason = cleanText(body.reason, 300) ?? "Cancelled by customer";

    const db = adminClient();
    const { data: order } = await db.from("orders").select("id,delivery_status,status").eq("id", orderId).eq("user_id", user.id).maybeSingle();
    if (!order) throw new HttpError(404, "Order not found.");
    if (order.status !== "cancelled" && !["pending", "processing"].includes(order.delivery_status)) {
      throw new HttpError(409, "This order has already been shipped. You can return it after delivery.");
    }
    const r = await cancelOrder(db, getShippingProvider(), { orderId, actorId: user.id, by: "customer", reason });
    return json({ success: true, refund_status: r.refundStatus, already_cancelled: r.alreadyCancelled }, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
