// MANUAL override of the delivery status. Normally tracking is automatic (courier webhook / refresh).
// Use this only when a parcel was handed over outside the courier flow, or the courier data is wrong.
import { cleanText, errorResponse, HttpError, json, preflight, readJson, requirePost, requireUuid, rpcError } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/supabase.ts";

const ALLOWED = ["processing", "shipped", "out_for_delivery", "delivered", "delivery_failed", "rto_initiated", "rto_delivered"];

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user, db } = await requireAdmin(req);
    const body = await readJson(req);
    const orderId = requireUuid(body.order_id, "order");
    const next = String(body.delivery_status ?? "");
    if (!ALLOWED.includes(next)) throw new HttpError(400, "Invalid delivery status.");
    const expected = String(body.expected_delivery_status ?? "");
    const note = cleanText(body.note, 300) ?? "Manual status change by admin";

    const { data: order, error } = await db.from("orders").select("delivery_status").eq("id", orderId).maybeSingle();
    if (error) throw new HttpError(500, "Could not load the order.");
    if (!order) throw new HttpError(404, "Order not found.");
    if (order.delivery_status !== expected) throw new HttpError(409, "The order changed. Refresh and try again.");

    // With a live courier booking, tracking is the source of truth; a manual change needs an explicit override.
    const { data: ship } = await db.from("shipments").select("awb_code,status").eq("order_id", orderId).eq("direction", "forward").neq("status", "cancelled").maybeSingle();
    if (ship?.awb_code && body.override !== true) {
      throw new HttpError(409, "This parcel has courier tracking, which updates automatically. Override only if the courier data is wrong.", "courier_tracked");
    }

    const { data, error: rpcErr } = await db.rpc("admin_set_delivery_status", {
      p_order_id: orderId, p_next: next, p_actor: user.id, p_note: note,
    });
    if (rpcErr) throw rpcError(rpcErr, [
      [/cannot move delivery/i, 409, "That status change is not allowed from the current delivery status."],
      [/not paid and active/i, 409, "Only paid, active orders can change delivery status."],
      [/order not found/i, 404, "Order not found."],
    ]);
    return json({ success: true, ...(data as object) }, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
