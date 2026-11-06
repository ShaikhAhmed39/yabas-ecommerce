// Live Shiprocket provider (https://apiv2.shiprocket.in/v1/external).
// Auth: login with an *API user* (Shiprocket panel -> Settings -> API -> Create API User), NOT your panel login.
// The login token is valid for ~24h; we cache it for 23h and transparently log in again on a 401.
import { buildForwardOrderPayload, buildReturnOrderPayload } from "./payloads.ts";
import { parseCourierTime } from "./status.ts";
import {
  type AwbResult,
  type CourierOption,
  type CreatedOrder,
  type ForwardOrderInput,
  type ReturnOrderInput,
  type ServiceabilityResult,
  ShippingError,
  type ShippingProvider,
  type TrackingSnapshot,
} from "./types.ts";

const BASE = "https://apiv2.shiprocket.in/v1/external";

/** Every endpoint lives here. If Shiprocket changes a path, fix it in this one object. */
export const SHIPROCKET_PATHS = {
  login: "/auth/login",
  createForward: "/orders/create/adhoc",
  createReturn: "/orders/create/return",
  assignAwb: "/courier/assign/awb",
  pickup: "/courier/generate/pickup",
  label: "/courier/generate/label",
  cancelOrders: "/orders/cancel",
  trackAwb: (awb: string) => `/courier/track/awb/${encodeURIComponent(awb)}`,
  serviceability: "/courier/serviceability/",
} as const;

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
let cachedToken: { token: string; expiresAt: number } | null = null;

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

function idValue(id: string): number | string {
  return /^\d+$/.test(id) ? Number(id) : id;
}

/** Pulls a human-readable message out of Shiprocket's several error shapes. */
export function extractMessage(res: unknown): string | null {
  if (typeof res !== "object" || res === null) return null;
  const r = res as Json;
  const awbError = r.response?.data?.awb_assign_error;
  if (typeof awbError === "string" && awbError) return awbError;
  const parts: string[] = [];
  if (typeof r.message === "string" && r.message) parts.push(r.message);
  if (r.errors && typeof r.errors === "object") {
    for (const [field, msgs] of Object.entries(r.errors as Json)) {
      const text = Array.isArray(msgs) ? msgs.join(", ") : String(msgs);
      parts.push(`${field}: ${text}`);
    }
  }
  return parts.length ? parts.join(" | ") : null;
}

export class ShiprocketProvider implements ShippingProvider {
  readonly mode = "live" as const;
  private email: string;
  private password: string;
  private trackingTemplate: string;

  constructor(opts: { email: string; password: string; trackingUrlTemplate?: string }) {
    this.email = opts.email;
    this.password = opts.password;
    this.trackingTemplate = opts.trackingUrlTemplate ?? "https://shiprocket.co/tracking/{awb}";
  }

  trackingUrl(awb: string): string | null {
    return this.trackingTemplate.replace("{awb}", encodeURIComponent(awb));
  }

