import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Package, RefreshCw, ShoppingBag, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { callFunction, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Stepper } from '@/components/orders/Stepper';
import { ShipmentCard } from '@/components/orders/ShipmentCard';
import { RewardsSection } from '@/components/orders/RewardsSection';
import {
  canCancel,
  forwardSteps,
  formatDate,
  isPaid,
  label,
  money,
  orderBanner,
  paise,
  returnMessage,
  returnSteps,
  returnWindowOpen,
  RETURN_WINDOW_DAYS,
  type Order,
  type OrderItem,
  type Refund,
  type ReturnRequest,
  type Shipment,
  type ShipmentEvent,
} from '@/lib/orders';

export type { Order, OrderItem };

interface MyOrdersProps {
  onBack: () => void;
  onRequestReturn: (order: Order, item: OrderItem) => void;
}

// Explicit column lists: customers are only granted the safe columns (no label URLs, no payment ids).
const ORDER_COLS =
  'id, order_number, user_id, total_amount, status, payment_method, payment_status, delivery_status, delivered_at, created_at, cancelled_at, cancel_reason, refunded_amount';
const ITEM_COLS = 'id, order_id, product_id, product_title, unit_price, quantity';
const RETURN_COLS =
  'id, order_id, order_item_id, status, reason, description, rejection_reason, pickup_scheduled_at, refund_amount, photo_paths, created_at';
const SHIPMENT_COLS =
  'id, order_id, return_request_id, direction, courier_name, awb_code, status, tracking_url, pickup_scheduled_at, etd, picked_up_at, delivered_at, last_event_at, created_at';
const EVENT_COLS = 'id, shipment_id, mapped_status, activity, location, event_time';
const REFUND_COLS = 'id, order_id, return_request_id, amount_paise, status, reason, created_at, processed_at';

const REFRESH_MS = 60_000;

