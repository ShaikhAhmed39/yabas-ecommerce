import { env, envBool, isProduction, requireEnv } from "../env.ts";
import { HttpError } from "../http.ts";
import { MockProvider } from "./mock.ts";
import { ShiprocketProvider } from "./shiprocket.ts";
import type { ShippingProvider } from "./types.ts";

export type ShippingMode = "live" | "mock";

export function shippingMode(): ShippingMode {
  return (env("SHIPPING_MODE") ?? "mock").toLowerCase() === "live" ? "live" : "mock";
}

/**
 * SHIPPING_MODE=live  -> real Shiprocket (needs SHIPROCKET_API_EMAIL / SHIPROCKET_API_PASSWORD)
 * SHIPPING_MODE=mock  -> fake courier for testing (default). Refused when APP_ENV=production, so a live shop
 *                        can never hand customers fake tracking numbers by accident.
 */
export function getShippingProvider(): ShippingProvider {
  if (shippingMode() === "live") {
    return new ShiprocketProvider({
      email: requireEnv("SHIPROCKET_API_EMAIL"),
      password: requireEnv("SHIPROCKET_API_PASSWORD"),
      trackingUrlTemplate: env("TRACKING_URL_TEMPLATE"),
    });
  }
  if (isProduction() && !envBool("ALLOW_MOCK_SHIPPING_IN_PRODUCTION", false)) {
    console.error("APP_ENV=production but SHIPPING_MODE is not 'live'. Refusing to create fake shipments.");
    throw new HttpError(503, "Shipping is not switched to live mode yet.");
  }
  return new MockProvider();
}
