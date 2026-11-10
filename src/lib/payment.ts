import { ApiError, callFunction, errorMessage } from '@/lib/api';

export type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; confirm_close?: boolean; escape?: boolean };
  timeout?: number;
  retry?: { enabled: boolean; max_count?: number };
  notes?: Record<string, string>;
  handler: (response: RazorpaySuccessResponse) => void | Promise<void>;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: (response: unknown) => void) => void;
    };
  }
}

const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function validateIndianMobile(phone: string): string | null {
  if (!/^[6-9]\d{9}$/.test(phone)) return 'Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.';
  if (/^(\d)\1{9}$/.test(phone)) return 'Enter your real mobile number.';
  return null;
}

export function validatePincodeFormat(pin: string): string | null {
  if (!/^[1-9]\d{5}$/.test(pin)) return 'Enter a valid 6-digit PIN code.';
  if (/^(\d)\1{5}$/.test(pin)) return 'Enter a real 6-digit PIN code.';
  return null;
}

export function validateEmail(email: string): string | null {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim()) ? null : 'Enter a valid e-mail address.';
}

export interface PincodeInfo { status: 'valid' | 'invalid' | 'unknown'; city?: string; state?: string }

/** Looks the PIN up in the postal directory. If that free service is down we never block a sale ('unknown'). */
export async function lookupPincode(pin: string): Promise<PincodeInfo> {
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { status: 'unknown' };
    const result: unknown = await r.json();
    if (!Array.isArray(result) || !result.length) return { status: 'unknown' };
    const first = result[0] as { Status?: unknown; PostOffice?: { District?: string; State?: string }[] };
    if (first.Status === 'Success' && Array.isArray(first.PostOffice) && first.PostOffice.length) {
      return { status: 'valid', city: first.PostOffice[0].District, state: first.PostOffice[0].State };
    }
    return { status: first.Status === 'Error' ? 'invalid' : 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export interface CheckoutCustomer {
  customer_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  primary_phone: string;
  backup_phone: string | null;
}
export interface CheckoutExtras {
  email: string;
  coupon_code?: string;
  gift_wrap?: boolean;
  gift_message?: string;
  consent_version: string;
}
export interface PaymentCallbacks {
  onStatus: (message: string | null) => void;
  onPaid: (r: { orderId: string; orderNumber: string | null }) => void;
  onError: (message: string) => void;
  onDismiss: () => void;
}

interface CreateResp { orderId?: string; razorpayOrderId?: string; amount?: number; currency?: string; keyId?: string }

/** One shared place for the whole Razorpay flow: server-side order, popup, server-side verification with polling. */
export async function startRazorpayPayment(args: {
  requestId: string;
  items: { product_id: string; quantity: number }[];
  customer: CheckoutCustomer;
  extras: CheckoutExtras;
  prefillEmail: string;
  onRequestExpired: () => void;
  cb: PaymentCallbacks;
}): Promise<void> {
  const { cb } = args;
  if (!(await loadRazorpayScript()) || !window.Razorpay) {
    throw new Error('The payment window could not be loaded. Check your connection and try again.');
  }
  let created: CreateResp;
  try {
    created = await callFunction<CreateResp>('create-razorpay-order', {
      checkout_request_id: args.requestId,
      items: args.items,
      customer: args.customer,
      ...args.extras,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) args.onRequestExpired();
    throw e;
  }
  if (!created.orderId || !created.razorpayOrderId || !Number.isInteger(created.amount) || !created.currency || !created.keyId) {
    throw new Error('Payment is not available right now. Please try again shortly.');
  }
  const Razorpay = window.Razorpay;
  const orderId = created.orderId;

  const confirm = async (response: RazorpaySuccessResponse) => {
    cb.onStatus('Confirming your payment with the bank. Please do not close or refresh this page.');
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await callFunction<{ success?: boolean; pending?: boolean; order_id?: string; order_number?: string }>(
        'verify-razorpay-payment', { ...response });
      if (result.success) {
        cb.onStatus(null);
        cb.onPaid({ orderId: String(result.order_id || orderId), orderNumber: result.order_number ?? null });
        return;
      }
      if (!result.pending) break;
      await sleep(3000);
    }
    cb.onStatus(null);
    cb.onError('Your payment is still being confirmed by the bank. Please do not pay again. Check My Orders or Track Order in a few minutes: the order appears as soon as the payment is confirmed, and any failed payment is refunded automatically.');
  };

  const rzp = new Razorpay({
    key: created.keyId,
    amount: created.amount!,
    currency: created.currency,
    name: "Yaba's Imitation & Jewellery",
    description: 'Secure payment',
    order_id: created.razorpayOrderId,
    prefill: { email: args.prefillEmail, name: args.customer.customer_name, contact: args.customer.primary_phone },
    notes: { yaba_order_id: orderId },
    theme: { color: '#16130F' },
    timeout: 900,
    retry: { enabled: true, max_count: 3 },
    modal: { confirm_close: true, escape: false, ondismiss: cb.onDismiss },
    handler: async (response) => {
      try { await confirm(response); }
      catch (e) {
        cb.onStatus(null);
        cb.onError(`${errorMessage(e, 'Payment verification failed.')} If money was deducted, do not pay again; it will show in your orders or be refunded automatically.`);
      }
    },
  });
  rzp.on('payment.failed', (failure) => {
    const f = failure as { error?: { description?: string } } | null;
    cb.onError(`${f?.error?.description ?? 'The payment did not go through.'} You can try again. If money was deducted, wait for the result before paying again.`);
  });
  rzp.open();
}
