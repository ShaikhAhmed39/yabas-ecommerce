// Orchestrates shipping: books (resumably), refreshes, cancels, and applies courier events.
// Every step is saved to the DB before the next one, so a crash or timeout can always be retried safely.
import type { Db } from "../supabase.ts";
import { userEmail } from "../supabase.ts";
import { env, envNumber, requireEnv } from "../env.ts";
import { HttpError, rpcError } from "../http.ts";
import { sendMail, type MailKind } from "../notify.ts";
import { dedupeKeyFor, mapCourierStatus, type ParsedCourierEvent } from "./status.ts";
import { type Address, type ParcelItem, ShippingError, type ShippingProvider } from "./types.ts";

export interface BookOptions {
  orderId: string;
  direction: "forward" | "return";
  returnRequestId?: string | null;
  actor: string | null;
  courierId?: string;
}

export interface ShipmentRow {
  id: string;
  order_id: string;
  direction: "forward" | "return";
  status: string;
  awb_code: string | null;
  provider_order_id: string | null;
  provider_shipment_id: string | null;
  provider_reference: string;
  courier_name: string | null;
  return_request_id: string | null;
}

const SHIPMENT_COLUMNS =
  "id,order_id,direction,status,awb_code,provider_order_id,provider_shipment_id,provider_reference,courier_name,return_request_id";

const BOOK_RULES: Array<[RegExp, number, string]> = [
  [/not ready to ship/i, 409, "This order is not ready to ship (it must be paid, not cancelled, and not already shipped)."],
  [/return is not approved/i, 409, "The return must be approved before a pickup can be booked."],
  [/order not found|return request not found/i, 404, "Order or return request not found."],
];

export function warehouseAddress(): Address {
  return {
    name: requireEnv("WAREHOUSE_NAME"),
    line1: requireEnv("WAREHOUSE_ADDRESS"),
    line2: env("WAREHOUSE_ADDRESS_2") ?? null,
    city: requireEnv("WAREHOUSE_CITY"),
    state: requireEnv("WAREHOUSE_STATE"),
    pincode: requireEnv("WAREHOUSE_PINCODE"),
    phone: requireEnv("WAREHOUSE_PHONE"),
    email: env("WAREHOUSE_EMAIL") ?? env("MAIL_FROM") ?? "warehouse@example.com",
  };
}

interface OrderContext {
  order: Record<string, any>; // deno-lint-ignore no-explicit-any
  email: string;
  customer: Address;
  items: ParcelItem[];
  weightKg: number;
  subTotal: number;
}

async function loadContext(db: Db, orderId: string, onlyItemId?: string | null): Promise<OrderContext> {
  const { data: order, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error || !order) throw new HttpError(404, "Order not found.");
  const { data: rows, error: itemErr } = await db
    .from("order_items").select("id,product_id,product_title,unit_price,quantity").eq("order_id", orderId);
  if (itemErr || !rows?.length) throw new HttpError(500, "Order has no items.");

  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
  const weights = new Map<string, number>();
  if (productIds.length) {
    const { data: prods } = await db.from("products").select("id,weight_grams").in("id", productIds);
    for (const p of prods ?? []) weights.set(p.id, Number(p.weight_grams) || 100);
  }
  const selected = onlyItemId ? rows.filter((r) => r.id === onlyItemId) : rows;
  if (!selected.length) throw new HttpError(404, "Item not found on this order.");

  const hsn = env("SHIPPING_HSN_CODE") ?? "7117";
  const items: ParcelItem[] = selected.map((r) => ({
    name: r.product_title,
    sku: r.product_id ? String(r.product_id).slice(0, 8) : r.id.slice(0, 8),
    units: r.quantity,
    sellingPrice: Number(r.unit_price),
    hsn,
  }));
  const grams = selected.reduce((s, r) => s + (r.product_id ? weights.get(r.product_id) ?? 100 : 100) * r.quantity, 0);
  const weightKg = Math.max(grams / 1000, envNumber("SHIPPING_MIN_WEIGHT_KG", 0.5));
  const subTotal = Math.round(selected.reduce((s, r) => s + Number(r.unit_price) * r.quantity, 0) * 100) / 100;
  const email = (await userEmail(db, order.user_id, order.id)) ?? env("FALLBACK_CUSTOMER_EMAIL") ?? "noreply@example.com";

  return {
    order,
    email,
    items,
    weightKg,
    subTotal,
    customer: {
      name: order.customer_name,
      line1: order.shipping_address_line1,
      line2: order.shipping_address_line2,
      city: order.city,
      state: order.state,
      pincode: order.pincode,
      phone: order.primary_phone,
      email,
    },
  };
}

function parcel(weightKg: number) {
  return {
    weightKg,
    lengthCm: envNumber("SHIPPING_DEFAULT_LENGTH_CM", 12),
    breadthCm: envNumber("SHIPPING_DEFAULT_BREADTH_CM", 10),
    heightCm: envNumber("SHIPPING_DEFAULT_HEIGHT_CM", 5),
  };
}

