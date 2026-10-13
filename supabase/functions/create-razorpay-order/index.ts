
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonObject = Record<string, unknown>;

type CustomerDetails = {
  customer_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  primary_phone: string;
  backup_phone: string | null;
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function validateCustomer(value: unknown):
  | { customer: CustomerDetails }
  | { error: string } {
  if (!isRecord(value)) {
    return { error: "Invalid customer details" };
  }

  const customerName = cleanString(value.customer_name);
  const address1 = cleanString(value.shipping_address_line1);
  const city = cleanString(value.city);
  const state = cleanString(value.state);
  const pincode = cleanString(value.pincode);
  const phone = cleanString(value.primary_phone);

  if (!customerName || customerName.length > 120) {
    return { error: "Invalid customer name" };
  }

  if (!address1 || address1.length > 300) {
    return { error: "Invalid delivery address" };
  }

  if (!city || city.length > 100) {
    return { error: "Invalid city" };
  }

  if (!state || state.length > 100) {
    return { error: "Invalid state" };
  }

  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return { error: "Pincode must contain exactly 6 digits" };
  }

  if (!phone || !/^\d{10}$/.test(phone)) {
    return { error: "Phone number must contain exactly 10 digits" };
  }

  const address2 = value.shipping_address_line2;
  const backupPhone = value.backup_phone;

  if (
    address2 !== undefined &&
    address2 !== null &&
    typeof address2 !== "string"
  ) {
    return { error: "Invalid second address line" };
  }

  if (
    backupPhone !== undefined &&
    backupPhone !== null &&
    typeof backupPhone !== "string"
  ) {
    return { error: "Invalid backup phone number" };
  }

  const normalizedBackupPhone =
    typeof backupPhone === "string" && backupPhone.trim()
      ? backupPhone.trim()
      : null;

  if (
    normalizedBackupPhone !== null &&
    !/^\d{10}$/.test(normalizedBackupPhone)
  ) {
    return { error: "Backup phone must contain exactly 10 digits" };
  }

  return {
    customer: {
      customer_name: customerName,
      shipping_address_line1: address1,
      shipping_address_line2:
        typeof address2 === "string" ? address2.trim() || null : null,
      city,
      state,
      pincode,
      primary_phone: phone,
      backup_phone: normalizedBackupPhone,
    },
  };
}

