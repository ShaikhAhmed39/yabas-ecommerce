// Public: guest order tracking by order number + the phone number used at checkout.
// No account needed. Returns only status information (never the address or phone). Rate limited in the database.
import { errorResponse, HttpError, json, preflight, readJson, requirePost } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const body = await readJson(req);
    const orderNumber = typeof body.order_number === "string" ? body.order_number.trim().toUpperCase().slice(0, 20) : "";
    const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "").slice(-10) : "";

    // Hash the caller address so no raw IPs are stored.
    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown").split(",")[0].trim();
    const ipHash = (await sha256Hex(`track:${ip}`)).slice(0, 32);

    const db = adminClient();
    const { data, error } = await db.rpc("track_order_public", {
      p_order_number: orderNumber, p_phone: phone, p_ip_hash: ipHash,
    });
    if (error) {
      if (/rate limited/i.test(error.message)) {
        throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
      }
      console.error("track_order_public failed:", error.message);
      throw new HttpError(500, "We could not look up your order right now. Please try again.");
    }
    // Same answer for "no such order" and "wrong phone", so nobody can probe which order numbers exist.
    return json(data, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
