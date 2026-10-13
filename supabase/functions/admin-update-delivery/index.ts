
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401, headers: corsHeaders },
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
      return Response.json(
        { error: "Invalid or expired session." },
        { status: 401, headers: corsHeaders },
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
      return Response.json(
        { error: "Could not verify administrator access." },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!admin) {
      return Response.json(
        { error: "Administrator access required." },
        { status: 403, headers: corsHeaders },
      );
    }

    const body = await req.json();
    const orderId = body?.order_id;
    const nextStatus = body?.delivery_status;

    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    ) {
      return Response.json(
        { error: "A valid order ID is required." },
        { status: 400, headers: corsHeaders },
      );
    }

    if (
      typeof nextStatus !== "string" ||
      !ALLOWED_STATUSES.includes(
        nextStatus as (typeof ALLOWED_STATUSES)[number],
      )
    ) {
      return Response.json(
        { error: "Invalid delivery status." },
        { status: 400, headers: corsHeaders },
      );
    }

    // Record a delivery timestamp only when marking the order delivered.
    const updatePayload = {
      delivery_status: nextStatus,
      delivered_at:
        nextStatus === "delivered" ? new Date().toISOString() : null,
    };

    const { data: order, error: updateError } = await adminClient
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select("id, delivery_status, delivered_at")
      .maybeSingle();

    if (updateError) {
      console.error("Delivery update failed:", updateError);
      return Response.json(
        { error: "Could not update delivery status." },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!order) {
      return Response.json(
        { error: "Order not found." },
        { status: 404, headers: corsHeaders },
      );
    }

    return Response.json(
      { success: true, order },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("Unexpected delivery function error:", error);
    return Response.json(
      { error: "Unexpected server error." },
      { status: 500, headers: corsHeaders },
    );
  }
});
