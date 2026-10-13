
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "approve"
  | "reject"
  | "schedule_pickup"
  | "mark_received"
  | "inspection_passed"
  | "inspection_failed"
  | "mark_refund_pending"
  | "cancel";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

const transitions: Record<Action, { from: string[]; to: string }> = {
  approve: {
    from: ["requested"],
    to: "approved",
  },
  reject: {
    from: ["requested", "approved"],
    to: "rejected",
  },
  schedule_pickup: {
    from: ["approved"],
    to: "pickup_scheduled",
  },
  mark_received: {
    from: ["pickup_scheduled", "approved"],
    to: "received",
  },
  inspection_passed: {
    from: ["received"],
    to: "inspection_passed",
  },
  inspection_failed: {
    from: ["received"],
    to: "inspection_failed",
  },
  mark_refund_pending: {
    from: ["inspection_passed"],
    to: "refund_pending",
  },
  cancel: {
    from: ["requested", "approved"],
    to: "cancelled",
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Missing Supabase environment configuration.");
      return respond({ error: "Server configuration error." }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return respond({ error: "Please sign in first." }, 401);
    }

    const token = authorization.slice(7).trim();

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
      return respond({ error: "Invalid or expired session." }, 401);
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify admin access on the server; never trust frontend isAdmin.
    const { data: admin, error: adminError } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      console.error("Admin authorization lookup failed:", adminError.message);
      return respond({ error: "Unable to verify administrator access." }, 500);
    }

    if (!admin) {
      return respond({ error: "Administrator access required." }, 403);
    }

    let body: {
      return_request_id?: unknown;
      action?: unknown;
      admin_note?: unknown;
      rejection_reason?: unknown;
      refund_amount?: unknown;
      pickup_scheduled_at?: unknown;
    };

    try {
      body = await req.json();
    } catch {
      return respond({ error: "Invalid JSON request." }, 400);
    }

    const requestId =
      typeof body.return_request_id === "string"
        ? body.return_request_id
        : "";

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(requestId)) {
      return respond({ error: "Invalid return request ID." }, 400);
    }

    const action = body.action as Action;

    if (
      typeof action !== "string" ||
      !Object.prototype.hasOwnProperty.call(transitions, action)
    ) {
      return respond({ error: "Unsupported return-management action." }, 400);
    }

    const transition = transitions[action];

    const adminNote =
      typeof body.admin_note === "string" ? body.admin_note.trim() : "";

    const rejectionReason =
      typeof body.rejection_reason === "string"
        ? body.rejection_reason.trim()
        : "";

    if (adminNote.length > 2000 || rejectionReason.length > 1000) {
      return respond({ error: "The supplied note is too long." }, 400);
    }

    if (action === "reject" && rejectionReason.length < 3) {
      return respond(
        { error: "Provide a clear reason for rejecting the request." },
        400,
      );
    }

    let pickupScheduledAt: string | null = null;

    if (action === "schedule_pickup") {
      if (typeof body.pickup_scheduled_at !== "string") {
        return respond(
          { error: "A pickup date and time are required." },
          400,
        );
      }

      const timestamp = Date.parse(body.pickup_scheduled_at);

      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        return respond(
          { error: "Pickup must be scheduled for a valid future date." },
          400,
        );
      }

      pickupScheduledAt = new Date(timestamp).toISOString();
    }

    const { data: request, error: requestError } = await db
      .from("return_requests")
      .select("id, order_id, order_item_id, user_id, status, refund_amount")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      console.error("Return lookup failed:", requestError.message);
      return respond({ error: "Unable to load the return request." }, 500);
    }

    if (!request) {
      return respond({ error: "Return request not found." }, 404);
    }

    if (!transition.from.includes(request.status)) {
      return respond(
        {
          error: `Cannot perform '${action}' when the request status is '${request.status}'.`,
        },
        409,
      );
    }

    const updates: Record<string, unknown> = {
      status: transition.to,
      updated_at: new Date().toISOString(),
    };

    if (adminNote) {
      updates.admin_note = adminNote;
    }

    if (action === "reject") {
      updates.rejection_reason = rejectionReason;
    }

    if (action === "schedule_pickup") {
      updates.pickup_scheduled_at = pickupScheduledAt;
    }

    if (action === "mark_refund_pending") {
      if (
        typeof body.refund_amount !== "number" ||
        !Number.isFinite(body.refund_amount) ||
        body.refund_amount <= 0
      ) {
        return respond(
          { error: "Provide a valid positive refund amount." },
          400,
        );
      }

      const { data: item, error: itemError } = await db
        .from("order_items")
        .select("unit_price, quantity")
        .eq("id", request.order_item_id)
        .eq("order_id", request.order_id)
        .maybeSingle();

      if (itemError || !item) {
        console.error("Return item verification failed.");
        return respond({ error: "Unable to verify the returned item." }, 500);
      }

      const itemTotal =
        Math.round(Number(item.unit_price) * Number(item.quantity) * 100) / 100;

      if (
        !Number.isFinite(itemTotal) ||
        body.refund_amount > itemTotal
      ) {
        return respond(
          { error: "Refund amount cannot exceed this item's original total." },
          400,
        );
      }

      updates.refund_amount =
        Math.round(body.refund_amount * 100) / 100;
    }

    // Never permit this function to claim that money has been refunded.
    // Actual refund initiation must use a separately verified payment workflow.
    const { data: updated, error: updateError } = await db
      .from("return_requests")
      .update(updates)
      .eq("id", requestId)
      .eq("status", request.status)
      .select("id, status, admin_note, rejection_reason, pickup_scheduled_at, refund_amount, updated_at")
      .maybeSingle();

    if (updateError) {
      console.error("Return update failed:", updateError.message);
      return respond({ error: "Unable to update the return request." }, 500);
    }

    if (!updated) {
      return respond(
        {
          error:
            "The request changed during this operation. Refresh and try again.",
        },
        409,
      );
    }

    return respond({
      message: "Return request updated successfully.",
      return_request: updated,
    });
  } catch (error) {
    console.error(
      "Unexpected return-management error:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return respond({ error: "An unexpected server error occurred." }, 500);
  }
});
