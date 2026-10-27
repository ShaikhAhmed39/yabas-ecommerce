import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "cancelled",
] as const;

Deno.serve(async (req: Request) => {
  // Catch option pre-flight requests from frontend
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.slice("Bearer ".length);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Server configuration is incomplete.");
    }

    // Verify the user's JWT with Supabase Auth.
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: authData, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the service role only after authenticating the caller.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Confirm the caller is in the trusted admin allowlist.
    const { data: admin, error: adminError } = await adminClient
      .from("admin_users")
      .select("id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Admin authorization lookup failed:", adminError);
      return new Response(
        JSON.stringify({ error: "Could not verify administrator access." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!admin) {
      return new Response(
        JSON.stringify({ error: "Administrator access required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const orderId = body?.order_id;
    const nextStatus = body?.delivery_status;
    const expectedStatus = body?.expected_delivery_status;

    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    ) {
      return new Response(
        JSON.stringify({ error: "A valid order ID is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (
      typeof nextStatus !== "string" ||
      !ALLOWED_STATUSES.includes(
        nextStatus as (typeof ALLOWED_STATUSES)[number],
      )
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid delivery status." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (
      typeof expectedStatus !== "string" ||
      !ALLOWED_STATUSES.includes(
        expectedStatus as (typeof ALLOWED_STATUSES)[number],
      )
    ) {
      return new Response(
        JSON.stringify({ error: "A valid expected delivery status is required. Refresh the order and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read the current status and delivery timestamp before attempting a guarded update.
    const { data: existingOrder, error: existingOrderError } = await adminClient
      .from("orders")
      .select("id, delivery_status, delivered_at")
      .eq("id", orderId)
      .maybeSingle();

    if (existingOrderError) {
      console.error("Delivery status lookup failed:", existingOrderError);
      return new Response(
        JSON.stringify({ error: "Could not verify the existing order." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existingOrder) {
      return new Response(
        JSON.stringify({ error: "Order not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingOrder.delivery_status !== expectedStatus) {
      return new Response(
        JSON.stringify({ error: "This order was updated elsewhere. Refresh the order list and try again." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delivery updates must not overwrite the order's independent lifecycle status.
    // Set delivered_at once on first delivery; never clear or reset its history here.
    const updatePayload: { delivery_status: string; delivered_at?: string } = {
      delivery_status: nextStatus,
    };

    if (nextStatus === "delivered" && !existingOrder.delivered_at) {
      updatePayload.delivered_at = new Date().toISOString();
    }

    const { data: order, error: updateError } = await adminClient
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .eq("delivery_status", existingOrder.delivery_status)
      .select("id, status, delivery_status, delivered_at")
      .maybeSingle();

    if (updateError) {
      console.error("Delivery update failed:", updateError);
      return new Response(
        JSON.stringify({ error: "Could not update delivery status." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: "This order changed during the update. Refresh the order list and try again." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, order }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected delivery function error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
