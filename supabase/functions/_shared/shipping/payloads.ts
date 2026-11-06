// Builds the exact JSON bodies Shiprocket expects. Pure functions so they are unit-tested.
// If Shiprocket changes a field name, this is the ONLY file to touch.
import type { Address, ForwardOrderInput, ParcelItem, ReturnOrderInput } from "./types.ts";

/** Shiprocket wants "YYYY-MM-DD HH:mm" (we send India time). */
export function formatShiprocketDate(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}`;
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "Customer", last: parts.slice(1).join(" ") };
}

function hsnValue(hsn: string): string | number {
  return /^\d+$/.test(hsn) ? Number(hsn) : hsn;
}

function items(list: ParcelItem[]) {
  return list.map((i) => ({
    name: i.name.slice(0, 100),
    sku: i.sku,
    units: i.units,
    selling_price: i.sellingPrice,
    discount: 0,
    tax: 0,
    hsn: hsnValue(i.hsn),
  }));
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildForwardOrderPayload(i: ForwardOrderInput) {
  const name = splitName(i.customer.name);
  return {
    order_id: i.reference,
    order_date: formatShiprocketDate(i.orderDate),
    pickup_location: i.pickupLocation,
    billing_customer_name: name.first,
    billing_last_name: name.last,
    billing_address: i.customer.line1,
    billing_address_2: i.customer.line2 ?? "",
    billing_city: i.customer.city,
    billing_pincode: i.customer.pincode,
    billing_state: i.customer.state,
    billing_country: "India",
    billing_email: i.customer.email,
    billing_phone: i.customer.phone,
    shipping_is_billing: true,
    order_items: items(i.items),
    payment_method: "Prepaid",
    shipping_charges: 0,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: 0,
    sub_total: money(i.subTotal),
    length: i.parcel.lengthCm,
    breadth: i.parcel.breadthCm,
    height: i.parcel.heightCm,
    weight: i.parcel.weightKg,
  };
}

function addressFields(prefix: "pickup" | "shipping", a: Address) {
  const name = splitName(a.name);
  return {
    [`${prefix}_customer_name`]: name.first,
    [`${prefix}_last_name`]: name.last,
    [`${prefix}_address`]: a.line1,
    [`${prefix}_address_2`]: a.line2 ?? "",
    [`${prefix}_city`]: a.city,
    [`${prefix}_state`]: a.state,
    [`${prefix}_country`]: "India",
    [`${prefix}_pincode`]: a.pincode,
    [`${prefix}_email`]: a.email,
    [`${prefix}_isd_code`]: "91",
    [`${prefix}_phone`]: a.phone,
  };
}

/** Return order: "pickup_*" is the customer (where the courier collects), "shipping_*" is your warehouse. */
export function buildReturnOrderPayload(i: ReturnOrderInput) {
  return {
    order_id: i.reference,
    order_date: formatShiprocketDate(i.orderDate),
    ...addressFields("pickup", i.customer),
    ...addressFields("shipping", i.warehouse),
    order_items: items(i.items).map((it) => ({ ...it, qc_enable: false })),
    payment_method: "Prepaid",
    total_discount: "0",
    sub_total: money(i.subTotal),
    length: i.parcel.lengthCm,
    breadth: i.parcel.breadthCm,
    height: i.parcel.heightCm,
    weight: i.parcel.weightKg,
  };
}