async function save(db: Db, shipmentId: string, patch: Record<string, unknown>) {
  const { error } = await db.rpc("save_shipment_progress", { p_shipment_id: shipmentId, p_patch: patch });
  if (error) throw rpcError(error);
}

async function loadShipment(db: Db, id: string): Promise<ShipmentRow> {
  const { data, error } = await db.from("shipments").select(SHIPMENT_COLUMNS).eq("id", id).single();
  if (error || !data) throw new HttpError(500, "Could not load shipment.");
  return data as ShipmentRow;
}

/**
 * Books (or resumes) a shipment. Idempotent: calling it twice never creates two parcels.
 * Steps: 1 create order at courier -> 2 assign courier/AWB -> 3 request pickup -> 4 label (non-fatal).
 */
export async function bookShipment(db: Db, provider: ShippingProvider, opts: BookOptions) {
  const { data, error } = await db.rpc("begin_shipment", {
    p_order_id: opts.orderId,
    p_direction: opts.direction,
    p_return_request_id: opts.returnRequestId ?? null,
    p_actor: opts.actor,
  });
  if (error) throw rpcError(error, BOOK_RULES);
  const begin = data as { shipmentId: string; created: boolean; inProgress: boolean; status: string };

  if (begin.inProgress) throw new HttpError(409, "A shipment is already being created for this order. Try again in a minute.");
  if (!["creating", "created", "awb_assigned"].includes(begin.status)) {
    return { shipment: await loadShipment(db, begin.shipmentId), alreadyBooked: true };
  }

  let ship = await loadShipment(db, begin.shipmentId);
  const isReturn = opts.direction === "return";

  let returnItemId: string | null = null;
  if (isReturn) {
    const { data: rr } = await db.from("return_requests").select("order_item_id").eq("id", opts.returnRequestId!).single();
    returnItemId = rr?.order_item_id ?? null;
  }
  const ctx = await loadContext(db, opts.orderId, returnItemId);

  try {
    if (!ship.provider_order_id || !ship.provider_shipment_id) {
      const created = isReturn
        ? await provider.createReturnOrder({
          reference: ship.provider_reference, orderDate: new Date(), customer: ctx.customer,
          warehouse: warehouseAddress(), items: ctx.items, subTotal: ctx.subTotal, parcel: parcel(ctx.weightKg),
        })
        : await provider.createForwardOrder({
          reference: ship.provider_reference, orderDate: new Date(ctx.order.created_at),
          pickupLocation: requireEnv("SHIPROCKET_PICKUP_LOCATION"), customer: ctx.customer,
          items: ctx.items, subTotal: ctx.subTotal, parcel: parcel(ctx.weightKg),
        });
      await save(db, ship.id, {
        provider_order_id: created.providerOrderId, provider_shipment_id: created.providerShipmentId, status: "creating",
      });
      ship = { ...ship, provider_order_id: created.providerOrderId, provider_shipment_id: created.providerShipmentId };
    }

    if (!ship.awb_code) {
      const awb = await provider.assignAwb(ship.provider_shipment_id!, { isReturn, courierId: opts.courierId ?? env("SHIPROCKET_COURIER_ID") });
      await save(db, ship.id, {
        awb_code: awb.awbCode, courier_name: awb.courierName, courier_id: awb.courierId ?? null,
        tracking_url: provider.trackingUrl(awb.awbCode), status: "awb_assigned",
      });
      ship = { ...ship, awb_code: awb.awbCode, courier_name: awb.courierName };
    }

    const pickup = await provider.requestPickup(ship.provider_shipment_id!);
    await save(db, ship.id, { status: "pickup_scheduled", pickup_scheduled_at: pickup.scheduledAt ?? null, error: null });

    try {
      const label = await provider.generateLabel(ship.provider_shipment_id!);
      if (label.labelUrl) await save(db, ship.id, { label_url: label.labelUrl });
    } catch (e) {
      console.error("Label generation failed (non-fatal, can be regenerated):", e instanceof Error ? e.message : e);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown shipping error";
    await save(db, ship.id, { status: "failed", error: message.slice(0, 500) }).catch((x) =>
      console.error("Could not record shipping failure:", x)
    );
    if (e instanceof ShippingError) throw new HttpError(e.retryable ? 502 : 422, message);
    throw e;
  }

  ship = await loadShipment(db, ship.id);
  await notifyShipmentBooked(db, ctx, ship, provider);
  return { shipment: ship, alreadyBooked: false };
}

async function notifyShipmentBooked(db: Db, ctx: OrderContext, ship: ShipmentRow, provider: ShippingProvider) {
  if (ship.direction !== "return") return; // forward e-mail is sent when the courier actually picks it up
  await sendMail(ctx.email, "return_approved", {
    name: ctx.order.customer_name, orderNumber: ctx.order.order_number, awb: ship.awb_code,
    courier: ship.courier_name, trackingUrl: ship.awb_code ? provider.trackingUrl(ship.awb_code) : null,
  });
}

/** Cancels a not-yet-picked-up shipment at the courier and in our DB. */
export async function cancelShipment(db: Db, provider: ShippingProvider, shipmentId: string, actor: string | null) {
  const ship = await loadShipment(db, shipmentId);
  if (["picked_up", "in_transit", "out_for_delivery", "delivered", "rto_delivered", "lost"].includes(ship.status)) {
    throw new HttpError(409, "This parcel is already with the courier and can no longer be cancelled here.");
  }
  if (ship.status === "cancelled") return ship;
  try {
    if (ship.provider_order_id) await provider.cancel([ship.provider_order_id]);
  } catch (e) {
    if (e instanceof ShippingError) throw new HttpError(e.retryable ? 502 : 422, `Courier refused to cancel: ${e.message}`);
    throw e;
  }
  await save(db, ship.id, { status: "cancelled" });
  await db.rpc("log_order_event", {
    p_order_id: ship.order_id, p_actor_type: actor ? "admin" : "system", p_actor_id: actor,
    p_event_type: `${ship.direction}_shipment_cancelled`, p_from: ship.status, p_to: "cancelled", p_note: null, p_payload: {},
  });
  return await loadShipment(db, ship.id);
}

export async function regenerateLabel(db: Db, provider: ShippingProvider, shipmentId: string) {
  const ship = await loadShipment(db, shipmentId);
  if (!ship.provider_shipment_id) throw new HttpError(409, "This shipment has no courier booking yet.");
  try {
    const label = await provider.generateLabel(ship.provider_shipment_id);
    if (!label.labelUrl) throw new HttpError(502, "The courier did not return a label. Try again in a minute.");
    await save(db, ship.id, { label_url: label.labelUrl });
    return label.labelUrl;
  } catch (e) {
    if (e instanceof ShippingError) throw new HttpError(e.retryable ? 502 : 422, e.message);
    throw e;
  }
}

const MAIL_FOR_DELIVERY: Record<string, MailKind> = {
  in_transit: "shipped", picked_up: "shipped", out_for_delivery: "out_for_delivery",
  delivered: "delivered", undelivered: "delivery_failed",
};

/** Applies one courier event (webhook or poll) and sends the matching e-mail exactly once per status change. */
export async function applyCourierEvent(
  db: Db, provider: ShippingProvider, ev: ParsedCourierEvent, payload: unknown,
): Promise<{ matched: boolean; duplicate: boolean; applied?: boolean }> {
  const dedupe = await dedupeKeyFor(ev.awb, ev.rawStatus, ev.eventTime);
  const { data, error } = await db.rpc("apply_shipping_update", {
    p_awb: ev.awb, p_mapped_status: ev.mappedStatus, p_raw_status: ev.rawStatus, p_event_time: ev.eventTime,
    p_activity: ev.activity, p_location: ev.location, p_etd: ev.etd, p_payload: payload ?? {}, p_dedupe_key: dedupe,
  });
  if (error) throw rpcError(error);
  const r = data as {
    duplicate: boolean; matched: boolean; applied?: boolean; status?: string; previousStatus?: string; direction?: string; orderId?: string;
  };

  if (r.applied && r.status && r.status !== r.previousStatus && r.orderId) {
    try {
      const ctx = await loadContext(db, r.orderId);
      const awb = ev.awb;
      if (r.direction === "forward") {
        let kind = MAIL_FOR_DELIVERY[r.status];
        // "picked_up" then "in_transit" must not send two "shipped" e-mails
        if (kind === "shipped" && r.previousStatus && ["picked_up", "in_transit"].includes(r.previousStatus)) kind = undefined as unknown as MailKind;
        if (kind) {
          await sendMail(ctx.email, kind, {
            name: ctx.order.customer_name, orderNumber: ctx.order.order_number, awb, trackingUrl: provider.trackingUrl(awb),
          });
        }
      } else if (r.status === "delivered") {
        await sendMail(ctx.email, "return_received", { name: ctx.order.customer_name, orderNumber: ctx.order.order_number });
      }
    } catch (e) {
      console.error("Post-event notification failed (ignored):", e instanceof Error ? e.message : e);
    }
  }
  return { matched: r.matched, duplicate: r.duplicate, applied: r.applied };
}

/** Pulls the latest courier status for a shipment (used by the Refresh button and the reconcile job). */
export async function refreshShipment(db: Db, provider: ShippingProvider, shipmentId: string) {
  const ship = await loadShipment(db, shipmentId);
  if (!ship.awb_code) throw new HttpError(409, "This shipment has no tracking number yet.");
  let snap;
  try {
    snap = await provider.track(ship.awb_code);
  } catch (e) {
    if (e instanceof ShippingError) throw new HttpError(e.retryable ? 502 : 422, e.message);
    throw e;
  }
  if (snap.currentStatus) {
    const latest = snap.activities[0];
    await applyCourierEvent(db, provider, {
      awb: ship.awb_code, rawStatus: snap.currentStatus, mappedStatus: mapCourierStatus(snap.currentStatus),
      eventTime: null, activity: latest?.activity ?? null, location: latest?.location ?? null,
      etd: snap.etd ?? null, isReturn: ship.direction === "return",
    }, { source: "poll", snapshot: snap });
  }
  return await loadShipment(db, ship.id);
}
