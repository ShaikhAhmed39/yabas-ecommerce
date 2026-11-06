// Called by pg_cron every 15 minutes (see docs/DEPLOY.md). Protected by the x-cron-secret header.
import { errorResponse, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { requireEnv } from "../_shared/env.ts";
import { safeEqualStrings } from "../_shared/crypto.ts";
import { getShippingProvider } from "../_shared/shipping/provider.ts";
import { reconcile } from "../_shared/reconcile.ts";

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    if (!safeEqualStrings(requireEnv("CRON_SECRET"), req.headers.get("x-cron-secret") ?? "")) {
      return json({ error: "Unauthorized." }, 401);
    }
    let provider = null;
    try { provider = getShippingProvider(); } catch (e) { console.error("Shipping provider unavailable:", e instanceof Error ? e.message : e); }
    const report = await reconcile(adminClient(), provider);
    if (report.errors.length) console.error("Reconcile finished with errors:", report.errors);
    return json({ success: true, report });
  } catch (e) {
    return errorResponse(e);
  }
});
