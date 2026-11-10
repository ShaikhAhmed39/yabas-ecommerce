// Issues refunds safely: DB row first (caps + idempotency), then Razorpay, then DB result.
import type { Db } from "./supabase.ts";
import { HttpError, rpcError } from "./http.ts";
import { createRefund, RazorpayError } from "./razorpay.ts";

export type RefundReason = "return" | "cancellation" | "late_payment" | "duplicate_payment" | "admin";

export interface IssueRefundInput {
  orderId: string;
  returnRequestId?: string | null;
  amountPaise: number;
  reason: RefundReason;
  actor: string;
  /** Only for a payment other than the order's own (duplicate payments). */
  paymentId?: string;
  paymentMaxPaise?: number;
}

export interface IssueRefundResult {
  refundId: string;
  orderId: string;
  status: "creating" | "pending" | "processed" | "failed";
  /** true if this refund already existed before this call */
  existing: boolean;
  /** status before this call finished (used to avoid sending the same e-mail twice) */
  previousStatus: string;
}

interface BeginRefund {
  refundId: string;
  existing: boolean;
  status: "creating" | "pending" | "processed" | "failed";
  idempotencyKey: string;
  paymentId: string;
  amountPaise: number;
}

const REFUND_RULES: Array<[RegExp, number, string]> = [
  [/refund exceeds/i, 409, "That is more than the amount still refundable for this payment."],
  [/not ready for refund|not in a refundable state/i, 409, "This order or return is not ready for a refund."],
  [/does not match the approved amount/i, 409, "The refund amount must match the approved amount."],
  [/no captured payment/i, 409, "This order has no captured payment to refund."],
  [/not found/i, 404, "Order or return request not found."],
];

/** Sends one refund row to Razorpay (safe to repeat: same idempotency key) and records the outcome. */
export async function sendRefundToRazorpay(
  db: Db,
  refund: { refundId: string; idempotencyKey: string; paymentId: string; amountPaise: number; orderId: string },
  previousStatus: string,
  existing: boolean,
): Promise<IssueRefundResult> {
  try {
    const rz = await createRefund({
      paymentId: refund.paymentId,
      amountPaise: refund.amountPaise,
      idempotencyKey: refund.idempotencyKey,
      receipt: `rf${refund.refundId.replace(/-/g, "")}`,
      notes: { yaba_refund_id: refund.refundId, yaba_order_id: refund.orderId },
    });
    const status = rz.status === "processed" ? "processed" : rz.status === "failed" ? "failed" : "pending";
    const { error } = await db.rpc("finalize_refund", {
      p_refund_id: refund.refundId,
      p_razorpay_refund_id: rz.id,
      p_status: status,
      p_speed_processed: rz.speed_processed ?? null,
      p_error: status === "failed" ? "Razorpay reported the refund as failed" : null,
    });
    if (error) throw rpcError(error);
    return { refundId: refund.refundId, orderId: refund.orderId, status, existing, previousStatus };
  } catch (e) {
    if (e instanceof RazorpayError) {
      if (e.definitive) {
        await db.rpc("finalize_refund", {
          p_refund_id: refund.refundId,
          p_razorpay_refund_id: null,
          p_status: "failed",
          p_speed_processed: null,
          p_error: e.message,
        });
        throw new HttpError(422, `Razorpay refused the refund: ${e.message}`);
      }
      // Unknown outcome: keep the row as 'creating'. The reconcile job retries with the SAME idempotency key.
      console.error("Refund outcome unknown, will be retried:", e.message);
      throw new HttpError(502, "Razorpay did not answer. The refund is saved and will be retried automatically.");
    }
    throw e;
  }
}

export async function issueRefund(db: Db, input: IssueRefundInput): Promise<IssueRefundResult> {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new HttpError(400, "Refund amount must be a positive amount.");
  }
  const { data, error } = await db.rpc("begin_refund", {
    p_order_id: input.orderId,
    p_return_request_id: input.returnRequestId ?? null,
    p_amount_paise: input.amountPaise,
    p_reason: input.reason,
    p_actor: input.actor,
    p_payment_id: input.paymentId ?? null,
    p_payment_max_paise: input.paymentMaxPaise ?? null,
  });
  if (error) throw rpcError(error, REFUND_RULES);

  const begin = data as BeginRefund;
  if (begin.existing && begin.status !== "creating") {
    return {
      refundId: begin.refundId,
      orderId: input.orderId,
      status: begin.status,
      existing: true,
      previousStatus: begin.status,
    };
  }
  return await sendRefundToRazorpay(
    db,
    {
      refundId: begin.refundId,
      idempotencyKey: begin.idempotencyKey,
      paymentId: begin.paymentId,
      amountPaise: begin.amountPaise,
      orderId: input.orderId,
    },
    "creating",
    begin.existing,
  );
}
