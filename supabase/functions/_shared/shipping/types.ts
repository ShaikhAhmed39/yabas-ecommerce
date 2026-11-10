// Provider-neutral shipping types. Everything outside shiprocket.ts only knows about these.

export type ShipmentStatus =
  | "creating" | "failed" | "created" | "awb_assigned" | "pickup_scheduled" | "picked_up"
  | "in_transit" | "out_for_delivery" | "delivered" | "undelivered"
  | "rto_initiated" | "rto_delivered" | "cancelled" | "lost";

/** Statuses the courier can report (what apply_shipping_update accepts). */
export type MappedStatus = Exclude<ShipmentStatus, "creating" | "failed">;

export class ShippingError extends Error {
  /** true = temporary problem (network, courier busy). false = needs a human (bad address, no wallet balance...). */
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "ShippingError";
    this.retryable = retryable;
  }
}

export interface Address {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
}

export interface ParcelItem {
  name: string;
  sku: string;
  units: number;
  sellingPrice: number;
  hsn: string;
}

export interface Parcel {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
}

export interface ForwardOrderInput {
  reference: string;
  orderDate: Date;
  pickupLocation: string;
  customer: Address;
  items: ParcelItem[];
  subTotal: number;
  parcel: Parcel;
}

export interface ReturnOrderInput {
  reference: string;
  orderDate: Date;
  /** Where the courier collects the parcel (the customer). */
  customer: Address;
  /** Where it is delivered back to (your warehouse). */
  warehouse: Address;
  items: ParcelItem[];
  subTotal: number;
  parcel: Parcel;
}

export interface CreatedOrder {
  providerOrderId: string;
  providerShipmentId: string;
}

export interface AwbResult {
  awbCode: string;
  courierName: string;
  courierId?: string;
}

export interface TrackingActivity {
  date: string;
  activity: string;
  location?: string;
  status?: string;
}

export interface TrackingSnapshot {
  awb: string;
  currentStatus: string | null;
  etd?: string | null;
  activities: TrackingActivity[];
}

export interface CourierOption {
  courierId: string;
  courierName: string;
  rate: number;
  etdDays?: number;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  options: CourierOption[];
}

export interface ShippingProvider {
  readonly mode: "live" | "mock";
  /** Public tracking page for an AWB (null when the provider has none, e.g. mock mode). */
  trackingUrl(awb: string): string | null;
  createForwardOrder(input: ForwardOrderInput): Promise<CreatedOrder>;
  createReturnOrder(input: ReturnOrderInput): Promise<CreatedOrder>;
  assignAwb(providerShipmentId: string, opts: { isReturn: boolean; courierId?: string }): Promise<AwbResult>;
  requestPickup(providerShipmentId: string): Promise<{ scheduledAt?: string }>;
  generateLabel(providerShipmentId: string): Promise<{ labelUrl?: string }>;
  cancel(providerOrderIds: string[]): Promise<void>;
  track(awb: string): Promise<TrackingSnapshot>;
  serviceability(input: { pickupPincode: string; deliveryPincode: string; weightKg: number }): Promise<ServiceabilityResult>;
}
