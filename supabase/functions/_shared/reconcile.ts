// Safety net that runs every ~15 minutes. Anything a lost webhook or a crash left half-done is fixed here.
import type { Db } from "./supabase.ts";
import { fetchOrderPayments, fetchRefund, RazorpayError } from "./razorpay.ts";
import { SETTLE_ORDER_COLUMNS, type SettleOrder, settlePayment } from "./payments.ts";
import { sendRefundToRazorpay } from "./refunds.ts";
import type { ShippingProvider } from "./shipping/types.ts";
import { refreshShipment } from "./shipping/service.ts";

export interface ReconcileReport {
  unpaidChecked: number; paymentsRecovered: number; ordersExpired: number;
  lateChecked: number; lateRefunds: number;
  shipmentsRefreshed: number; refundsRetried: number; refundsSynced: number; errors: string[];
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export async function reconcile(db: Db, provider: ShippingProvider | null): Promise<ReconcileReport> {
  const r: ReconcileReport = {
    unpaidChecked: 0, paymentsRecovered: 0, ordersExpired: 0, lateChecked: 0, lateRefunds: 0,
    shipmentsRefreshed: 0, refundsRetried: 0, refundsSynced: 0, errors: [],
  };
  const fail = (what: string, e: unknown) => r.errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));

  // 1) Unpaid orders older than 30 min: if Razorpay actually received money, settle; otherwise free the reserved stock.
  const { data: unpaid } = await db.from("orders").select(SETTLE_ORDER_COLUMNS)
    .eq("payment_status", "pending").eq("inventory_status", "reserved").lt("created_at", minutesAgo(30))
    .order("created_at").limit(40);
  for (const order of (unpaid ?? []) as SettleOrder[]) {
    r.unpaidChecked++;
    try {
      let paid = false;
      if (order.razorpay_order_id) {
        const payments = await fetchOrderPayments(order.razorpay_order_id);
        const good = payments.find((p) => p.status === "captured") ?? payments.find((p) => p.status === "authorized");
        if (good) {
          const out = await settlePayment(db, order, good);
          if (out.outcome === "paid" || out.outcome === "already_paid") { r.paymentsRecovered++; paid = true; }
        }
      }
      if (!paid) {
        const { data } = await db.rpc("expire_unpaid_order", { p_order_id: order.id, p_min_age_minutes: 30 });
        if ((data as { expired?: boolean } | null)?.expired) r.ordersExpired++;
      }
    } catch (e) { fail(`unpaid ${order.id}`, e); }
  }

  // 2) Orders we already expired/failed in the last 48h: a customer may still have paid late -> settle (restock-or-refund).
  const { data: late } = await db.from("orders").select(SETTLE_ORDER_COLUMNS)
    .in("payment_status", ["cancelled", "failed"]).not("razorpay_order_id", "is", null).gt("created_at", minutesAgo(48 * 60))
    .order("created_at", { ascending: false }).limit(30);
  for (const order of (late ?? []) as SettleOrder[]) {
    r.lateChecked++;
    try {
      const payments = await fetchOrderPayments(order.razorpay_order_id!);
      const good = payments.find((p) => p.status === "captured") ?? payments.find((p) => p.status === "authorized");
      if (good) {
        const out = await settlePayment(db, order, good);
        if (out.outcome === "refund_started" || out.outcome === "refund_pending_retry") r.lateRefunds++;
        if (out.outcome === "paid") r.paymentsRecovered++;
      }
    } catch (e) { fail(`late ${order.id}`, e); }
  }

  // 3) Refunds stuck in 'creating' (Razorpay did not answer): resend with the SAME idempotency key = never a double refund.
  const { data: creating } = await db.from("refunds")
    .select("id,order_id,payment_id,amount_paise,idempotency_key,status")
    .eq("status", "creating").lt("updated_at", minutesAgo(2)).limit(20);
  for (const rf of creating ?? []) {
    try {
      await sendRefundToRazorpay(db, {
        refundId: rf.id, idempotencyKey: rf.idempotency_key, paymentId: rf.payment_id,
        amountPaise: Number(rf.amount_paise), orderId: rf.order_id,
      }, "creating", true);
      r.refundsRetried++;
    } catch (e) { fail(`refund ${rf.id}`, e); }
  }

  // 4) Refunds 'pending' for over an hour: ask Razorpay for the final state (covers a lost refund webhook).
  const { data: pending } = await db.from("refunds").select("id,razorpay_refund_id")
    .eq("status", "pending").not("razorpay_refund_id", "is", null).lt("updated_at", minutesAgo(60)).limit(30);
  for (const rf of pending ?? []) {
    try {
      const rz = await fetchRefund(rf.razorpay_refund_id!);
      if (rz.status === "processed" || rz.status === "failed") {
        await db.rpc("apply_refund_update", {
          p_razorpay_refund_id: rz.id, p_status: rz.status, p_speed_processed: rz.speed_processed ?? null,
          p_error: rz.status === "failed" ? "Razorpay reported the refund as failed" : null,
        });
        r.refundsSynced++;
      }
    } catch (e) {
      if (!(e instanceof RazorpayError)) fail(`refund-sync ${rf.id}`, e); else fail(`refund-sync ${rf.id}`, e);
    }
  }

  // 5) Parcels with no courier update for 6h: poll the courier (covers lost courier webhooks).
  if (provider && provider.mode === "live") {
    const { data: ships } = await db.from("shipments").select("id")
      .in("status", ["awb_assigned", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery", "undelivered", "rto_initiated"])
      .not("awb_code", "is", null).lt("updated_at", minutesAgo(360)).order("updated_at").limit(25);
    for (const s of ships ?? []) {
      try { await refreshShipment(db, provider, s.id); r.shipmentsRefreshed++; } catch (e) { fail(`shipment ${s.id}`, e); }
    }
  }
  return r;
}
