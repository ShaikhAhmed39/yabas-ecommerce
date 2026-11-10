// Order-level flows shared by the admin screen and the customer "Cancel order" button.
import type { Db } from "./supabase.ts";
import { userEmail } from "./supabase.ts";
import { rpcError } from "./http.ts";
import { issueRefund } from "./refunds.ts";
import { sendMail } from "./notify.ts";
import type { ShippingProvider } from "./shipping/types.ts";
import { cancelShipment } from "./shipping/service.ts";

const CANCEL_RULES: Array<[RegExp, number, string]> = [
  [/can no longer be cancelled/i, 409, "This order is already with the courier or delivered and can no longer be cancelled."],
  [/shipment already with the courier/i, 409, "The parcel is already with the courier. Wait for delivery, then use the return option."],
  [/not found/i, 404, "Order not found."],
];

export interface CancelOrderInput {
  orderId: string;
  actorId: string;
  by: "admin" | "customer";
  reason: string;
}

/**
 * 1) stop any parcel not yet picked up (courier + DB)  2) cancel + restock atomically  3) refund if it was paid  4) e-mail.
 * Safe to call twice: the second call finds the order already cancelled.
 */
export async function cancelOrder(db: Db, provider: ShippingProvider, input: CancelOrderInput) {
  const { data: ships } = await db.from("shipments").select("id,status").eq("order_id", input.orderId)
    .eq("direction", "forward").neq("status", "cancelled");
  for (const s of ships ?? []) await cancelShipment(db, provider, s.id, input.actorId);

  const { data, error } = await db.rpc("cancel_order_restock", {
    p_order_id: input.orderId, p_actor: input.actorId, p_reason: input.reason, p_by: input.by,
  });
  if (error) throw rpcError(error, CANCEL_RULES);
  const r = data as { needsRefund: boolean; alreadyCancelled: boolean };

  const { data: order } = await db.from("orders")
    .select("total_amount,user_id,order_number,customer_name,refunded_amount").eq("id", input.orderId).single();

  let refundStatus: string | null = null;
  if (r.needsRefund && order) {
    const remaining = Math.round((Number(order.total_amount) - Number(order.refunded_amount ?? 0)) * 100);
    if (remaining > 0) {
      try {
        refundStatus = (await issueRefund(db, { orderId: input.orderId, amountPaise: remaining, reason: "cancellation", actor: input.actorId })).status;
      } catch (e) {
        // The order is cancelled already; the refund row is saved and retried automatically by the reconcile job.
        console.error("Refund after cancel did not complete:", e instanceof Error ? e.message : e);
        refundStatus = "retry_needed";
      }
    }
  }
  if (!r.alreadyCancelled && order) {
    await sendMail(await userEmail(db, order.user_id, input.orderId), "order_cancelled", {
      name: order.customer_name, orderNumber: order.order_number, note: input.reason,
      amountRupees: r.needsRefund ? Number(order.total_amount) : null,
    });
  }
  return { refundStatus, alreadyCancelled: r.alreadyCancelled };
}
