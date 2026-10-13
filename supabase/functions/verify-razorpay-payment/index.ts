import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value);
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

async function createHmacHex(
  secret: string,
  message: string,
): Promise<string> {
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
    new TextEncoder().encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  if (
    !supabaseUrl || !anonKey || !serviceRoleKey ||
    !razorpayKeyId || !razorpayKeySecret
  ) {
    return jsonResponse(
      { error: "Payment verification is not configured." },
      500,
    );
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Please sign in again." }, 401);
  }

  try {
    const token = authorization.slice("Bearer ".length).trim();

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Your session is invalid." }, 401);
    }

    const userId = authData.user.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }

    if (!isRecord(body)) {
      return jsonResponse({ error: "Invalid request." }, 400);
    }

    const razorpayOrderId = body.razorpay_order_id;
    const razorpayPaymentId = body.razorpay_payment_id;
    const razorpaySignature = body.razorpay_signature;

    if (
      typeof razorpayOrderId !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) ||
      typeof razorpayPaymentId !== "string" ||
      !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId) ||
      typeof razorpaySignature !== "string"
    ) {
      return jsonResponse(
        { error: "Payment details are missing or invalid." },
        400,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Only retrieve an order belonging to the signed-in customer.
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select(
        "id, user_id, total_amount, payment_status, razorpay_order_id, razorpay_payment_id, inventory_status",
      )
      .eq("user_id", userId)
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (orderError) {
      return jsonResponse({ error: "Could not verify the order." }, 500);
    }

    if (!order) {
      return jsonResponse(
        { error: "The payment order was not found for your account." },
        404,
      );
    }

    // Safe retry: the same already-confirmed payment can be verified again.
    if (
      order.payment_status === "paid" &&
      order.razorpay_payment_id === razorpayPaymentId &&
      order.inventory_status === "committed"
    ) {
      return jsonResponse({
        success: true,
        payment_status: "paid",
        order_id: order.id,
        message: "Payment is already confirmed.",
      });
    }

    if (order.payment_status === "paid") {
      return jsonResponse(
        { error: "This order is already linked to another payment." },
        409,
      );
    }

    // Verify signature using the Razorpay order ID stored in our database.
    const expectedSignature = await createHmacHex(
      razorpayKeySecret,
      `${order.razorpay_order_id}|${razorpayPaymentId}`,
    );

    if (!safeEqualHex(expectedSignature, razorpaySignature)) {
      return jsonResponse({ error: "Payment signature is invalid." }, 400);
    }

    // Verify the payment with Razorpay itself, not just browser data.
    const razorpayResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!razorpayResponse.ok) {
      return jsonResponse(
        { error: "Could not confirm payment status with Razorpay. Please retry." },
        502,
      );
    }

    const payment: unknown = await razorpayResponse.json();

    if (!isRecord(payment)) {
      return jsonResponse({ error: "Invalid payment response." }, 502);
    }

    const expectedAmountPaise = Math.round(
      Number(order.total_amount) * 100,
    );

    if (
      payment.id !== razorpayPaymentId ||
      payment.order_id !== order.razorpay_order_id ||
      payment.amount !== expectedAmountPaise ||
      payment.currency !== "INR"
    ) {
      return jsonResponse(
        { error: "Payment details do not match this order." },
        400,
      );
    }

    // Do not mark authorized or failed payments as paid.
    if (payment.status !== "captured" || payment.captured !== true) {
      return jsonResponse(
        {
          success: false,
          payment_status: typeof payment.status === "string"
            ? payment.status
            : "unknown",
          message:
            "Payment has not been captured yet. Your order has not been marked as paid.",
        },
        409,
      );
    }

    // One atomic database transition confirms payment and commits the stock
    // reservation. The webhook uses the same RPC, so concurrent callbacks are safe.
    const { data: confirmation, error: confirmationError } = await admin.rpc(
      "confirm_order_payment_and_commit_inventory",
      {
        p_order_id: order.id,
        p_razorpay_payment_id: razorpayPaymentId,
      },
    );

    if (confirmationError || !isRecord(confirmation) || confirmation.success !== true ||
      confirmation.paymentStatus !== "paid" || confirmation.inventoryStatus !== "committed") {
      console.error("Payment was captured but order finalization needs reconciliation:", confirmationError);
      return jsonResponse(
        {
          error: "Payment was verified, but order finalization needs reconciliation. Do not pay again; contact support.",
          payment_verified: true,
        },
        500,
      );
    }

    return jsonResponse({
      success: true,
      payment_status: "paid",
      order_id: order.id,
      message: confirmation.alreadyProcessed === true
        ? "Payment is already confirmed."
        : "Payment verified and recorded.",
    });
  } catch {
    return jsonResponse(
      { error: "An unexpected verification error occurred. Please retry." },
      500,
    );
  }
});