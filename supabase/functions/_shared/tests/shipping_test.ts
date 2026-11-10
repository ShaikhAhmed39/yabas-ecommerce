import { assert, assertEquals } from "./assert.ts";
import { mapCourierStatus, parseCourierTime, parseCourierWebhook, dedupeKeyFor } from "../shipping/status.ts";
import { buildForwardOrderPayload, buildReturnOrderPayload, formatShiprocketDate, splitName } from "../shipping/payloads.ts";
import { extractMessage, ShiprocketProvider } from "../shipping/shiprocket.ts";
import { MockProvider } from "../shipping/mock.ts";
import { renderEmail } from "../notify.ts";
import { hmacSha256Hex, safeEqualHex, safeEqualStrings } from "../crypto.ts";
import { verifyWebhookSignature } from "../razorpay.ts";
import { ShippingError } from "../shipping/types.ts";

Deno.test("status mapping covers the courier vocabulary", () => {
  const cases: Array<[string, string | null]> = [
    ["DELIVERED", "delivered"], ["Out For Delivery", "out_for_delivery"], ["IN TRANSIT", "in_transit"],
    ["In-Transit", null], ["PICKED UP", "picked_up"], ["PICKUP SCHEDULED", "pickup_scheduled"],
    ["AWB ASSIGNED", "awb_assigned"], ["RTO INITIATED", "rto_initiated"], ["RTO_DELIVERED", "rto_delivered"],
    ["RTO NDR", "rto_initiated"], ["UNDELIVERED-1st Attempt", "undelivered"], ["CANCELED", "cancelled"],
    ["LOST", "lost"], ["REACHED AT DESTINATION HUB", "in_transit"], ["something new", null], ["", null],
  ];
  for (const [raw, want] of cases) assertEquals(mapCourierStatus(raw), want, raw);
});

Deno.test("courier timestamps: IST default, ISO untouched", () => {
  assertEquals(parseCourierTime("2026-10-29 15:30:00"), "2026-10-29T10:00:00.000Z");
  assertEquals(parseCourierTime("29-10-2026 15:30"), "2026-10-29T10:00:00.000Z");
  assertEquals(parseCourierTime("2026-10-29T10:00:00Z"), "2026-10-29T10:00:00.000Z");
  assertEquals(parseCourierTime("garbage"), null);
  assertEquals(parseCourierTime("2026-13-40 10:00"), null);
});

Deno.test("webhook parsing + stable dedupe key", async () => {
  const payload = {
    awb: "123456789", current_status: "OUT FOR DELIVERY", current_timestamp: "29 10 2026 15:30:00",
    scans: [{ date: "2026-10-29 15:30:00", activity: "Out for delivery", location: "Mumbai", "sr-status-label": "OUT FOR DELIVERY" }],
  };
  const ev = parseCourierWebhook(payload)!;
  assertEquals(ev.mappedStatus, "out_for_delivery");
  assertEquals(ev.location, "Mumbai");
  assertEquals(ev.eventTime, "2026-10-29T10:00:00.000Z");
  const k1 = await dedupeKeyFor(ev.awb, ev.rawStatus, ev.eventTime);
  const k2 = await dedupeKeyFor(ev.awb, "out_for_delivery", ev.eventTime);
  assertEquals(k1, k2);
  assertEquals(parseCourierWebhook({ foo: 1 }), null);
  assertEquals(parseCourierWebhook(null), null);
});

const address = { name: "Asha Mehta Rao", line1: "12 Marine Drive", line2: null, city: "Mumbai", state: "Maharashtra", pincode: "400020", phone: "9876543210", email: "a@b.in" };
const parcel = { weightKg: 0.5, lengthCm: 12, breadthCm: 10, heightCm: 5 };
const item = { name: "Kundan Necklace", sku: "abc12345", units: 2, sellingPrice: 499.5, hsn: "7117" };

Deno.test("forward payload is prepaid, India-time, split names", () => {
  const p = buildForwardOrderPayload({
    reference: "YB001001", orderDate: new Date("2026-10-29T10:00:00Z"), pickupLocation: "Primary",
    customer: address, items: [item], subTotal: 999, parcel,
  });
  assertEquals(p.order_id, "YB001001");
  assertEquals(p.order_date, "2026-10-29 15:30");
  assertEquals(p.payment_method, "Prepaid");
  assertEquals(p.billing_customer_name, "Asha");
  assertEquals(p.billing_last_name, "Mehta Rao");
  assertEquals(p.order_items[0].hsn, 7117);
  assertEquals(p.weight, 0.5);
});