  private async login(): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${BASE}${SHIPROCKET_PATHS.login}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.email, password: this.password }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      throw new ShippingError(`Could not reach Shiprocket: ${e instanceof Error ? e.message : e}`, true);
    }
    const body = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok || typeof body.token !== "string") {
      throw new ShippingError(
        "Shiprocket login failed. Check SHIPROCKET_API_EMAIL / SHIPROCKET_API_PASSWORD (they must belong to an API user, not your panel login).",
        false,
      );
    }
    cachedToken = { token: body.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return body.token;
  }

  private async token(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
    return await this.login();
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    query?: Record<string, string>,
    retried = false,
  ): Promise<Json> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.token()}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      if (e instanceof ShippingError) throw e;
      throw new ShippingError(`Could not reach Shiprocket: ${e instanceof Error ? e.message : e}`, true);
    }

    if (res.status === 401 && !retried) {
      cachedToken = null;
      return this.call(method, path, body, query, true);
    }

    const text = await res.text();
    let json: Json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch { /* not JSON */ }

    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
      throw new ShippingError(extractMessage(json) ?? `Shiprocket error ${res.status}`, retryable);
    }
    return json;
  }

  async createForwardOrder(input: ForwardOrderInput): Promise<CreatedOrder> {
    const res = await this.call("POST", SHIPROCKET_PATHS.createForward, buildForwardOrderPayload(input));
    if (!res.order_id || !res.shipment_id) {
      throw new ShippingError(
        `Shiprocket did not create the order${extractMessage(res) ? `: ${extractMessage(res)}` : ""}. ` +
          "Check that SHIPROCKET_PICKUP_LOCATION matches a pickup address saved in your Shiprocket panel.",
      );
    }
    return { providerOrderId: String(res.order_id), providerShipmentId: String(res.shipment_id) };
  }

  async createReturnOrder(input: ReturnOrderInput): Promise<CreatedOrder> {
    const res = await this.call("POST", SHIPROCKET_PATHS.createReturn, buildReturnOrderPayload(input));
    if (!res.order_id || !res.shipment_id) {
      throw new ShippingError(
        `Shiprocket did not create the return order${extractMessage(res) ? `: ${extractMessage(res)}` : ""}`,
      );
    }
    return { providerOrderId: String(res.order_id), providerShipmentId: String(res.shipment_id) };
  }

  async assignAwb(
    providerShipmentId: string,
    opts: { isReturn: boolean; courierId?: string },
  ): Promise<AwbResult> {
    const body: Json = { shipment_id: idValue(providerShipmentId) };
    if (opts.courierId) body.courier_id = idValue(opts.courierId);
    if (opts.isReturn) body.is_return = 1;
    const res = await this.call("POST", SHIPROCKET_PATHS.assignAwb, body);
    const data: Json = res.response?.data ?? res.data ?? {};
    const awb = data.awb_code ?? res.awb_code;
    if (res.awb_assign_status === 0 || !awb) {
      throw new ShippingError(
        extractMessage(res) ??
          "Shiprocket could not assign a courier. Check your Shiprocket wallet balance and that the pincode is serviceable.",
      );
    }
    return {
      awbCode: String(awb),
      courierName: String(data.courier_name ?? "Courier"),
      courierId: data.courier_company_id != null ? String(data.courier_company_id) : undefined,
    };
  }

  async requestPickup(providerShipmentId: string): Promise<{ scheduledAt?: string }> {
    try {
      const res = await this.call("POST", SHIPROCKET_PATHS.pickup, { shipment_id: [idValue(providerShipmentId)] });
      if (res.pickup_status === 0) {
        const msg = extractMessage(res) ?? (typeof res.response?.data === "string" ? res.response.data : null);
        if (msg && /already/i.test(msg)) return {};
        throw new ShippingError(msg ?? "Shiprocket could not schedule the pickup.");
      }
      const when = res.response?.pickup_scheduled_date ?? res.pickup_scheduled_date;
      return { scheduledAt: parseCourierTime(when) ?? undefined };
    } catch (e) {
      // Safe to repeat: "pickup already scheduled" means an earlier attempt worked.
      if (e instanceof ShippingError && /already/i.test(e.message)) return {};
      throw e;
    }
  }

  async generateLabel(providerShipmentId: string): Promise<{ labelUrl?: string }> {
    const res = await this.call("POST", SHIPROCKET_PATHS.label, { shipment_id: [idValue(providerShipmentId)] });
    return { labelUrl: typeof res.label_url === "string" && res.label_url ? res.label_url : undefined };
  }

  async cancel(providerOrderIds: string[]): Promise<void> {
    try {
      await this.call("POST", SHIPROCKET_PATHS.cancelOrders, { ids: providerOrderIds.map(idValue) });
    } catch (e) {
      if (e instanceof ShippingError && /already (been )?cancel/i.test(e.message)) return;
      throw e;
    }
  }

  async track(awb: string): Promise<TrackingSnapshot> {
    const res = await this.call("GET", SHIPROCKET_PATHS.trackAwb(awb));
    const td: Json = res.tracking_data ?? {};
    const track: Json | undefined = Array.isArray(td.shipment_track) ? td.shipment_track[0] : undefined;
    const activities: Json[] = Array.isArray(td.shipment_track_activities) ? td.shipment_track_activities : [];
    return {
      awb,
      currentStatus: typeof track?.current_status === "string" ? track.current_status : null,
      etd: parseCourierTime(td.etd ?? track?.edd) ?? null,
      activities: activities.map((a) => ({
        date: String(a.date ?? ""),
        activity: String(a.activity ?? a.status ?? ""),
        location: a.location ? String(a.location) : undefined,
        status: a["sr-status-label"] ? String(a["sr-status-label"]) : a.status ? String(a.status) : undefined,
      })),
    };
  }

  async serviceability(
    input: { pickupPincode: string; deliveryPincode: string; weightKg: number },
  ): Promise<ServiceabilityResult> {
    const res = await this.call("GET", SHIPROCKET_PATHS.serviceability, undefined, {
      pickup_postcode: input.pickupPincode,
      delivery_postcode: input.deliveryPincode,
      weight: String(input.weightKg),
      cod: "0",
    });
    const list: Json[] = Array.isArray(res.data?.available_courier_companies) ? res.data.available_courier_companies : [];
    const options: CourierOption[] = list
      .map((c) => ({
        courierId: String(c.courier_company_id),
        courierName: String(c.courier_name ?? "Courier"),
        rate: Number(c.rate ?? c.freight_charge ?? 0),
        etdDays: Number.isFinite(Number(c.estimated_delivery_days)) ? Number(c.estimated_delivery_days) : undefined,
      }))
      .filter((c) => c.courierId && c.courierId !== "undefined")
      .sort((a, b) => a.rate - b.rate);
    return { serviceable: options.length > 0, options };
  }
}