function StatusPill({ value, tone = 'neutral' }: { value: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'bad'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-cream-400 bg-cream-100 text-stone-700';
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${cls}`}>{label(value)}</span>;
}

function paymentTone(o: Order): 'good' | 'warn' | 'bad' | 'neutral' {
  if (isPaid(o)) return 'good';
  if (o.payment_status === 'pending') return 'warn';
  if (o.payment_status === 'failed' || o.payment_status === 'cancelled') return 'bad';
  return 'neutral';
}

function BannerBox({ tone, text }: { tone: 'info' | 'warn' | 'bad' | 'good'; text: string }) {
  const map = {
    info: ['border-sky-200 bg-sky-50 text-sky-900', Info],
    warn: ['border-amber-200 bg-amber-50 text-amber-900', AlertTriangle],
    bad: ['border-red-200 bg-red-50 text-red-900', XCircle],
    good: ['border-emerald-200 bg-emerald-50 text-emerald-900', CheckCircle2],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div role="status" className={`flex gap-2.5 rounded-xl border p-3.5 text-sm ${cls}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

export function MyOrders({ onBack, onRequestReturn }: MyOrdersProps) {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null); // order id with the confirm panel open
  const [cancelReason, setCancelReason] = useState('Changed my mind');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const loadId = useRef(0);

  const loadOrders = useCallback(
    async (silent = false) => {
      if (!user) {
        setOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const myLoad = ++loadId.current;
      if (!silent) setError(null);

      try {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select(ORDER_COLS)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (orderError) throw orderError;

        const base = (orderData ?? []) as unknown as Omit<Order, 'items' | 'shipment' | 'return_shipments' | 'refunds'>[];
        if (base.length === 0) {
          if (myLoad === loadId.current) setOrders([]);
          return;
        }
        const ids = base.map((o) => o.id);

        const [items, returns, shipments, refunds] = await Promise.all([
          supabase.from('order_items').select(ITEM_COLS).in('order_id', ids),
          supabase.from('return_requests').select(RETURN_COLS).in('order_id', ids).order('created_at', { ascending: false }),
          supabase.from('shipments').select(SHIPMENT_COLS).in('order_id', ids).neq('status', 'cancelled').order('created_at', { ascending: false }),
          supabase.from('refunds').select(REFUND_COLS).in('order_id', ids).order('created_at', { ascending: false }),
        ]);
        if (items.error) throw items.error;
        if (returns.error) throw returns.error;
        // shipments/refunds failing must not hide the orders themselves
        const shipmentRows = (shipments.error ? [] : shipments.data ?? []) as unknown as Shipment[];
        const refundRows = (refunds.error ? [] : refunds.data ?? []) as unknown as Refund[];

        let eventRows: ShipmentEvent[] = [];
        if (shipmentRows.length) {
          const ev = await supabase
            .from('shipment_events')
            .select(EVENT_COLS)
            .in('shipment_id', shipmentRows.map((s) => s.id))
            .order('event_time', { ascending: false })
            .limit(300);
          eventRows = (ev.error ? [] : ev.data ?? []) as unknown as ShipmentEvent[];
        }
        const withEvents = shipmentRows.map((s) => ({ ...s, events: eventRows.filter((e) => e.shipment_id === s.id) }));

        const itemRows = (items.data ?? []) as unknown as OrderItem[];
        const returnRows = (returns.data ?? []) as unknown as ReturnRequest[];

        const built: Order[] = base.map((o) => ({
          ...o,
          shipment: withEvents.find((s) => s.order_id === o.id && s.direction === 'forward') ?? null,
          return_shipments: withEvents.filter((s) => s.order_id === o.id && s.direction === 'return'),
          refunds: refundRows.filter((r) => r.order_id === o.id),
          items: itemRows
            .filter((i) => i.order_id === o.id)
            .map((i) => ({
              ...i,
              // newest first, so the first match is the latest request for this item
              return_request: returnRows.find((r) => r.order_id === o.id && r.order_item_id === i.id) ?? null,
            })),
        }));
        if (myLoad === loadId.current) setOrders(built);
      } catch (e) {
        console.error('Could not load orders:', e);
        if (!silent && myLoad === loadId.current) setError('We could not load your orders. Please try again.');
      } finally {
        if (myLoad === loadId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    void loadOrders();
  }, [authLoading, loadOrders]);

  // Quietly refresh while something is still moving, and when the tab becomes visible again.
  const hasActive = useMemo(
    () =>
      orders.some(
        (o) =>
          o.status !== 'cancelled' &&
          (o.payment_status === 'pending' ||
            !['delivered', 'rto_delivered'].includes(o.delivery_status) ||
            o.items.some((i) => i.return_request && !['completed', 'rejected', 'cancelled', 'inspection_failed'].includes(i.return_request.status))),
      ),
    [orders],
  );
  useEffect(() => {
    if (!hasActive) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void loadOrders(true);
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [hasActive, loadOrders]);

  const refresh = async () => {
    setRefreshing(true);
    await loadOrders();
  };

  const confirmCancel = async (order: Order) => {
    setCancelBusy(true);
    setCancelError(null);
    try {
      const res = await callFunction<{ refund_status?: string | null }>('cancel-order', {
        order_id: order.id,
        reason: cancelReason,
      });
      setCancelling(null);
      setNotice(
        isPaid(order)
          ? `Order ${order.order_number ?? ''} cancelled. Your refund of ${money(order.total_amount)} has been started${
              res.refund_status === 'retry_needed' ? ' and will be sent shortly' : ''
            }.`
          : `Order ${order.order_number ?? ''} cancelled.`,
      );
      await loadOrders();
    } catch (e) {
      setCancelError(errorMessage(e));
    } finally {
      setCancelBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-cream-100 px-4 py-20 text-center" aria-busy="true">
        <RefreshCw className="mx-auto mb-4 animate-spin text-gold-600" size={28} />
        <p className="text-stone-600">Loading your orders…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-cream-100 px-4 py-20 text-center">
        <Package className="mx-auto mb-4 text-gold-600" size={40} />
        <h1 className="font-serif text-3xl text-onyx-300">Sign in to view your orders</h1>
        <p className="mt-2 text-stone-600">Your orders are available after you sign in.</p>
        <button onClick={onBack} className="mt-6 rounded-lg bg-onyx-300 px-5 py-3 text-white">
          Back to Store
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream-100 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <button onClick={onBack} className="mb-3 inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900">
              <ArrowLeft size={16} /> Back to Store
            </button>
            <h1 className="font-serif text-4xl text-onyx-300">My Orders</h1>
            <p className="mt-2 text-sm text-stone-600">Track your parcels, returns and refunds in one place.</p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-cream-400 bg-white px-4 py-2 text-sm hover:bg-cream-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <RewardsSection />

        {notice && (
          <div role="status" className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p>{notice}</p>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="font-semibold">×</button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button onClick={refresh} className="ml-2 font-semibold underline">Retry</button>
          </div>
        )}

        {!error && orders.length === 0 ? (
          <section className="rounded-2xl border border-cream-400 bg-white px-6 py-16 text-center">
            <ShoppingBag className="mx-auto mb-4 text-stone-300" size={48} />
            <h2 className="font-serif text-2xl text-onyx-300">No orders yet</h2>
            <p className="mt-2 text-stone-600">Your purchases will appear here after you place an order.</p>
            <button onClick={onBack} className="mt-6 rounded-lg bg-onyx-300 px-5 py-3 text-white">Explore Jewellery</button>
          </section>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const banner = orderBanner(order);
              const win = returnWindowOpen(order);
              const canReturn = isPaid(order) && order.delivery_status === 'delivered' && win.open;
              const showSteps = order.status !== 'cancelled' && order.payment_status !== 'failed';
              const refundedTotal = order.refunds.filter((r) => r.status === 'pending' || r.status === 'processed').reduce((s, r) => s + Number(r.amount_paise), 0);

              return (
                <article key={order.id} className="overflow-hidden rounded-2xl border border-cream-400 bg-white shadow-soft">
                  <header className="flex flex-wrap items-start justify-between gap-4 border-b border-cream-300 bg-cream-50 p-5">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-stone-500">Order</p>
                      <p className="mt-0.5 font-mono text-lg font-semibold text-onyx-300">{order.order_number ?? order.id.slice(0, 8)}</p>
                      <p className="mt-1 text-xs text-stone-500">Placed {formatDate(order.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill value={isPaid(order) ? (order.payment_status === 'refunded' ? 'refunded' : 'paid') : order.payment_status} tone={paymentTone(order)} />
                      <StatusPill
                        value={order.status === 'cancelled' ? 'cancelled' : order.delivery_status}
                        tone={order.delivery_status === 'delivered' ? 'good' : order.status === 'cancelled' || order.delivery_status === 'delivery_failed' ? 'bad' : 'neutral'}
                      />
                    </div>
                  </header>

                  <div className="space-y-5 p-5">
                    {banner && <BannerBox tone={banner.tone} text={banner.text} />}

                    {showSteps && <Stepper steps={forwardSteps(order)} ariaLabel={`Progress of order ${order.order_number ?? ''}`} />}

                    {order.shipment && order.shipment.awb_code && <ShipmentCard shipment={order.shipment} title="Delivery tracking" />}
                    {order.shipment && !order.shipment.awb_code && isPaid(order) && order.status !== 'cancelled' && (
                      <p className="text-sm text-stone-600">Your order is being packed. Tracking details will appear here once it is handed to the courier.</p>
                    )}

                    <ul className="divide-y divide-cream-300 rounded-xl border border-cream-300">
                      {order.items.map((item) => {
                        const rr = item.return_request;
                        const steps = rr ? returnSteps(rr.status) : null;
                        const retShipment = rr ? order.return_shipments.find((s) => s.return_request_id === rr.id) : undefined;
                        const retRefund = rr ? order.refunds.find((r) => r.return_request_id === rr.id) : undefined;
                        return (
                          <li key={item.id} className="p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-medium text-onyx-300">{item.product_title}</h3>
                                <p className="mt-0.5 text-sm text-stone-500">
                                  {money(item.unit_price)} × {item.quantity}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-stone-800">{money(Number(item.unit_price) * item.quantity)}</p>
                              {!rr && canReturn && (
                                <button
                                  onClick={() => onRequestReturn(order, item)}
                                  className="rounded-lg border border-gold-400 px-4 py-2 text-sm font-medium text-gold-800 transition hover:bg-gold-50"
                                >
                                  Request return
                                </button>
                              )}
                            </div>

                            {rr && (
                              <div className="mt-4 space-y-3 rounded-xl border border-gold-200 bg-gold-50/40 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-onyx-300">Return · {label(rr.status)}</p>
                                  <p className="text-xs text-stone-500">Requested {formatDate(rr.created_at)}</p>
                                </div>
                                {steps && <Stepper steps={steps} compact ariaLabel={`Progress of return for ${item.product_title}`} />}
                                <p className="text-sm text-stone-700">{returnMessage(rr, retRefund, retShipment)}</p>
                                {retShipment?.awb_code && <ShipmentCard shipment={retShipment} title="Return pickup" />}
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {order.items.length === 0 && <li className="p-4 text-sm text-stone-500">No order items were found.</li>}
                    </ul>

                    {canReturn && (
                      <p className="text-xs text-stone-500">
                        Returns are accepted for {RETURN_WINDOW_DAYS} days after delivery. {win.daysLeft} {win.daysLeft === 1 ? 'day' : 'days'} left for this order.
                      </p>
                    )}

                    {cancelling === order.id && (
                      <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                        <p className="text-sm font-semibold text-red-900">Cancel order {order.order_number}?</p>
                        <p className="mt-1 text-sm text-red-800">
                          {isPaid(order) ? `Your full payment of ${money(order.total_amount)} will be refunded to your original payment method.` : 'You have not been charged for this order.'}
                        </p>
                        <label className="mt-3 block text-xs font-medium text-stone-700" htmlFor={`reason-${order.id}`}>Reason</label>
                        <select
                          id={`reason-${order.id}`}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-cream-400 bg-white px-3 py-2 text-sm sm:w-72"
                        >
                          {['Changed my mind', 'Ordered by mistake', 'Found a better price', 'Delivery is too slow', 'Wrong address'].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        {cancelError && <p role="alert" className="mt-3 text-sm text-red-700">{cancelError}</p>}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => confirmCancel(order)}
                            disabled={cancelBusy}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                          >
                            {cancelBusy ? 'Cancelling…' : 'Yes, cancel order'}
                          </button>
                          <button
                            onClick={() => { setCancelling(null); setCancelError(null); }}
                            disabled={cancelBusy}
                            className="rounded-lg border border-cream-400 bg-white px-4 py-2 text-sm hover:bg-cream-50"
                          >
                            Keep order
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-300 bg-cream-50 p-5">
                    <div className="space-y-1 text-sm">
                      <p className="text-xs text-stone-500">Payment</p>
                      <p className="text-stone-800">{label(order.payment_method ?? 'online')}</p>
                      {refundedTotal > 0 && <p className="text-xs text-emerald-800">Refunded so far: {paise(refundedTotal)}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      {canCancel(order) && cancelling !== order.id && (
                        <button
                          onClick={() => { setCancelling(order.id); setCancelError(null); }}
                          className="text-sm font-medium text-red-700 underline-offset-2 hover:underline"
                        >
                          Cancel order
                        </button>
                      )}
                      <div className="text-right">
                        <p className="text-xs text-stone-500">Order total</p>
                        <p className="font-serif text-2xl text-onyx-300">{money(order.total_amount)}</p>
                      </div>
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
