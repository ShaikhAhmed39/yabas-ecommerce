// Types and display helpers shared by the customer "My Orders" page and the admin screens.
// Display logic only. Every rule (who can cancel, return, refund...) is enforced again on the server.

export const RETURN_WINDOW_DAYS = Number(import.meta.env.VITE_RETURN_WINDOW_DAYS) || 7;

export const money = (amount: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(
    Number(amount) || 0,
  );

export const paise = (amountPaise: number | string) => money(Number(amountPaise) / 100);

export const label = (value: string | null | undefined) =>
  (value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const formatDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
};

export interface ShipmentEvent {
  id: string;
  shipment_id: string;
  mapped_status: string | null;
  activity: string | null;
  location: string | null;
  event_time: string;
}

export interface Shipment {
  id: string;
  order_id: string;
  return_request_id: string | null;
  direction: 'forward' | 'return';
  status: string;
  courier_name: string | null;
  awb_code: string | null;
  tracking_url: string | null;
  pickup_scheduled_at: string | null;
  etd: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  last_event_at: string | null;
  created_at: string;
  events?: ShipmentEvent[];
}

export interface Refund {
  id: string;
  order_id: string;
  return_request_id: string | null;
  amount_paise: number | string;
  status: 'creating' | 'pending' | 'processed' | 'failed';
  reason: string;
  created_at: string;
  processed_at: string | null;
}

export interface ReturnRequest {
  id: string;
  order_id: string;
  order_item_id: string;
  status: string;
  reason: string;
  description: string;
  rejection_reason: string | null;
  pickup_scheduled_at: string | null;
  refund_amount: number | null;
  photo_paths: string[];
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string;
  unit_price: number | string;
  quantity: number;
  return_request?: ReturnRequest | null;
}

export interface Order {
  id: string;
  order_number: string | null;
  user_id: string | null;
  total_amount: number | string;
  status: string | null;
  payment_method: string | null;
  payment_status: string;
  delivery_status: string;
  delivered_at: string | null;
  created_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  refunded_amount: number | string | null;
  items: OrderItem[];
  shipment: Shipment | null;
  return_shipments: Shipment[];
  refunds: Refund[];
}

export const isPaid = (o: Pick<Order, 'payment_status'>) =>
  ['paid', 'captured', 'refunded'].includes((o.payment_status ?? '').toLowerCase());

// ---- forward progress ----------------------------------------------------------------------------
export interface Step {
  key: string;
  title: string;
  state: 'done' | 'current' | 'todo';
}

const FORWARD = ['placed', 'paid', 'packed', 'shipped', 'out_for_delivery', 'delivered'] as const;
const FORWARD_TITLES: Record<(typeof FORWARD)[number], string> = {
  placed: 'Order placed',
  paid: 'Payment confirmed',
  packed: 'Being prepared',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

function forwardIndex(o: Order): number {
  if (o.delivery_status === 'delivered') return 5;
  if (o.delivery_status === 'out_for_delivery') return 4;
  if (['shipped', 'delivery_failed', 'rto_initiated', 'rto_delivered'].includes(o.delivery_status)) return 3;
  if (isPaid(o)) return o.delivery_status === 'processing' ? 2 : 1;
  return 0;
}

export function forwardSteps(o: Order): Step[] {
  const at = forwardIndex(o);
  return FORWARD.map((key, i) => ({
    key,
    title: FORWARD_TITLES[key],
    state: i < at || (i === at && key === 'delivered') ? 'done' : i === at ? 'current' : 'todo',
  }));
}

export interface Banner {
  tone: 'info' | 'warn' | 'bad' | 'good';
  text: string;
}

/** The one sentence a customer needs to see at the top of an order. */
export function orderBanner(o: Order): Banner | null {
  if (o.status === 'cancelled') {
    const refund = o.refunds.find((r) => r.status === 'processed' || r.status === 'pending');
    return {
      tone: 'bad',
      text:
        'This order was cancelled.' +
        (o.cancel_reason ? ` Reason: ${o.cancel_reason}.` : '') +
        (refund
          ? refund.status === 'processed'
            ? ' Your refund has been processed.'
            : ' Your refund is on its way (usually 5–7 working days).'
          : isPaid(o)
            ? ' Your refund will be started shortly.'
            : ''),
    };
  }
  if (o.payment_status === 'pending') {
    return { tone: 'warn', text: 'Waiting for your payment. If you already paid, this updates within a few minutes. Unpaid orders expire automatically.' };
  }
  if (o.payment_status === 'failed') return { tone: 'bad', text: 'Your payment did not go through. You have not been charged for this order.' };
  if (o.payment_status === 'refunded') return { tone: 'info', text: 'This order has been fully refunded.' };
  if (o.delivery_status === 'delivery_failed') {
    return { tone: 'warn', text: 'The courier could not deliver your parcel. We are in touch to arrange another attempt.' };
  }
  if (o.delivery_status === 'rto_initiated' || o.delivery_status === 'rto_delivered') {
    return { tone: 'warn', text: 'Your parcel could not be delivered and is returning to us. We will contact you about a refund or re-shipping.' };
  }
  return null;
}

export const canCancel = (o: Order) =>
  o.status !== 'cancelled' &&
  ['pending', 'processing'].includes(o.delivery_status) &&
  (isPaid(o) || o.payment_status === 'pending') &&
  !(o.shipment && ['picked_up', 'in_transit', 'out_for_delivery'].includes(o.shipment.status));

export function returnWindowOpen(o: Order, now = Date.now()): { open: boolean; daysLeft: number } {
  if (!o.delivered_at) return { open: false, daysLeft: 0 };
  const delivered = new Date(o.delivered_at).getTime();
  if (!Number.isFinite(delivered) || delivered > now) return { open: false, daysLeft: 0 };
  const left = delivered + RETURN_WINDOW_DAYS * 86_400_000 - now;
  return { open: left > 0, daysLeft: Math.max(Math.ceil(left / 86_400_000), 0) };
}

// ---- returns -------------------------------------------------------------------------------------
const RETURN_STEPS = [
  ['requested', 'Requested'],
  ['approved', 'Approved'],
  ['pickup_scheduled', 'Pickup scheduled'],
  ['received', 'Received'],
  ['inspection_passed', 'Checked'],
  ['refund', 'Refund'],
  ['completed', 'Done'],
] as const;

function returnIndex(status: string): number {
  switch (status) {
    case 'requested': return 0;
    case 'approved': return 1;
    case 'pickup_scheduled': return 2;
    case 'received': return 3;
    case 'inspection_passed': return 4;
    case 'refund_pending':
    case 'refund_initiated': return 5;
    case 'completed': return 6;
    default: return -1;
  }
}

export function returnSteps(status: string): Step[] | null {
  const at = returnIndex(status);
  if (at < 0) return null; // rejected / cancelled / inspection_failed: shown as a message instead
  return RETURN_STEPS.map(([key, title], i) => ({
    key,
    title,
    state: i < at || (i === at && key === 'completed') ? 'done' : i === at ? 'current' : 'todo',
  }));
}

export function returnMessage(r: ReturnRequest, refund: Refund | undefined, shipment: Shipment | null | undefined): string {
  switch (r.status) {
    case 'requested': return 'We are reviewing your request. This usually takes up to 1 working day.';
    case 'approved': return shipment?.awb_code
      ? 'Approved. A courier will collect the item from your address.'
      : 'Approved. We are arranging a pickup and will update you here.';
    case 'pickup_scheduled': return r.pickup_scheduled_at
      ? `Pickup scheduled for ${formatDate(r.pickup_scheduled_at)}. Please keep the item packed with its tags and box.`
      : 'Pickup scheduled. Please keep the item packed with its tags and box.';
    case 'received': return 'We received your item and will inspect it shortly.';
    case 'inspection_passed': return 'Your item passed inspection. Your refund is being prepared.';
    case 'refund_pending': return 'Your refund is approved and will be started shortly.';
    case 'refund_initiated': return `Refund of ${refund ? paise(refund.amount_paise) : money(r.refund_amount)} started. Banks usually take 5–7 working days to show it.`;
    case 'completed': return `Refund of ${refund ? paise(refund.amount_paise) : money(r.refund_amount)} has been processed to your original payment method.`;
    case 'inspection_failed': return 'The item did not pass our inspection, so a refund could not be approved. Please contact us if you would like to discuss it.';
    case 'rejected': return `Your return request was not approved${r.rejection_reason ? `: ${r.rejection_reason}` : '.'}`;
    case 'cancelled': return 'This return request was cancelled.';
    default: return label(r.status);
  }
}
