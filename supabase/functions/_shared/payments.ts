// One place that turns a Razorpay payment into an order state. Used by verify-razorpay-payment,
// razorpay-webhook and the reconcile job, so all three behave identically.
import type { Db } from "./supabase.ts";
import { userEmail } from "./supabase.ts";
import { HttpError } from "./http.ts";
import { capturePayment, RazorpayError, type RzpPayment } from "./razorpay.ts";
import { issueRefund } from "./refunds.ts";
import { sendMail } from "./notify.ts";

export interface SettleOrder {
  id: string;
  user_id: string | null;
  total_amount: number | string;
  razorpay_order_id: string | null;
  order_number: string;
  customer_name: string;
}

export type SettleOutcome =
  | { outcome: "paid"; recovered: boolean }
  | { outcome: "already_paid" }
  | { outcome: "not_captured"; paymentStatus: string }
  | { outcome: "refund_started"; reason: "late_payment" | "duplicate_payment"; refundStatus: string }
  | { outcome: "refund_pending_retry"; reason: "late_payment" | "duplicate_payment" };

export const SETTLE_ORDER_COLUMNS = "id,user_id,total_amount,razorpay_order_id,order_number,customer_name";

export function expectedPaise(order: { total_amount: number | string }): number {
  return Math.round(Number(order.total_amount) * 100);
}

/** Throws 400 unless the payment really belongs to this order, for this exact amount, in INR. */
export function assertPaymentMatchesOrder(order: SettleOrder, payment: RzpPayment): void {
  if (
    !order.razorpay_order_id || payment.order_id !== order.razorpay_order_id ||
    payment.amount !== expectedPaise(order) || payment.currency !== "INR"
  ) {
    throw new HttpError(400, "Payment details do not match this order.");
  }
}

export async function settlePayment(db: Db, order: SettleOrder, payment: RzpPayment): Promise<SettleOutcome> {
  assertPaymentMatchesOrder(order, payment);

  // Razorpay accounts with manual capture leave payments 'authorized'. Capture them now, otherwise they
  // are auto-refunded by the bank after ~5 days and the customer is left with an unpaid order.
  let status = payment.status;
  if (status === "authorized") {
    try {
      const captured = await capturePayment(payment.id, payment.amount);
      status = captured.status;
    } catch (e) {
      if (e instanceof RazorpayError) throw new HttpError(502, "Could not capture the payment yet. It will be retried automatically.");
      throw e;
    }
  }
  if (status !== "captured") return { outcome: "not_captured", paymentStatus: status };

  const { data, error } = await db.rpc("confirm_order_payment_and_commit_inventory", {
    p_order_id: order.id,
    p_razorpay_payment_id: payment.id,
  });
  if (error) {
    console.error("confirm_order_payment failed:", error.message);
    throw new HttpError(500, "Payment was received but the order needs reconciliation. Do not pay again.");
  }
  const r = data as {
    success: boolean; alreadyProcessed?: boolean; recovered?: boolean; needsRefund?: boolean; duplicatePayment?: boolean;
  };

  if (r.success) {
    if (r.alreadyProcessed) return { outcome: "already_paid" };
    await sendMail(await userEmail(db, order.user_id, order.id), "order_confirmed", {
      name: order.customer_name, orderNumber: order.order_number,
    });
    // Scratch card (only if the owner switched the feature on). Must never break a paid order.
    try {
      await db.rpc("issue_scratch_card", { p_order_id: order.id });
    } catch (e) {
      console.error("scratch card issue failed:", e instanceof Error ? e.message : e);
    }
    return { outcome: "paid", recovered: r.recovered === true };
  }

  if (r.needsRefund) {
    const reason = r.duplicatePayment ? "duplicate_payment" : "late_payment";
    try {
      const refund = await issueRefund(db, {
        orderId: order.id,
        amountPaise: payment.amount,
        reason,
        actor: "system",
        ...(r.duplicatePayment ? { paymentId: payment.id, paymentMaxPaise: payment.amount } : {}),
      });
      return { outcome: "refund_started", reason, refundStatus: refund.status };
    } catch (e) {
      // The refund row is already saved ('creating'); the reconcile job retries with the same idempotency key.
      console.error("Automatic refund could not be sent yet:", e instanceof Error ? e.message : e);
      return { outcome: "refund_pending_retry", reason };
    }
  }
  throw new HttpError(500, "Order payment state needs reconciliation.");
}
