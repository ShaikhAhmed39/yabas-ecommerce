// Courier (Shiprocket) -> us. Tracking updates.
// Panel setup: Shiprocket -> Settings -> API -> Webhooks.
//   URL   = https://<project>.supabase.co/functions/v1/courier-webhook
//   Token = the value of SHIPROCKET_WEBHOOK_TOKEN (Shiprocket sends it in the `x-api-key` header)
// The function name deliberately has no brand word in it (Shiprocket may refuse some words in webhook URLs).
import { errorResponse, HttpError } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { requireEnv } from "../_shared/env.ts";
import { safeEqualStrings } from "../_shared/crypto.ts";
import { parseCourierWebhook } from "../_shared/shipping/status.ts";
import { getShippingProvider } from "../_shared/shipping/provider.ts";
import { applyCourierEvent } from "../_shared/shipping/service.ts";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request): Promise<Response> => {
  // Shiprocket's "test" button may use GET/HEAD; answer 200 so the panel accepts the URL.
  if (req.method === "GET" || req.method === "HEAD") return reply({ ok: true });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  try {
    const token = requireEnv("SHIPROCKET_WEBHOOK_TOKEN");
    const given = req.headers.get("x-api-key") ?? "";
    if (!safeEqualStrings(token, given)) return reply({ error: "Unauthorized." }, 401);

    const text = await req.text();
    if (text.length > 1_000_000) return reply({ error: "Payload too large." }, 413);
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return reply({ received: true, ignored: "not json" }); }

    const event = parseCourierWebhook(payload);
    if (!event) return reply({ received: true, ignored: "no awb/status" });

    const result = await applyCourierEvent(adminClient(), getShippingProvider(), event, payload);
    return reply({ received: true, ...result });
  } catch (e) {
    if (e instanceof HttpError && e.status < 500) return reply({ received: true, ignored: e.message });
    console.error("courier-webhook failed:", e instanceof Error ? e.message : e);
    return errorResponse(e);
  }
});
