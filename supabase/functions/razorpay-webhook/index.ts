// Razorpay -> us. Verified by HMAC over the RAW body, de-duplicated by event id, safe to receive twice or out of order.
// Dashboard setup: Webhook URL = https://<project>.supabase.co/functions/v1/razorpay-webhook
// Events to tick: payment.authorized, payment.captured, payment.failed, order.paid, refund.created, refund.processed, refund.failed
import { errorResponse, HttpError } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { requireEnv } from "../_shared/env.ts";
import { RazorpayError, fetchPayment, type RzpPayment, verifyWebhookSignature } from "../_shared/razorpay.ts";
import { SETTLE_ORDER_COLUMNS, type SettleOrder, settlePayment } from "../_shared/payments.ts";
import { sendMail } from "../_shared/notify.ts";
import { userEmail } from "../_shared/supabase.ts";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// deno-lint-ignore no-explicit-any
type Rec = Record<string, any>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  let secret: string;
  try {
    secret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
  } catch (e) {
    return errorResponse(e);
  }

  const rawBody = await req.text();
  if (!rawBody || rawBody.length > 1_000_000) return reply({ error: "Invalid payload size." }, 400);
  if (!(await verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature") ?? "", secret))) {
    return reply({ error: "Invalid webhook signature." }, 401);
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? "";
  if (!eventId || eventId.length > 255) return reply({ error: "Missing event id." }, 400);

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return reply({ error: "Invalid JSON." }, 400); }
  if (!isRec(parsed) || typeof parsed.event !== "string") return reply({ error: "Invalid event." }, 400);
  const event = parsed.event;

  const db = adminClient();
  const { data: claim, error: claimError } = await db.rpc("claim_payment_webhook_event", { p_event_id: eventId, p_event_type: event });
  if (claimError || !isRec(claim)) {
    console.error("Could not claim webhook event:", claimError?.message);
    return reply({ error: "Could not claim event." }, 500);
  }
  if (claim.claimed !== true) {
    if (claim.reason === "already_processed") return reply({ received: true, duplicate: true });
    return reply({ error: "Event is being processed; retry later." }, 500);
  }
  const claimToken = String(claim.claimToken ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(claimToken)) return reply({ error: "Invalid claim." }, 500);

  let finalized = false;
  const release = async () => {
    if (finalized) return;
    const { error } = await db.rpc("release_payment_webhook_event_claim", { p_event_id: eventId, p_claim_token: claimToken });
    if (error) console.error("Could not release claim:", error.message);
  };

  try {
    const result = await handleEvent(db, event, parsed.payload);
    const { data, error } = await db.rpc("complete_payment_webhook_event", { p_event_id: eventId, p_claim_token: claimToken });
    if (error || !isRec(data) || data.success !== true) {
      await release();
      return reply({ error: "Could not finalize event; retry later." }, 500);
    }
    finalized = true;
    return reply({ received: true, ...result });
  } catch (e) {
    await release();
    if (e instanceof HttpError && e.status < 500) {
      // A bad/mismatching event will never succeed by retrying; record it and tell Razorpay we got it.
      console.error(`Webhook ${event} rejected:`, e.message);
      await db.rpc("complete_payment_webhook_event", { p_event_id: eventId, p_claim_token: claimToken });
      return reply({ received: true, ignored: true, reason: e.message });
    }
    console.error("Webhook processing error:", e instanceof Error ? e.message : e);
    return reply({ error: "Processing failed; retry later." }, 500);
  }
});

async function handleEvent(db: ReturnType<typeof adminClient>, event: string, payload: unknown): Promise<Rec> {
  if (!isRec(payload)) return { ignored: true };

  if (event === "payment.authorized" || event === "payment.captured" || event === "order.paid") {
    let entity: Rec | null = isRec(payload.payment) && isRec(payload.payment.entity) ? payload.payment.entity : null;
    if (!entity && isRec(payload.order) && isRec(payload.order.entity) && typeof payload.order.entity.id === "string") {
      // order.paid without a payment entity: ask Razorpay for the payments on that order
      const { fetchOrderPayments } = await import("../_shared/razorpay.ts");
      const list = await fetchOrderPayments(payload.order.entity.id);
      entity = list.find((p) => p.status === "captured") ?? null;
    }
    if (!entity || typeof entity.id !== "string") return { ignored: true, reason: "no payment" };

    // Never trust webhook data blindly: re-read the payment from Razorpay (also protects against reordered events).
    let payment: RzpPayment;
    try {
      payment = await fetchPayment(entity.id);
    } catch (e) {
      if (e instanceof RazorpayError) throw new HttpError(502, "Could not read the payment from Razorpay.");
      throw e;
    }
    if (!payment.order_id) return { ignored: true, reason: "payment has no order" };

    const { data: order, error } = await db.from("orders").select(SETTLE_ORDER_COLUMNS).eq("razorpay_order_id", payment.order_id).maybeSingle();
    if (error) throw new HttpError(500, "Could not load the order.");
    if (!order) throw new HttpError(500, "Matching order not found yet."); // 5xx -> Razorpay retries (order row may still be saving)

    const outcome = await settlePayment(db, order as SettleOrder, payment);
    return { outcome: outcome.outcome };
  }

  if (event === "payment.failed") {
    const entity = isRec(payload.payment) && isRec(payload.payment.entity) ? payload.payment.entity : null;
    if (entity && typeof entity.order_id === "string") {
      // Informational only. The customer can retry on the same Razorpay order, so we do NOT cancel anything here.
      await db.from("orders").update({ payment_error: String(entity.error_description ?? "Payment failed").slice(0, 300) })
        .eq("razorpay_order_id", entity.order_id).eq("payment_status", "pending");
    }
    return { noted: true };
  }

  if (event === "refund.created" || event === "refund.processed" || event === "refund.failed") {
    const entity = isRec(payload.refund) && isRec(payload.refund.entity) ? payload.refund.entity : null;
    if (!entity || typeof entity.id !== "string") return { ignored: true };
    const status = event === "refund.processed" ? "processed" : event === "refund.failed" ? "failed" : "pending";
    const { data, error } = await db.rpc("apply_refund_update", {
      p_razorpay_refund_id: entity.id, p_status: status,
      p_speed_processed: entity.speed_processed ?? null,
      p_error: status === "failed" ? "Razorpay reported the refund as failed" : null,
    });
    if (error) throw new HttpError(500, "Could not record the refund update.");
    const r = data as { matched?: boolean; ignored?: boolean; orderId?: string; previousStatus?: string; status?: string };
    if (r.matched === false) return { ignored: true, reason: "refund not created by this system" };
    if (!r.ignored && r.orderId && r.previousStatus !== status && (status === "processed")) {
      const { data: o } = await db.from("orders").select("user_id,order_number,customer_name").eq("id", r.orderId).maybeSingle();
      if (o) {
        await sendMail(await userEmail(db, o.user_id, r.orderId), "refund_processed", {
          name: o.customer_name, orderNumber: o.order_number, amountRupees: Number(entity.amount ?? 0) / 100 || null,
        });
      }
    }
    return { refund: status };
  }

  return { ignored: true };
}
