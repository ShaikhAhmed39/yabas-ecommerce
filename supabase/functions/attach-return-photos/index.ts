// Links already-uploaded photos (private bucket `return-photos`) to the customer's own return request.
import { errorResponse, HttpError, json, preflight, readJson, requirePost, requireUuid } from "../_shared/http.ts";
import { adminClient, authenticate } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user } = await authenticate(req);
    const body = await readJson(req);
    const returnId = requireUuid(body.return_request_id, "return request");
    const paths = body.photo_paths;
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 5 || !paths.every((p) => typeof p === "string")) {
      throw new HttpError(400, "Attach between 1 and 5 photos.");
    }
    const prefix = `${user.id}/${returnId}/`;
    for (const p of paths as string[]) {
      if (!p.startsWith(prefix) || p.includes("..") || !/^[0-9a-f-]{36}\.webp$/i.test(p.slice(prefix.length))) {
        throw new HttpError(400, "One of the photo paths is not valid.");
      }
    }
    if (new Set(paths).size !== paths.length) throw new HttpError(400, "Duplicate photos.");

    const db = adminClient();
    const { data: rr } = await db.from("return_requests").select("id,status").eq("id", returnId).eq("user_id", user.id).maybeSingle();
    if (!rr) throw new HttpError(404, "Return request not found.");
    if (rr.status !== "requested") throw new HttpError(409, "Photos can only be added while the request is waiting for review.");

    // The files must really exist in storage (the client could send made-up paths).
    const { data: files, error } = await db.storage.from("return-photos").list(`${user.id}/${returnId}`, { limit: 20 });
    if (error) throw new HttpError(500, "Could not verify the uploaded photos.");
    const present = new Set((files ?? []).map((f) => `${prefix}${f.name}`));
    if (!(paths as string[]).every((p) => present.has(p))) throw new HttpError(400, "Some photos were not uploaded. Please try again.");

    const { data: ok, error: rpcErr } = await db.rpc("attach_return_photo_paths", {
      p_return_request_id: returnId, p_photo_paths: paths,
    });
    if (rpcErr) throw new HttpError(500, "Could not attach the photos.");
    if (ok !== true) throw new HttpError(409, "Photos are already attached to this request.");
    return json({ success: true, return_request_id: returnId }, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
