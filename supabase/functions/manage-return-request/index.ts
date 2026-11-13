// Admin return workflow:
//   requested -> approved (auto-books the pickup) -> pickup_scheduled -> received -> inspection_passed -> refund_pending -> refund_initiated -> completed
//   requested|approved|inspection_failed -> rejected      requested|approved -> cancelled
import { cleanText, errorResponse, HttpError, json, preflight, readJson, requirePost, requireUuid } from "../_shared/http.ts";
import { requireAdmin, type Db, userEmail } from "../_shared/supabase.ts";
import { envBool } from "../_shared/env.ts";
import { getShippingProvider } from "../_shared/shipping/provider.ts";
import { bookShipment, cancelShipment } from "../_shared/shipping/service.ts";
import { issueRefund } from "../_shared/refunds.ts";
import { sendMail } from "../_shared/notify.ts";

type Action =
  | "approve" | "reject" | "retry_pickup" | "schedule_pickup" | "mark_received" | "inspection_passed" | "inspection_failed"
  | "mark_refund_pending" | "issue_refund" | "cancel";

const transitions: Record<Action, { from: string[]; to: string | null }> = {
  approve: { from: ["requested"], to: "approved" },
  reject: { from: ["requested", "approved", "inspection_failed"], to: "rejected" },
  retry_pickup: { from: ["approved", "pickup_scheduled"], to: null },
  schedule_pickup: { from: ["approved"], to: "pickup_scheduled" },
  mark_received: { from: ["pickup_scheduled", "approved"], to: "received" },
  inspection_passed: { from: ["received"], to: "inspection_passed" },
  inspection_failed: { from: ["received"], to: "inspection_failed" },
  mark_refund_pending: { from: ["inspection_passed"], to: "refund_pending" },
  issue_refund: { from: ["refund_pending", "refund_initiated"], to: null },
  cancel: { from: ["requested", "approved"], to: "cancelled" },
};

const RETURN_COLUMNS = "id,order_id,order_item_id,quantity,user_id,status,refund_amount,admin_note,rejection_reason,pickup_scheduled_at,received_at,updated_at";

const SHIPMENT_COLUMNS =
  "id,order_id,return_request_id,direction,provider_reference,attempt,awb_code,courier_name,status,raw_status,tracking_url,label_url,pickup_scheduled_at,etd,picked_up_at,delivered_at,last_event_at,error,created_at";
const REFUND_COLUMNS = "id,order_id,return_request_id,amount_paise,status,reason,error,razorpay_refund_id,created_at,processed_at";
const CLOSED = ["completed", "rejected", "cancelled"];
const NEEDS_ACTION = ["requested", "received", "inspection_passed", "inspection_failed", "refund_pending"];

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** Paginated list for the admin Returns screen (page is 0-based). */
async function listReturns(db: Db, body: Record<string, unknown>) {
  const filter = ["needs_action", "open", "all"].includes(String(body.status)) ? String(body.status) : "needs_action";
  const page = Math.max(0, Math.floor(Number(body.page) || 0));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(body.page_size) || 15)));

  const closedList = `(${CLOSED.join(",")})`;
  let q = db.from("return_requests").select(`${RETURN_COLUMNS},photo_paths`, { count: "exact" });
  if (filter === "needs_action") q = q.in("status", NEEDS_ACTION);
  else if (filter === "open") q = q.not("status", "in", closedList);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new HttpError(500, "Could not load returns.");

  const rows = (data ?? []) as Row[];
  const rids = rows.map((r) => r.id as string);
  const [orders, items, ships, refunds] = await Promise.all([
    db.from("orders").select("id,order_number,customer_name,primary_phone,backup_phone,city,state,pincode,shipping_address_line1,shipping_address_line2,total_amount,payment_status,delivered_at")
      .in("id", [...new Set(rows.map((r) => r.order_id as string))]),
    db.from("order_items").select("id,product_title,unit_price,quantity").in("id", [...new Set(rows.map((r) => r.order_item_id as string))]),
    db.from("shipments").select(SHIPMENT_COLUMNS).in("return_request_id", rids).order("created_at", { ascending: false }),
    db.from("refunds").select(REFUND_COLUMNS).in("return_request_id", rids).order("created_at", { ascending: false }),
  ]);
  const oMap = new Map(((orders.data ?? []) as Row[]).map((o) => [o.id, o]));
  const iMap = new Map(((items.data ?? []) as Row[]).map((i) => [i.id, i]));
  const latest = (list: Row[] | null, id: string, prefer: (r: Row) => boolean) => {
    const mine = (list ?? []).filter((r) => r.return_request_id === id);
    return mine.find(prefer) ?? mine[0] ?? null;
  };

  const counts: Record<string, number> = {};
  await Promise.all([
    db.from("return_requests").select("id", { count: "exact", head: true }).in("status", NEEDS_ACTION).then((r) => { counts.needs_action = r.count ?? 0; }),
    db.from("return_requests").select("id", { count: "exact", head: true }).not("status", "in", closedList).then((r) => { counts.open = r.count ?? 0; }),
    db.from("return_requests").select("id", { count: "exact", head: true }).then((r) => { counts.all = r.count ?? 0; }),
  ]);

  return {
    success: true, total: count ?? 0, page, page_size: pageSize, counts,
    requests: rows.map((r) => {
      const { photo_paths, ...rest } = r;
      const o = oMap.get(r.order_id);
      return {
        ...rest,
        photo_count: Array.isArray(photo_paths) ? photo_paths.length : 0,
        order: o ? { ...o, order_number: o.order_number } : null,
        item: iMap.get(r.order_item_id) ?? null,
        shipment: latest(ships.data as Row[], r.id, (x) => x.status !== "cancelled"),
        refund: latest(refunds.data as Row[], r.id, (x) => x.status !== "failed"),
      };
    }),
  };
}