Deno.test("return payload: pickup = customer, delivery = warehouse", () => {
  const wh = { ...address, name: "Yaba Warehouse", city: "Thane", pincode: "400601" };
  const p = buildReturnOrderPayload({
    reference: "RET-YB001001-1", orderDate: new Date(), customer: address, warehouse: wh, items: [item], subTotal: 999, parcel,
  }) as Record<string, unknown>;
  assertEquals(p.pickup_pincode, "400020");
  assertEquals(p.shipping_pincode, "400601");
  assertEquals(p.shipping_city, "Thane");
});

Deno.test("helpers", () => {
  assertEquals(splitName("  Cher "), { first: "Cher", last: "" });
  assertEquals(formatShiprocketDate(new Date("2026-01-01T20:00:00Z")), "2026-01-02 01:30");
});

Deno.test("e-mail rendering escapes HTML and includes tracking", () => {
  const m = renderEmail("shipped", { name: "<b>Asha</b>", orderNumber: "YB001001", courier: "Delhivery", trackingUrl: "https://t.example/1" });
  assert(m.subject.includes("YB001001"));
  assert(m.text.includes("https://t.example/1"));
  assert(!m.html.includes("<b>Asha</b>"));
  assert(m.html.includes("&lt;b&gt;"));
  assert(renderEmail("refund_processed", { name: "A", orderNumber: "X", amountRupees: 1499 }).text.includes("₹1,499"));
});

Deno.test("signature helpers", async () => {
  const sig = await hmacSha256Hex("secret", "body");
  assert(await verifyWebhookSignature("body", sig, "secret"));
  assert(!(await verifyWebhookSignature("body2", sig, "secret")));
  assert(!(await verifyWebhookSignature("body", "zz", "secret")));
  assert(safeEqualHex(sig, sig.toUpperCase()));
  assert(await safeEqualStrings("a", "a"));
  assert(!(await safeEqualStrings("a", "b")));
  assert(!(await safeEqualStrings("a", "ab")));
  assert(!(await safeEqualStrings("", "x")));
});

Deno.test("mock provider is deterministic and offline", async () => {
  const m = new MockProvider();
  const a = await m.createForwardOrder({ reference: "YB1" } as never);
  const b = await m.createForwardOrder({ reference: "YB1" } as never);
  assertEquals(a, b);
  const awb = await m.assignAwb(a.providerShipmentId, { isReturn: false });
  assertEquals((await m.assignAwb(a.providerShipmentId, { isReturn: false })).awbCode, awb.awbCode);
  assert(awb.awbCode.startsWith("MOCKF"));
  assertEquals((await m.serviceability({ deliveryPincode: "12" })).serviceable, false);
});

Deno.test("shiprocket error text extraction", () => {
  assertEquals(extractMessage({ message: "Wrong pickup location", errors: { pincode: ["invalid"] } }), "Wrong pickup location | pincode: invalid");
  assertEquals(extractMessage({ response: { data: { awb_assign_error: "Low balance" } } }), "Low balance");
  assertEquals(extractMessage(null), null);
});

