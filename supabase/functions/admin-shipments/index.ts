// Admin shipping + cancellation actions. Every action is idempotent and audited.
// POST { action, order_id?, shipment_id?, reason?, status? }
//   create | retry  -> book the courier (resumes a half-finished booking)
//   refresh         -> pull latest tracking from the courier
//   cancel          -> cancel the parcel before pickup
//   label           -> regenerate the shipping label
//   cancel_order    -> cancel parcel + restock + automatic full refund (if paid)
//   simulate        -> TEST MODE ONLY: pretend the courier sent an update
import { errorResponse, HttpError, json, preflight, readJson, requirePost, requireUuid, cleanText } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import { getShippingProvider } from "../_shared/shipping/provider.ts";
import { applyCourierEvent, bookShipment, cancelShipment, refreshShipment, regenerateLabel } from "../_shared/shipping/service.ts";
import { mapCourierStatus } from "../_shared/shipping/status.ts";
import { cancelOrder } from "../_shared/orders.ts";
import { issueRefund } from "../_shared/refunds.ts";

const SIM_STATUS: Record<string, string> = {
  picked_up: "PICKED UP", in_transit: "IN TRANSIT", out_for_delivery: "OUT FOR DELIVERY", delivered: "DELIVERED",
  undelivered: "UNDELIVERED", rto_initiated: "RTO INITIATED", rto_delivered: "RTO DELIVERED",
};

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user, db } = await requireAdmin(req);
    const body = await readJson(req);
    const action = String(body.action ?? "");
    const provider = getShippingProvider();

    if (action === "create" || action === "retry") {
      const orderId = requireUuid(body.order_id, "order");
      const res = await bookShipment(db, provider, { orderId, direction: "forward", actor: user.id });
      return json({ success: true, shipment: res.shipment, alreadyBooked: res.alreadyBooked, mode: provider.mode }, 200, req);
    }

    if (action === "refresh" || action === "cancel" || action === "cancel_shipment" || action === "label" || action === "simulate") {
      const shipmentId = requireUuid(body.shipment_id, "shipment");
      if (action === "refresh") return json({ success: true, shipment: await refreshShipment(db, provider, shipmentId) }, 200, req);
      if (action === "cancel" || action === "cancel_shipment") return json({ success: true, shipment: await cancelShipment(db, provider, shipmentId, user.id) }, 200, req);
      if (action === "label") return json({ success: true, label_url: await regenerateLabel(db, provider, shipmentId) }, 200, req);

      if (provider.mode !== "mock") throw new HttpError(400, "Simulation is only available in test mode.");
      const raw = SIM_STATUS[String(body.status ?? "")];
      if (!raw) throw new HttpError(400, "Unknown simulated status.");
      const { data: ship } = await db.from("shipments").select("awb_code,direction").eq("id", shipmentId).single();
      if (!ship?.awb_code) throw new HttpError(409, "This shipment has no tracking number yet.");
      const result = await applyCourierEvent(db, provider, {
        awb: ship.awb_code, rawStatus: raw, mappedStatus: mapCourierStatus(raw), eventTime: new Date().toISOString(),
        activity: `Simulated: ${raw}`, location: "Test hub", etd: null, isReturn: ship.direction === "return",
      }, { source: "simulation", by: user.id });
      return json({ success: true, ...result }, 200, req);
    }

    if (action === "cancel_order") {
      const orderId = requireUuid(body.order_id, "order");
      const reason = cleanText(body.reason, 300);
      if (!reason || reason.length < 3) throw new HttpError(400, "Give a short reason for the cancellation.");
      const r = await cancelOrder(db, provider, { orderId, actorId: user.id, by: "admin", reason });
      return json({ success: true, cancelled: true, refund_status: r.refundStatus, already_cancelled: r.alreadyCancelled }, 200, req);
    }

    if (action === "refund_order") {
      // Manual refund (e.g. goodwill, or a courier loss). Capped server-side by begin_refund against what was actually paid.
      const orderId = requireUuid(body.order_id, "order");
      const amountPaise = Math.round(Number(body.amount) * 100);
      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new HttpError(400, "Enter a valid refund amount.");
      const refund = await issueRefund(db, { orderId, amountPaise, reason: "admin", actor: user.id });
      return json({ success: true, refund_status: refund.status, refund }, 200, req);
    }

    throw new HttpError(400, "Unsupported action.");
  } catch (e) {
    return errorResponse(e, req);
  }
});