/** Short-lived signed links to the customer's private photos (admin only). */
async function returnPhotos(db: Db, id: string) {
  const { data: rr } = await db.from("return_requests").select("photo_paths").eq("id", id).maybeSingle();
  if (!rr) throw new HttpError(404, "Return request not found.");
  const paths = (rr.photo_paths ?? []) as string[];
  if (!paths.length) return { success: true, photos: [] };
  const { data: signed, error } = await db.storage.from("return-photos").createSignedUrls(paths, 600);
  if (error) throw new HttpError(500, "Could not open the photos.");
  return {
    success: true,
    photos: (signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => ({ path: s.path as string, signed_url: s.signedUrl })),
  };
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    requirePost(req);
    const { user, db } = await requireAdmin(req);
    const body = await readJson(req);
    const rawAction = String(body.action ?? "");
    if (rawAction === "list") return json(await listReturns(db, body), 200, req);
    if (rawAction === "get_photos") return json(await returnPhotos(db, requireUuid(body.return_request_id, "return request")), 200, req);

    const requestId = requireUuid(body.return_request_id, "return request");
    const action = rawAction as Action;
    if (!Object.prototype.hasOwnProperty.call(transitions, action)) throw new HttpError(400, "Unsupported return action.");
    const t = transitions[action];

    const adminNote = cleanText(body.admin_note, 2000) ?? "";
    const rejectionReason = cleanText(body.rejection_reason, 1000) ?? "";
    if (action === "reject" && rejectionReason.length < 3) throw new HttpError(400, "Give the customer a clear reason for rejecting.");

    const { data: rr, error } = await db.from("return_requests").select(RETURN_COLUMNS).eq("id", requestId).maybeSingle();
    if (error) throw new HttpError(500, "Unable to load the return request.");
    if (!rr) throw new HttpError(404, "Return request not found.");
    if (!t.from.includes(rr.status)) {
      throw new HttpError(409, `You cannot do that while the return is '${rr.status.replace(/_/g, " ")}'.`);
    }

    const { data: order } = await db.from("orders").select("user_id,order_number,customer_name").eq("id", rr.order_id).single();
    const customerEmail = order ? await userEmail(db, order.user_id, rr.order_id) : null;
    const mailBase = { name: order?.customer_name ?? "", orderNumber: order?.order_number ?? "" };
    const provider = () => getShippingProvider();

    const audit = (eventType: string, from: string | null, to: string | null, note?: string | null) =>
      db.rpc("log_order_event", {
        p_order_id: rr.order_id, p_actor_type: "admin", p_actor_id: user.id, p_event_type: eventType,
        p_from: from, p_to: to, p_note: note ?? null, p_payload: { return_request_id: rr.id },
      });

    // ---- actions that book / refund (no simple status flip) ----
    if (action === "retry_pickup") {
      const res = await bookShipment(db, provider(), {
        orderId: rr.order_id, direction: "return", returnRequestId: rr.id, actor: user.id,
      });
      return json({ success: true, shipment: res.shipment }, 200, req);
    }

    if (action === "issue_refund") {
      if (rr.refund_amount == null) throw new HttpError(409, "Set the refund amount first.");
      const refund = await issueRefund(db, {
        orderId: rr.order_id, returnRequestId: rr.id, amountPaise: Math.round(Number(rr.refund_amount) * 100),
        reason: "return", actor: user.id,
      });
      if (!refund.existing && refund.previousStatus !== refund.status) {
        await sendMail(customerEmail, "refund_initiated", { ...mailBase, amountRupees: Number(rr.refund_amount) });
      }
      const { data: fresh } = await db.from("return_requests").select(RETURN_COLUMNS).eq("id", rr.id).single();
      return json({ success: true, refund, return_request: fresh }, 200, req);
    }

    // ---- status flips ----
    const updates: Record<string, unknown> = { status: t.to };
    if (adminNote) updates.admin_note = adminNote;
    if (action === "reject") updates.rejection_reason = rejectionReason;
    if (action === "mark_received") updates.received_at = new Date().toISOString();
    if (action === "schedule_pickup") {
      const when = Date.parse(String(body.pickup_scheduled_at ?? ""));
      if (!Number.isFinite(when) || when <= Date.now()) throw new HttpError(400, "Pickup must be set to a valid future date and time.");
      updates.pickup_scheduled_at = new Date(when).toISOString();
    }

    if (action === "mark_refund_pending") {
      const { data: item } = await db.from("order_items").select("unit_price,quantity").eq("id", rr.order_item_id).eq("order_id", rr.order_id).maybeSingle();
      if (!item) throw new HttpError(500, "Unable to verify the returned item.");
      const itemTotalPaise = Math.round(Number(item.unit_price) * Number(rr.quantity ?? item.quantity) * 100);
      const requested = body.refund_amount === undefined || body.refund_amount === null
        ? itemTotalPaise
        : Math.round(Number(body.refund_amount) * 100);
      if (!Number.isSafeInteger(requested) || requested <= 0) throw new HttpError(400, "Provide a valid refund amount.");
      if (requested > itemTotalPaise) throw new HttpError(400, "Refund cannot be more than the price of the pieces being returned.");
      updates.refund_amount = requested / 100;
    }

    // a return pickup that is no longer needed must also be cancelled at the courier
    if (action === "reject" || action === "cancel") {
      const { data: ships } = await db.from("shipments").select("id,status").eq("return_request_id", rr.id).eq("direction", "return").neq("status", "cancelled");
      for (const s of ships ?? []) await cancelShipment(db, provider(), s.id, user.id);
    }

    const { data: updated, error: updateError } = await db
      .from("return_requests").update(updates).eq("id", rr.id).eq("status", rr.status).select(RETURN_COLUMNS).maybeSingle();
    if (updateError) {
      console.error("Return update failed:", updateError.message);
      throw new HttpError(500, "Unable to update the return request.");
    }
    if (!updated) throw new HttpError(409, "This return changed while you were working. Refresh and try again.");
    await audit(`return_${action}`, rr.status, t.to, adminNote || rejectionReason);

    let pickupError: string | null = null;
    let shipment: unknown = null;
    if (action === "approve") {
      if (envBool("RETURN_AUTO_PICKUP", true)) {
        try {
          shipment = (await bookShipment(db, provider(), {
            orderId: rr.order_id, direction: "return", returnRequestId: rr.id, actor: user.id,
          })).shipment;
        } catch (e) {
          // Approval stands; the admin sees the reason and can press "Retry pickup".
          pickupError = e instanceof Error ? e.message : "Pickup could not be booked";
        }
      }
      if (!shipment) await sendMail(customerEmail, "return_approved", mailBase);
    }
    if (action === "reject") await sendMail(customerEmail, "return_rejected", { ...mailBase, note: rejectionReason });
    if (action === "mark_received") await sendMail(customerEmail, "return_received", mailBase);

    const { data: fresh } = await db.from("return_requests").select(RETURN_COLUMNS).eq("id", rr.id).single();
    return json({ success: true, return_request: fresh, shipment, pickup_error: pickupError }, 200, req);
  } catch (e) {
    return errorResponse(e, req);
  }
});
