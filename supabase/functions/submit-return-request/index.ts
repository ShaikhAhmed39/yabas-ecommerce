
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Required Supabase environment variables are missing.");
      return response({ error: "Server configuration error." }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response({ error: "Please sign in first." }, 401);
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return response({ error: "Invalid authorization token." }, 401);
    }

    // Verify the customer's access token.
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return response({ error: "Your session is invalid or expired." }, 401);
    }

    // Service-role access is used only on the server.
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let body: {
      order_id?: unknown;
      order_item_id?: unknown;
      reason?: unknown;
      description?: unknown;
    };

    try {
      body = await req.json();
    } catch {
      return response({ error: "Invalid JSON request." }, 400);
    }

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const orderId =
      typeof body.order_id === "string" ? body.order_id : "";
    const orderItemId =
      typeof body.order_item_id === "string" ? body.order_item_id : "";
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    if (!uuidPattern.test(orderId) || !uuidPattern.test(orderItemId)) {
      return response({ error: "Invalid order or item ID." }, 400);
    }

    if (reason.length < 3 || reason.length > 100) {
      return response(
        { error: "The return reason must be 3–100 characters." },
        400,
      );
    }

    if (description.length < 10 || description.length > 2000) {
      return response(
        { error: "The description must be 10–2000 characters." },
        400,
      );
    }

    // Verify order ownership on the server.
    const { data: order, error: orderError } = await db
      .from("orders")
      .select(
        "id, user_id, payment_status, delivery_status, delivered_at",
      )
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderError) {
      console.error("Order lookup failed:", orderError.message);
      return response({ error: "Unable to verify this order." }, 500);
    }

    if (!order) {
      return response(
        { error: "Order not found or you do not have access to it." },
        404,
      );
    }

    
const paymentStatus = (order.payment_status ?? "").toLowerCase();

const isPaymentSuccessful = ["captured", "paid"].includes(paymentStatus);

if (!isPaymentSuccessful) {
  return response(
    {
      error:
        "Only successfully paid orders can be submitted for return.",
    },
    400,
  );
}


    if (
      order.delivery_status !== "delivered" ||
      !order.delivered_at
    ) {
      return response(
        {
          error:
            "A return can be requested only after delivery has been recorded.",
        },
        400,
      );
    }

    const deliveredAt = new Date(order.delivered_at).getTime();

    if (!Number.isFinite(deliveredAt) || deliveredAt > Date.now()) {
      return response({ error: "Invalid delivery date." }, 400);
    }

    const returnDeadline = deliveredAt + 7 * 24 * 60 * 60 * 1000;

    if (Date.now() > returnDeadline) {
      return response(
        { error: "The 7-day return request window has expired." },
        400,
      );
    }

    // Confirm that this item belongs to the specified order.
    const { data: orderItem, error: itemError } = await db
      .from("order_items")
      .select("id, order_id")
      .eq("id", orderItemId)
      .eq("order_id", orderId)
      .maybeSingle();

    if (itemError) {
      console.error("Order item lookup failed:", itemError.message);
      return response({ error: "Unable to verify the order item." }, 500);
    }

    if (!orderItem) {
      return response(
        { error: "This item does not belong to the selected order." },
        400,
      );
    }

    // Prevent another active request for the same item.
    const { data: existing, error: existingError } = await db
      .from("return_requests")
      .select("id, status")
      .eq("order_id", orderId)
      .eq("order_item_id", orderItemId);

    if (existingError) {
      console.error("Return lookup failed:", existingError.message);
      return response({ error: "Unable to check existing return requests." }, 500);
    }

    const activeStatuses = new Set([
      "requested",
      "approved",
      "pickup_scheduled",
      "received",
      "inspection_passed",
      "inspection_failed",
      "refund_pending",
      "refund_initiated",
      "completed",
    ]);

    if (existing?.some((item) => activeStatuses.has(item.status))) {
      return response(
        { error: "A return request already exists for this item." },
        409,
      );
    }

    // Never accept user_id from the browser.
    const { data: returnRequest, error: insertError } = await db
      .from("return_requests")
      .insert({
        order_id: orderId,
        order_item_id: orderItemId,
        user_id: user.id,
        reason,
        description,
        status: "requested",
      })
      .select("id, order_id, order_item_id, status, created_at")
      .single();

    if (insertError) {
      console.error("Return request insert failed:", insertError.message);
      return response({ error: "Unable to submit your return request." }, 500);
    }

    return response(
      {
        message: "Your return request has been submitted.",
        return_request: returnRequest,
      },
      201,
    );
  } catch (error) {
    console.error(
      "Unexpected return submission error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return response({ error: "An unexpected server error occurred." }, 500);
  }
});
