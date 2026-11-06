// Public: "Can you deliver to my pincode?" Used on the product/checkout page. Never blocks checkout if the courier is down.
import { errorResponse, HttpError, json, preflight, readJson, requirePost } from "../_shared/http.ts";
import { env } from "../_shared/env.ts";
import { getShippingProvider } from "../_shared/shipping/provider.ts";

const cache = new Map<string, { at: number; value: { serviceable: boolean | null; etdDays?: number } }>();
const TTL_MS = 10 * 60 * 1000;

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const body = await readJson(req);
    const pincode = typeof body.pincode === "string" ? body.pincode.trim() : "";
    if (!/^[1-9]\d{5}$/.test(pincode)) throw new HttpError(400, "Enter a valid 6-digit pincode.");

    const hit = cache.get(pincode);
    if (hit && Date.now() - hit.at < TTL_MS) return json(hit.value, 200, req);

    let value: { serviceable: boolean | null; etdDays?: number };
    try {
      const res = await getShippingProvider().serviceability({
        pickupPincode: env("SHIPROCKET_PICKUP_PINCODE") ?? env("WAREHOUSE_PINCODE") ?? "400001",
        deliveryPincode: pincode,
        weightKg: 0.5,
      });
      const fastest = res.options.map((o) => o.etdDays).filter((d): d is number => typeof d === "number").sort((a, b) => a - b)[0];
      value = { serviceable: res.serviceable, ...(fastest ? { etdDays: fastest } : {}) };
    } catch (e) {
      console.error("Serviceability check failed:", e instanceof Error ? e.message : e);
      value = { serviceable: null }; // unknown -> the site says "we will confirm delivery after you order"
    }
    if (cache.size > 500) cache.clear();
    cache.set(pincode, { at: Date.now(), value });
    return json(value, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