// ---- Shiprocket client against a fake network -------------------------------------------------
type Call = { url: string; method: string; body: unknown; auth: string | null };
function fakeFetch(handler: (c: Call) => { status?: number; json: unknown }): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const call: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers.get("Authorization") };
    calls.push(call);
    const r = handler(call);
    return Promise.resolve(new Response(JSON.stringify(r.json), { status: r.status ?? 200 }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

Deno.test("shiprocket: login once, bearer on calls, re-login on 401, AWB flow", async () => {
  let logins = 0;
  let first401 = true;
  const net = fakeFetch((c) => {
    if (c.url.endsWith("/auth/login")) { logins++; return { json: { token: `tok${logins}` } }; }
    if (c.url.endsWith("/orders/create/adhoc")) {
      if (first401) { first401 = false; return { status: 401, json: { message: "Unauthenticated" } }; }
      return { json: { order_id: 111, shipment_id: 222 } };
    }
    if (c.url.endsWith("/courier/assign/awb")) return { json: { awb_assign_status: 1, response: { data: { awb_code: "AWB9", courier_name: "Delhivery", courier_company_id: 10 } } } };
    if (c.url.endsWith("/courier/generate/pickup")) return { json: { pickup_status: 1, response: { pickup_scheduled_date: "2026-10-30 10:00:00" } } };
    if (c.url.endsWith("/courier/generate/label")) return { json: { label_created: 1, label_url: "https://label/1.pdf" } };
    return { status: 404, json: {} };
  });
  try {
    const sr = new ShiprocketProvider({ email: "e", password: "p" });
    const created = await sr.createForwardOrder({ reference: "YB1", orderDate: new Date(), pickupLocation: "Primary", customer: address, items: [item], subTotal: 10, parcel });
    assertEquals(created, { providerOrderId: "111", providerShipmentId: "222" });
    assert(logins >= 1);
    const awb = await sr.assignAwb("222", { isReturn: false });
    assertEquals(awb, { awbCode: "AWB9", courierName: "Delhivery", courierId: "10" });
    assertEquals((await sr.requestPickup("222")).scheduledAt, "2026-10-30T04:30:00.000Z");
    assertEquals((await sr.generateLabel("222")).labelUrl, "https://label/1.pdf");
    const assignCall = net.calls.find((c) => c.url.endsWith("/courier/assign/awb"))!;
    assertEquals(assignCall.body, { shipment_id: 222 });
    assert(assignCall.auth?.startsWith("Bearer tok"));
  } finally { net.restore(); }
});

Deno.test("shiprocket: 'already scheduled' pickup is success; business errors are not retryable; 5xx is", async () => {
  const net = fakeFetch((c) => {
    if (c.url.endsWith("/auth/login")) return { json: { token: "t" } };
    if (c.url.endsWith("/courier/generate/pickup")) return { json: { pickup_status: 0, response: { data: "Pickup already scheduled for this shipment" } } };
    if (c.url.endsWith("/courier/assign/awb")) return { json: { awb_assign_status: 0, response: { data: { awb_assign_error: "Insufficient wallet balance" } } } };
    if (c.url.endsWith("/orders/create/adhoc")) return { status: 503, json: { message: "busy" } };
    return { json: {} };
  });
  try {
    const sr = new ShiprocketProvider({ email: "e", password: "p" });
    assertEquals(await sr.requestPickup("1"), {});
    const e1 = await sr.assignAwb("1", { isReturn: false }).catch((e) => e);
    assert(e1 instanceof ShippingError && !e1.retryable && e1.message.includes("wallet"));
    const e2 = await sr.createForwardOrder({ reference: "x", orderDate: new Date(), pickupLocation: "P", customer: address, items: [item], subTotal: 1, parcel }).catch((e) => e);
    assert(e2 instanceof ShippingError && e2.retryable);
  } finally { net.restore(); }
});

Deno.test("shiprocket: tracking + serviceability parsing", async () => {
  const net = fakeFetch((c) => {
    if (c.url.endsWith("/auth/login")) return { json: { token: "t" } };
    if (c.url.includes("/courier/track/awb/")) return { json: { tracking_data: { etd: "2026-11-02 10:00:00", shipment_track: [{ current_status: "IN TRANSIT" }], shipment_track_activities: [{ date: "2026-10-29 10:00:00", activity: "Picked", location: "Mumbai" }] } } };
    if (c.url.includes("/courier/serviceability/")) return { json: { data: { available_courier_companies: [
      { courier_company_id: 2, courier_name: "B", rate: 90, estimated_delivery_days: 4 }, { courier_company_id: 1, courier_name: "A", rate: 60, estimated_delivery_days: 3 } ] } } };
    return { json: {} };
  });
  try {
    const sr = new ShiprocketProvider({ email: "e", password: "p" });
    const t = await sr.track("AWB1");
    assertEquals(t.currentStatus, "IN TRANSIT");
    assertEquals(t.etd, "2026-11-02T04:30:00.000Z");
    assertEquals(t.activities[0].location, "Mumbai");
    const s = await sr.serviceability({ pickupPincode: "400001", deliveryPincode: "400020", weightKg: 0.5 });
    assert(s.serviceable);
    assertEquals(s.options[0].courierName, "A");
    assert(net.calls.find((c) => c.url.includes("serviceability"))!.url.includes("cod=0"));
  } finally { net.restore(); }
});
