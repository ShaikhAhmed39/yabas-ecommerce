import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) {
    return false;
  }

  const left = a.toLowerCase();
  const right = b.toLowerCase();
  let difference = 0;

  for (let i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return difference === 0;
}

function isRazorpayId(
  value: unknown,
  prefix: "order_" | "pay_",
): value is string {
  return typeof value === "string" &&
    value.length <= 100 &&
    new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(value);
}

type Claim = {
  claimed: boolean;
  reason?: string;
  claimToken?: string;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("Required webhook configuration is missing.");
    return jsonResponse({ error: "Webhook is not configured." }, 500);
  }

  const rawBody = await req.text();
  const receivedSignature = req.headers.get("x-razorpay-signature") ?? "";
  const eventId = req.headers.get("x-razorpay-event-id") ?? "";

  if (rawBody.length === 0 || rawBody.length > 1_000_000) {
    return jsonResponse({ error: "Invalid webhook payload size." }, 400);
  }

  const expectedSignature = await hmacHex(webhookSecret, rawBody);
  if (!safeEqualHex(expectedSignature, receivedSignature)) {
    return jsonResponse({ error: "Invalid webhook signature." }, 401);
  }

  if (!eventId || eventId.length > 255) {
    return jsonResponse({ error: "Missing or invalid event ID." }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  if (!isRecord(parsed) || typeof parsed.event !== "string") {
    return jsonResponse({ error: "Invalid event payload." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Atomically acquire a lease. The RPC returns a unique claim token so a stale
  // invocation cannot complete or release a newer invocation's claim.
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_payment_webhook_event",
    {
      p_event_id: eventId,
      p_event_type: parsed.event,
    },
  );

  if (claimError || !isRecord(claimData)) {
    console.error("Could not claim webhook event.", claimError);
    return jsonResponse({ error: "Could not claim webhook event." }, 500);
  }

  const claim = claimData as Claim;

  if (claim.claimed !== true) {
    if (claim.reason === "already_processed") {
      return jsonResponse({ received: true, duplicate: true });
    }
    if (claim.reason === "already_claimed") {
      // Ask Razorpay to retry later. If the active invocation crashes, a later
      // retry can reclaim the event after the five-minute lease expires.
      return jsonResponse({ error: "Event is already being processed; retry later." }, 500);
    }
    return jsonResponse({ error: "Webhook event could not be claimed." }, 500);
  }

  const claimToken = claim.claimToken;
  if (typeof claimToken !== "string" || !/^[0-9a-f-]{36}$/i.test(claimToken)) {
    console.error("Claim RPC returned no valid claim token.");
    return jsonResponse({ error: "Invalid event claim." }, 500);
  }

  let finalized = false;

  const releaseClaim = async (): Promise<void> => {
    if (finalized) return;
    const { error } = await admin.rpc("release_payment_webhook_event_claim", {
      p_event_id: eventId,
      p_claim_token: claimToken,
    });
    if (error) {
      console.error("Could not release webhook claim.", error);
    }
  };

  const markProcessed = async (): Promise<boolean> => {
    const { data, error } = await admin.rpc("complete_payment_webhook_event", {
      p_event_id: eventId,
      p_claim_token: claimToken,
    });

    if (error || !isRecord(data) || data.success !== true) {
      console.error("Could not complete webhook event.", error);
      return false;
    }
    finalized = true;
    return true;
  };

  try {
    const processEvent = async (): Promise<Response> => {
      // Ignore unrelated event types but record them as processed below.
      if (parsed.event !== "payment.captured" && parsed.event !== "order.paid") {
        return jsonResponse({ received: true, ignored: true });
      }

      const payload = parsed.payload;
      if (!isRecord(payload)) {
        return jsonResponse({ error: "Missing event payload." }, 400);
      }

      // Razorpay payment.captured contains payload.payment.entity. For order.paid,
      // prefer the payment entity if present; otherwise use the order entity and
      // its payments array when supplied by Razorpay.
      let payment: Record<string, unknown> | null = null;
      if (isRecord(payload.payment) && isRecord(payload.payment.entity)) {
        payment = payload.payment.entity;
      } else if (
        parsed.event === "order.paid" &&
        isRecord(payload.order) &&
        isRecord(payload.order.entity)
      ) {
        const orderEntity = payload.order.entity;
        const payments = orderEntity.payments;
        if (isRecord(payments) && Array.isArray(payments.items)) {
          const captured = payments.items.find((item) =>
            isRecord(item) && item.status === "captured"
          );
          if (isRecord(captured)) payment = captured;
        }
      }

      if (!payment) {
        return jsonResponse({ error: "Missing payment details." }, 400);
      }

      const paymentId = payment.id;
      const razorpayOrderId = payment.order_id;
      const amount = payment.amount;
      const currency = payment.currency;

      if (
        !isRazorpayId(paymentId, "pay_") ||
        !isRazorpayId(razorpayOrderId, "order_") ||
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        currency !== "INR"
      ) {
        return jsonResponse({ error: "Invalid payment details." }, 400);
      }

      if (payment.status !== "captured" || payment.captured !== true) {
        return jsonResponse({
          received: true,
          ignored: true,
          reason: "Payment is not captured.",
        });
      }

      const { data: order, error: orderError } = await admin
        .from("orders")
        .select(
          "id, total_amount, payment_status, razorpay_order_id, razorpay_payment_id, inventory_status",
        )
        .eq("razorpay_order_id", razorpayOrderId)
        .maybeSingle();

      if (orderError) {
        console.error("Could not retrieve matching order.", orderError);
        return jsonResponse({ error: "Could not retrieve order." }, 500);
      }

      if (!order) {
        return jsonResponse({ error: "Matching order not found." }, 500);
      }

      const total = Number(order.total_amount);
      const expectedAmountPaise = Math.round(total * 100);

      if (
        !Number.isFinite(total) ||
        !Number.isSafeInteger(expectedAmountPaise) ||
        expectedAmountPaise <= 0 ||
        amount !== expectedAmountPaise
      ) {
        console.error("Webhook amount does not match order.", {
          orderId: order.id,
          razorpayOrderId,
        });
        return jsonResponse({ error: "Payment amount mismatch." }, 400);
      }

      const { data: confirmation, error: confirmationError } = await admin.rpc(
        "confirm_order_payment_and_commit_inventory",
        {
          p_order_id: order.id,
          p_razorpay_payment_id: paymentId,
        },
      );

      if (
        confirmationError ||
        !isRecord(confirmation) ||
        confirmation.success !== true ||
        confirmation.paymentStatus !== "paid" ||
        confirmation.inventoryStatus !== "committed"
      ) {
        console.error("Webhook payment finalization needs reconciliation.", {
          orderId: order.id,
          error: confirmationError,
        });
        return jsonResponse(
          { error: "Order payment/inventory state needs reconciliation." },
          500,
        );
      }

      return jsonResponse({
        received: true,
        payment_status: "paid",
        inventory_status: "committed",
        alreadyProcessed: confirmation.alreadyProcessed === true,
      });
    };

    const response = await processEvent();

    if (response.status >= 400) {
      await releaseClaim();
      return response;
    }

    if (!(await markProcessed())) {
      await releaseClaim();
      return jsonResponse({ error: "Could not finalize event; retry later." }, 500);
    }

    return response;
  } catch (error) {
    console.error("Unexpected webhook error.", error);
    await releaseClaim();
    return jsonResponse({ error: "Unexpected webhook error." }, 500);
  }
});
