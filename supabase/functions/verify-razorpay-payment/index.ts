// Called by the browser right after Razorpay checkout succeeds. The browser is NOT trusted:
// we check the signature, then ask Razorpay itself for the payment, then settle the order.
import { corsHeaders, errorResponse, HttpError, json, preflight, readJson, requirePost } from "../_shared/http.ts";
import { adminClient, authenticate } from "../_shared/supabase.ts";
import { requireEnv } from "../_shared/env.ts";
import { fetchPayment, RazorpayError, verifyCheckoutSignature } from "../_shared/razorpay.ts";
import { SETTLE_ORDER_COLUMNS, type SettleOrder, settlePayment } from "../_shared/payments.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user } = await authenticate(req);
    const body = await readJson(req);

    const rzpOrderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;
    if (
      typeof rzpOrderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(rzpOrderId) ||
      typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
      typeof signature !== "string" || signature.length > 200
    ) throw new HttpError(400, "Payment details are missing or invalid.");

    const db = adminClient();
    const { data: order, error } = await db
      .from("orders").select(SETTLE_ORDER_COLUMNS)
      .eq("user_id", user.id).eq("razorpay_order_id", rzpOrderId).maybeSingle();
    if (error) throw new HttpError(500, "Could not verify the order.");
    if (!order) throw new HttpError(404, "The payment order was not found for your account.");

    if (!(await verifyCheckoutSignature(rzpOrderId, paymentId, signature, requireEnv("RAZORPAY_KEY_SECRET")))) {
      throw new HttpError(400, "Payment signature is invalid.");
    }

    let payment;
    try {
      payment = await fetchPayment(paymentId);
    } catch (e) {
      if (e instanceof RazorpayError) throw new HttpError(502, "Could not confirm the payment with Razorpay. Please retry in a moment.");
      throw e;
    }

    const result = await settlePayment(db, order as SettleOrder, payment);
    switch (result.outcome) {
      case "paid":
      case "already_paid":
        return json({ success: true, payment_status: "paid", order_id: order.id, order_number: order.order_number }, 200, req);
      case "not_captured":
        // 202 = "not paid yet": the browser keeps polling; the webhook will settle it when Razorpay captures.
        return json({ success: false, pending: true, payment_status: result.paymentStatus, order_id: order.id,
          message: "Your payment is still being confirmed by the bank." }, 202, req);
      default:
        // Paid but the item sold out meanwhile (or the order was cancelled): we refund automatically.
        return json({
          success: false, refunded: true, order_id: order.id,
          message: "Your payment arrived after the items were no longer available. A full refund has been started automatically.",
        }, 409, req);
    }
  } catch (e) {
    return errorResponse(e, req);
  }
});
void corsHeaders;
