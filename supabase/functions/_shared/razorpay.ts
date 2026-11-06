// Thin, typed Razorpay client + signature helpers.
// Docs used: Orders / Payments / Refunds APIs, Webhooks (X-Razorpay-Signature), Refund idempotency (X-Refund-Idempotency).
import { hmacSha256Hex, safeEqualHex } from "./crypto.ts";
import { env, isProduction, requireEnv } from "./env.ts";
import { HttpError } from "./http.ts";

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  status: number;
  code?: string;
  /** true when Razorpay clearly refused (repeating the same call will not help). false = unknown outcome. */
  definitive: boolean;
  constructor(message: string, status: number, code: string | undefined, definitive: boolean) {
    super(message);
    this.name = "RazorpayError";
    this.status = status;
    this.code = code;
    this.definitive = definitive;
  }
}

export interface RzpPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed" | string;
  captured?: boolean;
  method?: string;
  error_description?: string | null;
}

export interface RzpRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed" | string;
  speed_processed?: string;
  receipt?: string | null;
}

export function assertKeyModeMatchesEnvironment(keyId: string): void {
  if (isProduction() && keyId.startsWith("rzp_test_")) {
    console.error("APP_ENV=production but RAZORPAY_KEY_ID is a TEST key. Refusing to take payments.");
    throw new HttpError(503, "Payments are not available right now.");
  }
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const keyId = requireEnv("RAZORPAY_KEY_ID");
  const secret = requireEnv("RAZORPAY_KEY_SECRET");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${secret}`)}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // Timeout / network error: we do NOT know whether Razorpay processed it.
    throw new RazorpayError(e instanceof Error ? e.message : "network error", 0, "NETWORK", false);
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch { /* non-JSON error page */ }

  if (!res.ok) {
    const err = (parsed as { error?: { code?: string; description?: string } } | null)?.error;
    const definitive = res.status >= 400 && res.status < 500 && ![408, 409, 429].includes(res.status);
    throw new RazorpayError(err?.description ?? `Razorpay error ${res.status}`, res.status, err?.code, definitive);
  }
  return parsed as T;
}

export const fetchPayment = (paymentId: string) =>
  request<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);

export async function fetchOrderPayments(razorpayOrderId: string): Promise<RzpPayment[]> {
  const res = await request<{ items?: RzpPayment[] }>(
    "GET",
    `/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
  );
  return res.items ?? [];
}

/** Captures an AUTHORIZED payment (only needed when auto-capture is switched off in the dashboard). */
export const capturePayment = (paymentId: string, amountPaise: number) =>
  request<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, {
    amount: amountPaise,
    currency: "INR",
  });

export const fetchRefund = (refundId: string) =>
  request<RzpRefund>("GET", `/refunds/${encodeURIComponent(refundId)}`);

export interface CreateRefundInput {
  paymentId: string;
  amountPaise: number;
  /** Same key + same body = safe retry (Razorpay returns the original refund). Min 10 chars: letters, digits, - _ */
  idempotencyKey: string;
  /** Our own reference, max 40 chars. */
  receipt: string;
  notes?: Record<string, string>;
}

export function createRefund(input: CreateRefundInput): Promise<RzpRefund> {
  // "normal" is free (5-7 working days). "optimum" tries an instant refund (Razorpay may charge a fee).
  const speed = env("RAZORPAY_REFUND_SPEED") === "optimum" ? "optimum" : "normal";
  return request<RzpRefund>(
    "POST",
    `/payments/${encodeURIComponent(input.paymentId)}/refund`,
    { amount: input.amountPaise, speed, receipt: input.receipt, notes: input.notes ?? {} },
    { "X-Refund-Idempotency": input.idempotencyKey },
  );
}

/** Webhook: HMAC-SHA256 of the RAW body keyed with the dashboard webhook secret (NOT the API key secret). */
export async function verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  return safeEqualHex(await hmacSha256Hex(secret, rawBody), signature);
}

/** Checkout callback: HMAC-SHA256 of "<razorpay_order_id>|<razorpay_payment_id>" keyed with the API key secret. */
export async function verifyCheckoutSignature(
  razorpayOrderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): Promise<boolean> {
  return safeEqualHex(await hmacSha256Hex(keySecret, `${razorpayOrderId}|${paymentId}`), signature);
}
