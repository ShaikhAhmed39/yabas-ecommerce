// Admin-only. Lets the admin panel put product photos into Cloudflare R2 without ever seeing the R2 keys.
// POST { action: "presign", count: 1..8 } -> { base, photos: [{ url, uploads: [{ key, put_url }] }] }
// POST { action: "delete", urls: [...] }  -> { deleted: n }   (only URLs on our own images host)
import { errorResponse, HttpError, json, preflight, readJson, requirePost } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import { requireEnv } from "../_shared/env.ts";
import { deleteObject, keyFromUrl, keysFor, newPhotoId, presignPut } from "../_shared/r2.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    await requireAdmin(req);
    const body = await readJson(req);
    const base = requireEnv("R2_PUBLIC_BASE").replace(/\/+$/, "");

    if (body.action === "presign") {
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > 8) throw new HttpError(400, "count must be 1 to 8.");
      const photos = [];
      for (let i = 0; i < count; i++) {
        const id = newPhotoId();
        const keys = keysFor(id);
        const uploads = await Promise.all(keys.map(async (key) => ({ key, put_url: await presignPut(key) })));
        photos.push({ url: `${base}/${keys[0]}`, uploads });
      }
      return json({ base, photos }, 200, req);
    }

    if (body.action === "delete") {
      const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string").slice(0, 40) : [];
      let deleted = 0;
      for (const url of urls) {
        const key = keyFromUrl(url, base);
        if (!key) continue; // not one of ours (e.g. old Supabase photo) - ignore
        const id = key.replace(/^p\//, "").replace(/(-md|-sm)?\.webp$/, "");
        for (const k of keysFor(id)) { await deleteObject(k); deleted++; }
      }
      return json({ deleted }, 200, req);
    }
    throw new HttpError(400, "Unknown action.");
  } catch (err) {
    return errorResponse(err, req);
  }
});
