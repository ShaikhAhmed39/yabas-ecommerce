// Offline courier for testing the whole flow without a Shiprocket account.
// Deterministic (same input -> same ids) so retries behave like the real thing. NEVER used when SHIPPING_MODE=live.
import {
  type AwbResult,
  type CreatedOrder,
  type ForwardOrderInput,
  type ReturnOrderInput,
  type ServiceabilityResult,
  type ShippingProvider,
  type TrackingSnapshot,
} from "./types.ts";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export class MockProvider implements ShippingProvider {
  readonly mode = "mock" as const;

  trackingUrl(_awb: string): string | null {
    return null;
  }

  createForwardOrder(input: ForwardOrderInput): Promise<CreatedOrder> {
    const h = hash(input.reference);
    return Promise.resolve({ providerOrderId: `MOCK-O-${h}`, providerShipmentId: `MOCK-S-${h}` });
  }

  createReturnOrder(input: ReturnOrderInput): Promise<CreatedOrder> {
    return this.createForwardOrder(input as unknown as ForwardOrderInput);
  }

  assignAwb(providerShipmentId: string, opts: { isReturn: boolean }): Promise<AwbResult> {
    const digits = String(hash(providerShipmentId)).padStart(10, "0").slice(0, 10);
    return Promise.resolve({
      awbCode: `MOCK${opts.isReturn ? "R" : "F"}${digits}`,
      courierName: "Mock Express (test mode)",
      courierId: "0",
    });
  }

  requestPickup(_providerShipmentId: string): Promise<{ scheduledAt?: string }> {
    const tomorrow10IST = new Date();
    tomorrow10IST.setUTCDate(tomorrow10IST.getUTCDate() + 1);
    tomorrow10IST.setUTCHours(4, 30, 0, 0);
    return Promise.resolve({ scheduledAt: tomorrow10IST.toISOString() });
  }

  generateLabel(_providerShipmentId: string): Promise<{ labelUrl?: string }> {
    return Promise.resolve({});
  }

  cancel(_providerOrderIds: string[]): Promise<void> {
    return Promise.resolve();
  }

  track(awb: string): Promise<TrackingSnapshot> {
    return Promise.resolve({ awb, currentStatus: null, activities: [] });
  }

  serviceability(input: { deliveryPincode: string }): Promise<ServiceabilityResult> {
    const ok = /^[1-9]\d{5}$/.test(input.deliveryPincode);
    return Promise.resolve({
      serviceable: ok,
      options: ok ? [{ courierId: "0", courierName: "Mock Express (test mode)", rate: 49, etdDays: 3 }] : [],
    });
  }
}