function paymentResponse(
  order: {
    id: string;
    total_amount: number | string;
    status: string;
    payment_status: string;
    razorpay_order_id: string | null;
  },
  keyId: string,
) {
  return response({
    orderId: order.id,
    razorpayOrderId: order.razorpay_order_id,
    amount: Math.round(Number(order.total_amount) * 100),
    currency: "INR",
    keyId,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceKey ||
      !razorpayKeyId ||
      !razorpayKeySecret
    ) {
      console.error("Required payment configuration is missing");
      return response({ error: "Payment service is not configured" }, 503);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response({ error: "Please sign in before checkout" }, 401);
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      return response({ error: "Invalid authentication token" }, 401);
    }

    // Validate the customer's Supabase access token.
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const { data: userData, error: authError } =
      await userClient.auth.getUser(token);

    if (authError || !userData.user) {
      return response({ error: "Your session is invalid or expired" }, 401);
    }

    // Privileged operations are performed only after authentication.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return response({ error: "Request body must be valid JSON" }, 400);
    }

    if (!isRecord(body)) {
      return response({ error: "Invalid checkout request" }, 400);
    }

    const { items, customer, checkout_request_id } = body;

    if (!isUuid(checkout_request_id)) {
      return response(
        { error: "A valid checkout_request_id is required" },
        400,
      );
    }

    const customerResult = validateCustomer(customer);

    if ("error" in customerResult) {
      return response({ error: customerResult.error }, 400);
    }

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return response({ error: "Invalid cart items" }, 400);
    }

    // Combine duplicate product IDs and reject malformed quantities.
    const quantities = new Map<string, number>();

    for (const item of items) {
      if (!isRecord(item) || !isUuid(item.product_id)) {
        return response({ error: "Invalid product in cart" }, 400);
      }

      if (
        !Number.isSafeInteger(item.quantity) ||
        Number(item.quantity) < 1 ||
        Number(item.quantity) > 20
      ) {
        return response({ error: "Invalid product quantity" }, 400);
      }

      const productId = item.product_id;
      const newQuantity =
        (quantities.get(productId) ?? 0) + Number(item.quantity);

      if (newQuantity > 20) {
        return response(
          { error: "Maximum quantity per product is 20" },
          400,
        );
      }

      quantities.set(productId, newQuantity);
    }

    // Fast-path safe retries. Legacy orders without a recorded reservation
    // cannot be reused by the hardened checkout flow.
    const { data: existing, error: existingError } = await admin
      .from("orders")
      .select(
        "id, user_id, total_amount, status, payment_status, razorpay_order_id, inventory_status",
      )
      .eq("user_id", userData.user.id)
      .eq("checkout_request_id", checkout_request_id)
      .maybeSingle();

    if (existingError) {
      console.error("Existing checkout lookup failed:", existingError);
      return response({ error: "Could not check existing checkout" }, 500);
    }

    if (existing) {
      if (existing.status !== "pending" || existing.payment_status !== "pending") {
        return response({ error: "This checkout is no longer pending" }, 409);
      }
      if (existing.inventory_status !== "reserved") {
        return response(
          { error: "This checkout needs reconciliation before it can continue." },
          409,
        );
      }
      if (existing.razorpay_order_id) {
        return paymentResponse(existing, razorpayKeyId);
      }
      return response(
        { error: "This checkout is already being processed. Please wait while it is reconciled." },
        409,
      );
    }

    // Reserve stock and create the internal order + item snapshots in one
    // database transaction. Prices and stock are read by the trusted RPC.
    const customerDetails = customerResult.customer;
    const rpcItems = [...quantities.entries()].map(([product_id, quantity]) => ({
      product_id,
      quantity,
    }));

    const { data: reservationData, error: reservationError } = await admin.rpc(
      "create_order_with_inventory_reservation",
      {
        p_user_id: userData.user.id,
        p_checkout_request_id: checkout_request_id,
        p_customer: customerDetails,
        p_items: rpcItems,
      },
    );

    if (reservationError || !isRecord(reservationData)) {
      const message = reservationError?.message ?? "Invalid inventory reservation response";
      console.error("Atomic inventory reservation failed:", message);

      if (/insufficient stock|product unavailable|stock reservation failed/i.test(message)) {
        return response({ error: "One or more products are out of stock. Please refresh your cart." }, 409);
      }
      if (/invalid customer|invalid product|invalid checkout|invalid line amount|minimum online payment/i.test(message)) {
        return response({ error: "Checkout details or cart are invalid. Please review and try again." }, 400);
      }
      return response({ error: "Could not reserve inventory for checkout. Please retry shortly." }, 500);
    }

    const orderId = reservationData.orderId;
    const totalAmount = Number(reservationData.totalAmount);
    const reservedInventory = reservationData.inventoryStatus === "reserved";
    const isExistingReservation = reservationData.existing === true;
    const existingRazorpayOrderId =
      typeof reservationData.razorpayOrderId === "string"
        ? reservationData.razorpayOrderId
        : null;

    if (
      typeof orderId !== "string" ||
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0 ||
      !reservedInventory
    ) {
      console.error("Inventory RPC returned an unexpected result");
      return response({ error: "Checkout needs reconciliation before payment can continue." }, 500);
    }

    // A race may cause the RPC to return an order created by another request.
    // Reuse it only if its Razorpay order ID is already persisted. Never create
    // a second remote payment order for an uncertain prior request.
    if (isExistingReservation) {
      if (existingRazorpayOrderId) {
        return paymentResponse({
          id: orderId,
          total_amount: totalAmount,
          status: "pending",
          payment_status: "pending",
          razorpay_order_id: existingRazorpayOrderId,
        }, razorpayKeyId);
      }
      return response(
        { error: "This checkout is already being processed. Please wait while it is reconciled." },
        409,
      );
    }

    const totalPaise = Math.round(totalAmount * 100);
    if (!Number.isSafeInteger(totalPaise) || totalPaise < 100) {
      console.error("Inventory RPC returned an invalid total amount");
      return response({ error: "Invalid order amount. Please contact support." }, 500);
    }

    let razorpayOrder: {
      id?: string;
      amount?: number;
      currency?: string;
      receipt?: string;
      status?: string;
    };

    try {
      const razorpayResponse = await fetch(
        "https://api.razorpay.com/v1/orders",
        {
          method: "POST",
          headers: {
            Authorization:
              `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: totalPaise,
            currency: "INR",
            receipt: orderId,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!razorpayResponse.ok) {
        const errorText = await razorpayResponse.text();
        const status = razorpayResponse.status;

        console.error(
          "Razorpay order creation returned an error:",
          status,
          errorText.slice(0, 1000),
        );

        // Only a clear client-side rejection is treated as definitive. A
        // timeout, rate limit, conflict, or server error may be ambiguous;
        // keep stock reserved until reconciliation in those cases.
        const definitiveRejection =
          status >= 400 && status < 500 && ![408, 409, 429].includes(status);

        if (definitiveRejection) {
          const { error: failError } = await admin
            .from("orders")
            .update({
              payment_status: "failed",
              payment_error: "Razorpay definitively rejected order creation",
            })
            .eq("id", orderId)
            .is("razorpay_order_id", null);

          if (failError) {
            console.error("Could not mark rejected checkout failed:", failError);
          } else {
            const { error: releaseError } = await admin.rpc(
              "release_failed_order_inventory",
              { p_order_id: orderId },
            );
            if (releaseError) {
              console.error("Could not release stock after definitive rejection:", releaseError);
            }
          }
        } else {
          const { error: recordError } = await admin
            .from("orders")
            .update({ payment_error: "Razorpay order creation outcome needs reconciliation" })
            .eq("id", orderId);
          if (recordError) {
            console.error("Could not record payment setup error:", recordError);
          }
        }

        return response(
          {
            error: definitiveRejection
              ? "Razorpay rejected payment setup. Please start a new checkout attempt."
              : "Payment setup needs reconciliation. Please wait or contact support before retrying.",
          },
          502,
        );
      }

      razorpayOrder = await razorpayResponse.json();

      if (
        typeof razorpayOrder.id !== "string" ||
        razorpayOrder.amount !== totalPaise ||
        razorpayOrder.currency !== "INR"
      ) {
        console.error("Unexpected Razorpay order response");

        await admin
          .from("orders")
          .update({
            payment_error: "Unexpected Razorpay order response",
          })
          .eq("id", orderId);

        return response(
          {
            error:
              "Payment setup needs reconciliation. Please contact support before retrying.",
          },
          502,
        );
      }
    } catch (error) {
      // A timeout or network failure does not prove Razorpay failed to create
      // its order. Keep the internal record and do not blindly retry creation.
      console.error("Razorpay request outcome is uncertain:", error);

      await admin
        .from("orders")
        .update({
          payment_error: "Razorpay creation outcome is uncertain",
        })
        .eq("id", orderId);

      return response(
        {
          error:
            "We could not confirm payment setup. Please wait or contact support before retrying.",
        },
        502,
      );
    }

    const { data: updatedOrder, error: updateError } = await admin
      .from("orders")
      .update({
        razorpay_order_id: razorpayOrder.id,
        payment_error: null,
      })
      .eq("id", orderId)
      .eq("user_id", userData.user.id)
      .select(
        "id, user_id, total_amount, status, payment_status, razorpay_order_id",
      )
      .single();

    if (
      updateError ||
      !updatedOrder ||
      updatedOrder.razorpay_order_id !== razorpayOrder.id
    ) {
      console.error("Saving Razorpay order reference failed:", updateError);

      // The Razorpay order may already exist. Preserve the internal order
      // for reconciliation; never delete it or create another blindly.
      await admin
        .from("orders")
        .update({
          payment_error: "Could not save Razorpay order reference",
        })
        .eq("id", orderId);

      return response(
        {
          error:
            "Payment setup needs reconciliation. Please contact support before retrying.",
        },
        500,
      );
    }

    return paymentResponse(updatedOrder, razorpayKeyId);
  } catch (error) {
    console.error("Unexpected checkout function error:", error);
    return response({ error: "Could not process checkout" }, 500);
  }
});
