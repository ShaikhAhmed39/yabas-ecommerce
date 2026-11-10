// Customer e-mails via Resend. Best-effort: a failed or unconfigured e-mail NEVER breaks an order/shipping/refund step.
import { env } from "./env.ts";

export type MailKind =
  | "order_confirmed" | "shipped" | "out_for_delivery" | "delivered" | "delivery_failed"
  | "order_cancelled" | "return_approved" | "return_rejected" | "return_received" | "refund_initiated" | "refund_processed";

export interface MailData {
  name: string;
  orderNumber: string;
  trackingUrl?: string | null;
  awb?: string | null;
  courier?: string | null;
  amountRupees?: number | null;
  note?: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Pure: builds subject + plain text + simple HTML. Unit-tested. */
export function renderEmail(kind: MailKind, d: MailData): { subject: string; text: string; html: string } {
  const o = d.orderNumber;
  const track = d.trackingUrl ? `Track your parcel: ${d.trackingUrl}` : d.awb ? `Tracking number (AWB): ${d.awb}` : "";
  const amount = d.amountRupees != null ? inr(d.amountRupees) : "";
  const map: Record<MailKind, { subject: string; lines: string[] }> = {
    order_confirmed: { subject: `Order ${o} confirmed`, lines: [`Thank you! We have received your payment for order ${o}.`, "We will pack it with care and send you the tracking details soon."] },
    shipped: { subject: `Your order ${o} is on its way`, lines: [`Order ${o} has been handed to ${d.courier ?? "our courier partner"}.`, track] },
    out_for_delivery: { subject: `Order ${o} is out for delivery`, lines: [`Your parcel arrives today. Please keep your phone reachable.`, track] },
    delivered: { subject: `Order ${o} delivered`, lines: [`Your order ${o} has been delivered. We hope you love it.`, "Need to return something? Open My Orders within the return window."] },
    delivery_failed: { subject: `Delivery attempt for ${o} was unsuccessful`, lines: [`The courier could not deliver order ${o}. We will contact you to arrange another attempt.`, track] },
    order_cancelled: { subject: `Order ${o} cancelled`, lines: [`Your order ${o} has been cancelled.`, amount ? `A refund of ${amount} will be sent to your original payment method.` : "", d.note ? `Reason: ${d.note}` : ""] },
    return_approved: { subject: `Return approved for order ${o}`, lines: [`Your return request for order ${o} is approved.`, "A courier will collect the item from your address. Please keep it packed with all tags and the original box.", track] },
    return_rejected: { subject: `Return request for order ${o} was not approved`, lines: [`We could not approve your return request for order ${o}.`, d.note ? `Reason: ${d.note}` : ""] },
    return_received: { subject: `We received your return for order ${o}`, lines: ["Our team will inspect the item and update you shortly."] },
    refund_initiated: { subject: `Refund started for order ${o}`, lines: [`We have started a refund${amount ? ` of ${amount}` : ""} for order ${o}.`, "Banks usually take 5-7 working days to show it."] },
    refund_processed: { subject: `Refund completed for order ${o}`, lines: [`Your refund${amount ? ` of ${amount}` : ""} for order ${o} has been processed.`] },
  };
  const m = map[kind];
  const lines = [`Hi ${d.name || "there"},`, "", ...m.lines.filter(Boolean), "", "Warm regards,", env("MAIL_SIGNATURE") ?? "Yaba's Imitation & Jewellery"];
  const text = lines.join("\n");
  const html = `<div style="font-family:Georgia,serif;color:#2b2118;line-height:1.6;max-width:560px">${
    lines.map((l) => l === "" ? "<br>" : `<p style="margin:0 0 6px">${esc(l).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>')}</p>`).join("")
  }</div>`;
  return { subject: m.subject, text, html };
}

export async function sendMail(to: string | null | undefined, kind: MailKind, data: MailData): Promise<void> {
  const key = env("RESEND_API_KEY");
  if (!key || !to) return;
  const from = env("MAIL_FROM");
  if (!from) { console.error("MAIL_FROM is not set; skipping e-mail"); return; }
  try {
    const mail = renderEmail(kind, data);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("Resend rejected e-mail:", res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error("E-mail failed (ignored):", e instanceof Error ? e.message : e);
  }
}
