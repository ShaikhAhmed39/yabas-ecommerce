// Customer asks to return one item of a delivered order.
import { errorResponse, HttpError, json, preflight, readJson, requirePost, requireUuid, cleanText } from "../_shared/http.ts";
import { adminClient, authenticate } from "../_shared/supabase.ts";
import { envNumber } from "../_shared/env.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user } = await authenticate(req);
    const body = await readJson(req);
    const orderId = requireUuid(body.order_id, "order");
    const itemId = requireUuid(body.order_item_id, "item");
    const reason = cleanText(body.reason, 100);
    const description = cleanText(body.description, 2000);
    if (!reason || reason.length < 3) throw new HttpError(400, "The return reason must be 3-100 characters.");
    if (!description || description.length < 10) throw new HttpError(400, "Please describe the problem in at least 10 characters.");

    const db = adminClient();
    const { data: order, error } = await db
      .from("orders").select("id,payment_status,delivery_status,delivered_at,status")
      .eq("id", orderId).eq("user_id", user.id).maybeSingle();
    if (error) throw new HttpError(500, "Unable to verify this order.");
    if (!order) throw new HttpError(404, "Order not found.");
    if (order.payment_status !== "paid") throw new HttpError(400, "Only paid orders can be returned.");
    if (order.delivery_status !== "delivered" || !order.delivered_at) {
      throw new HttpError(400, "A return can be requested only after the order is delivered.");
    }
    const windowDays = envNumber("RETURN_WINDOW_DAYS", 7);
    const deadline = new Date(order.delivered_at).getTime() + windowDays * 86_400_000;
    if (Date.now() > deadline) throw new HttpError(400, `The ${windowDays}-day return window has ended.`);

    const { data: item } = await db.from("order_items").select("id").eq("id", itemId).eq("order_id", orderId).maybeSingle();
    if (!item) throw new HttpError(400, "This item does not belong to the selected order.");

    const { data, error: insertError } = await db
      .from("return_requests")
      .insert({ order_id: orderId, order_item_id: itemId, user_id: user.id, reason, description, status: "requested" })
      .select("id,order_id,order_item_id,status,created_at").single();
    if (insertError) {
      // unique index uq_return_requests_active_item: two taps / two tabs cannot create two requests
      if (insertError.code === "23505") throw new HttpError(409, "A return request already exists for this item.");
      console.error("Return insert failed:", insertError.message);
      throw new HttpError(500, "Unable to submit your return request.");
    }
    await db.rpc("log_order_event", {
      p_order_id: orderId, p_actor_type: "customer", p_actor_id: user.id, p_event_type: "return_requested",
      p_from: null, p_to: "requested", p_note: reason, p_payload: { return_request_id: data.id },
    });
    return json({ message: "Your return request has been submitted.", return_request: data }, 201, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
