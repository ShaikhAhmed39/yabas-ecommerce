import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Loader2, PackageCheck,
  RefreshCw, Search, Truck,
} from 'lucide-react';
import { ApiError, callFunction, errorMessage } from '@/lib/api';
import { formatDate, isPaid, label, money, paise } from '@/lib/orders';
import { ActionDialog, type DialogConfig } from '@/components/admin/ActionDialog';
import type { AdminOrder, AdminShipment, OrderEvent } from '@/components/admin/adminTypes';

type View = 'all' | 'to_ship' | 'in_transit' | 'delivered' | 'attention' | 'unpaid' | 'returns' | 'cancelled';
const TABS: Array<{ id: View; title: string }> = [
  { id: 'to_ship', title: 'To ship' },
  { id: 'in_transit', title: 'In transit' },
  { id: 'attention', title: 'Needs attention' },
  { id: 'returns', title: 'Returns open' },
  { id: 'delivered', title: 'Delivered' },
  { id: 'unpaid', title: 'Unpaid' },
  { id: 'cancelled', title: 'Cancelled' },
  { id: 'all', title: 'All' },
];

interface ListResponse {
  orders: AdminOrder[];
  total: number;
  counts: Record<string, number>;
  mode: 'live' | 'mock';
  page_size: number;
}

const MANUAL_NEXT: Record<string, string[]> = {
  pending: ['processing'],
  processing: ['shipped', 'out_for_delivery', 'delivered'],
  shipped: ['out_for_delivery', 'delivered', 'delivery_failed'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivery_failed: ['shipped', 'out_for_delivery', 'delivered', 'rto_initiated'],
  rto_initiated: ['rto_delivered'],
};

const SIMULATE = ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'undelivered', 'rto_initiated', 'rto_delivered'];
const PRE_PICKUP = ['creating', 'created', 'awb_assigned', 'pickup_scheduled'];

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = {
    neutral: 'border-cream-400 bg-cream-100 text-stone-700',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-800',
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

const btn = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50';
const btnPrimary = `${btn} border-onyx-300 bg-onyx-300 text-white hover:bg-onyx-200`;
const btnGhost = `${btn} border-cream-400 bg-white text-onyx-300 hover:bg-cream-100`;
const btnDanger = `${btn} border-red-200 bg-white text-red-700 hover:bg-red-50`;

export function OrdersPanel() {
  const [view, setView] = useState<View>('to_ship');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, OrderEvent[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await callFunction<ListResponse>('admin-list-orders', { view, search, page, page_size: 20 });
      if (my === reqId.current) setData(res);
    } catch (e) {
      if (my === reqId.current) setError(errorMessage(e, 'Could not load orders.'));
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [view, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadEvents = async (orderId: string) => {
    try {
      const res = await callFunction<{ events: OrderEvent[] }>('admin-list-orders', { events_for_order: orderId });
      setEvents((cur) => ({ ...cur, [orderId]: res.events }));
    } catch {
      setEvents((cur) => ({ ...cur, [orderId]: [] }));
    }
  };

  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && !events[next]) void loadEvents(next);
  };

  /** Runs one server action with a busy flag, a success notice and a refresh. Throws so dialogs can show the error. */
  const run = async (key: string, fn: () => Promise<string>, opts: { silentError?: boolean } = {}) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await load();
      setEvents({});
    } catch (e) {
      if (!opts.silentError) setError(errorMessage(e));
      throw e;
    } finally {
      setBusy(null);
    }
  };
  const runQuiet = (key: string, fn: () => Promise<string>) => run(key, fn, {}).catch(() => undefined);

  const createShipment = (o: AdminOrder, retry: boolean) =>
    runQuiet(`ship-${o.id}`, async () => {
      const r = await callFunction<{ shipment: AdminShipment; alreadyBooked?: boolean }>('admin-shipments', { action: retry ? 'retry' : 'create', order_id: o.id });
      return r.alreadyBooked ? 'This order already has a shipment.' : `Shipment booked${r.shipment.awb_code ? ` · AWB ${r.shipment.awb_code}` : ''}.`;
    });

  const shipmentAction = (s: AdminShipment, action: 'refresh' | 'cancel_shipment' | 'label', okText: string) =>
    runQuiet(`${action}-${s.id}`, async () => {
      const r = await callFunction<{ label_url?: string }>('admin-shipments', { action, shipment_id: s.id });
      if (action === 'label' && r.label_url) window.open(r.label_url, '_blank', 'noopener,noreferrer');
      return okText;
    });

  const simulate = (s: AdminShipment, status: string) =>
    runQuiet(`sim-${s.id}`, async () => {
      await callFunction('admin-shipments', { action: 'simulate', shipment_id: s.id, status });
      return `Simulated: ${label(status)}.`;
    });

  const manualStatus = (o: AdminOrder, next: string, override = false) =>
    runQuiet(`manual-${o.id}`, async () => {
      try {
        await callFunction('admin-update-delivery', { order_id: o.id, delivery_status: next, expected_delivery_status: o.delivery_status, override });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'courier_tracked') {
          setDialog({
            title: 'Override courier tracking?',
            description: 'This parcel is tracked by the courier, which updates the status automatically. Only override if you are sure (for example you delivered it by hand).',
            confirmLabel: 'Override status',
            tone: 'danger',
            onConfirm: async () => {
              await callFunction('admin-update-delivery', { order_id: o.id, delivery_status: next, expected_delivery_status: o.delivery_status, override: true });
              setNotice(`Status set to ${label(next)}.`);
              await load();
            },
          });
          return '';
        }
        throw e;
      }
      return `Status set to ${label(next)}.`;
    });

  const askCancel = (o: AdminOrder) =>
    setDialog({
      title: `Cancel order ${o.order_number ?? ''}?`,
      description: isPaid(o)
        ? `This stops the parcel (if not picked up), restocks the items and refunds ${money(o.total_amount)} to the customer. It cannot be undone.`
        : 'This releases the reserved stock. The customer has not paid.',
      input: { label: 'Reason (shown to the customer)', type: 'textarea', required: true, defaultValue: 'Cancelled by seller' },
      confirmLabel: 'Cancel order',
      tone: 'danger',
      onConfirm: (reason) =>
        run(`cancel-${o.id}`, async () => {
          const r = await callFunction<{ refund_status: string | null }>('admin-shipments', { action: 'cancel_order', order_id: o.id, reason });
          return r.refund_status === 'retry_needed'
            ? 'Order cancelled. The refund will be retried automatically; check the Refunds list.'
            : `Order cancelled${r.refund_status ? ` · refund ${r.refund_status}` : ''}.`;
        }, { silentError: true }),
    });

  const askRefund = (o: AdminOrder) => {
    const remaining = Math.max(Number(o.total_amount) - Number(o.refunded_amount ?? 0), 0);
    setDialog({
      title: `Refund order ${o.order_number ?? ''}`,
      description: `Refundable balance: ${money(remaining)}. The refund goes back to the customer's original payment method.`,
      input: { label: 'Amount (₹)', type: 'number', required: true, defaultValue: remaining.toFixed(2), min: 1, max: remaining, step: 0.01 },
      confirmLabel: 'Issue refund',
      tone: 'danger',
      onConfirm: (amount) =>
        run(`refund-${o.id}`, async () => {
          await callFunction('admin-shipments', { action: 'refund_order', order_id: o.id, amount: Number(amount) });
          return `Refund of ${money(amount)} started.`;
        }, { silentError: true }),
    });
  };

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 20;
  const lastPage = Math.max(Math.ceil(total / pageSize) - 1, 0);

  return (
    <section className="space-y-4" aria-labelledby="orders-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="orders-title" className="font-display text-xl font-bold text-onyx-300">Orders</h2>
          <p className="mt-1 text-xs text-onyx-100">Ship, track, cancel and refund. Customers see every change instantly.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
            <input
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Order no., name, phone, AWB"
              aria-label="Search orders"
              className="w-60 rounded-xl border border-gold-200/40 bg-cream-50 py-2 pl-8 pr-3 text-sm focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200"
            />
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className={btnGhost + ' !rounded-xl !px-4 !py-2 text-sm'}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {data?.mode === 'mock' && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p><strong>Test shipping mode.</strong> Shipments are simulated and no real courier is booked. Set <code>SHIPPING_MODE=live</code> with your Shiprocket API user to go live.</p>
        </div>
      )}

      <div role="tablist" aria-label="Order filters" className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((t) => {
          const n = data?.counts?.[t.id];
          const hot = t.id === 'attention' && (n ?? 0) > 0;
          return (
            <button
              key={t.id} role="tab" aria-selected={view === t.id}
              onClick={() => { setView(t.id); setPage(0); setOpen(null); }}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${
                view === t.id ? 'bg-onyx-300 text-white' : 'border border-gold-200/40 bg-cream-50 text-onyx-300 hover:bg-gold-50'
              }`}
            >
              {t.title}
              {n !== undefined && (
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${hot ? 'bg-red-600 text-white' : view === t.id ? 'bg-white/20' : 'bg-cream-300 text-stone-600'}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span>{notice}</span></div>}

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-2xl bg-cream-50 py-16 shadow-soft"><Loader2 className="h-7 w-7 animate-spin text-gold-500" /><span className="ml-3 text-sm text-onyx-200">Loading orders…</span></div>
      ) : data && data.orders.length === 0 ? (
        <div className="rounded-2xl border border-gold-200/20 bg-cream-50 py-16 text-center shadow-soft">
          <PackageCheck className="mx-auto mb-3 h-10 w-10 text-onyx-100/40" />
          <p className="text-sm font-medium text-onyx-300">{search ? 'No orders match your search.' : 'Nothing here right now.'}</p>
        </div>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {data?.orders.map((o) => (
            <OrderRow
              key={o.id} order={o} mode={data.mode} expanded={open === o.id} onToggle={() => toggle(o.id)}
              events={events[o.id]} busy={busy}
              onCreate={(retry) => createShipment(o, retry)}
              onShipmentAction={shipmentAction} onSimulate={simulate} onManual={(next) => manualStatus(o, next)}
              onCancel={() => askCancel(o)} onRefund={() => askRefund(o)}
            />
          ))}
        </ul>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-onyx-100">
          <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} className={btnGhost}><ChevronLeft size={14} /> Prev</button>
            <button disabled={page >= lastPage || loading} onClick={() => setPage((p) => p + 1)} className={btnGhost}>Next <ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      <ActionDialog config={dialog} onClose={() => setDialog(null)} />
    </section>
  );
}

function OrderRow(props: {
  order: AdminOrder;
  mode: 'live' | 'mock';
  expanded: boolean;
  onToggle: () => void;
  events?: OrderEvent[];
  busy: string | null;
  onCreate: (retry: boolean) => void;
  onShipmentAction: (s: AdminShipment, a: 'refresh' | 'cancel_shipment' | 'label', ok: string) => void;
  onSimulate: (s: AdminShipment, status: string) => void;
  onManual: (next: string) => void;
  onCancel: () => void;
  onRefund: () => void;
}) {
  const { order: o, mode, expanded, busy } = props;
  const forward = o.shipments.filter((s) => s.direction === 'forward' && s.status !== 'cancelled');
  const ship = forward[0];
  const cancelled = o.status === 'cancelled';
  const readyToShip = isPaid(o) && !cancelled && o.inventory_status === 'committed' && ['pending', 'processing'].includes(o.delivery_status) && (!ship || ship.status === 'failed');
  const refundable = Math.max(Number(o.total_amount) - Number(o.refunded_amount ?? 0), 0);
  const canCancel = !cancelled && (isPaid(o) || o.payment_status === 'pending') && ['pending', 'processing'].includes(o.delivery_status) && !(ship && !PRE_PICKUP.includes(ship.status) && ship.status !== 'failed');
  const address = [o.shipping_address_line1, o.shipping_address_line2, o.city, o.state, o.pincode].filter(Boolean).join(', ');
  const manualOptions = MANUAL_NEXT[o.delivery_status] ?? [];
  const isBusy = (k: string) => busy === k;

  return (
    <li className={`overflow-hidden rounded-2xl border bg-cream-50 shadow-soft ${o.needs_attention ? 'border-red-300' : 'border-gold-200/20'}`}>
      <button type="button" onClick={props.onToggle} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 p-4 text-left sm:p-5">
        <div className="min-w-[8rem]">
          <p className="font-mono text-sm font-semibold text-onyx-300">{o.order_number ?? o.id.slice(0, 8)}</p>
          <p className="text-xs text-stone-500">{formatDate(o.created_at, true)}</p>
        </div>
        <div className="min-w-[8rem] flex-1">
          <p className="text-sm font-medium text-onyx-300">{o.customer_name ?? 'Customer'}</p>
          <p className="text-xs text-stone-500">{o.city}{o.pincode ? ` · ${o.pincode}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={isPaid(o) ? 'good' : o.payment_status === 'pending' ? 'warn' : 'bad'}>{label(o.payment_status)}</Pill>
          <Pill tone={o.delivery_status === 'delivered' ? 'good' : cancelled || o.delivery_status === 'delivery_failed' ? 'bad' : 'neutral'}>{label(cancelled ? 'cancelled' : o.delivery_status)}</Pill>
          {ship && <Pill tone={ship.status === 'failed' ? 'bad' : 'neutral'}><Truck size={10} className="mr-1 inline" aria-hidden />{label(ship.status)}</Pill>}
          {o.returns.some((r) => !['completed', 'rejected', 'cancelled'].includes(r.status)) && <Pill tone="warn">Return open</Pill>}
        </div>
        <p className="ml-auto font-serif text-lg text-onyx-300">{money(o.total_amount)}</p>
        <ChevronDown size={18} className={`text-stone-400 transition ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {o.needs_attention && (
        <p className="border-t border-red-200 bg-red-50 px-5 py-2 text-xs text-red-800"><AlertTriangle size={12} className="mr-1 inline" aria-hidden />{o.attention_reason ?? 'Needs your attention'}</p>
      )}

      {expanded && (
        <div className="space-y-5 border-t border-gold-200/30 bg-white p-4 sm:p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Items</h3>
              <ul className="space-y-1 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3"><span>{i.product_title} × {i.quantity}</span><span className="text-stone-600">{money(Number(i.unit_price) * i.quantity)}</span></li>
                ))}
              </ul>
            </div>
            <div className="text-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Deliver to</h3>
              <p>{o.customer_name}</p>
              <p className="text-stone-600">{address}</p>
              <p className="mt-1 text-stone-600">
                <a href={`tel:${o.primary_phone}`} className="underline">{o.primary_phone}</a>
                {o.backup_phone && <> · <a href={`tel:${o.backup_phone}`} className="underline">{o.backup_phone}</a></>}
              </p>
            </div>
          </div>

          <div className="grid gap-x-8 gap-y-1 text-xs text-stone-600 sm:grid-cols-2">
            <p>Paid {o.paid_at ? formatDate(o.paid_at, true) : '—'} · Razorpay order <span className="font-mono">{o.razorpay_order_id ?? '—'}</span></p>
            <p>Payment <span className="font-mono">{o.razorpay_payment_id ?? '—'}</span></p>
            {cancelled && <p className="sm:col-span-2 text-red-700">Cancelled {formatDate(o.cancelled_at, true)}{o.cancel_reason ? ` · ${o.cancel_reason}` : ''}</p>}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Shipping</h3>
            {!ship && !readyToShip && <p className="text-sm text-stone-500">No shipment for this order.</p>}
            {readyToShip && (
              <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4">
                {ship?.status === 'failed' && <p className="mb-2 text-sm text-red-700"><strong>Booking failed:</strong> {ship.error ?? 'Unknown error'}</p>}
                <p className="mb-3 text-sm text-stone-700">{ship ? 'Fix the problem above (address, courier wallet balance, pickup address) and retry.' : 'Books the courier, assigns an AWB and schedules the pickup in one step.'}</p>
                <button type="button" disabled={isBusy(`ship-${o.id}`)} onClick={() => props.onCreate(!!ship)} className={btnPrimary}>
                  {isBusy(`ship-${o.id}`) ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />} {ship ? 'Retry booking' : 'Create shipment'}
                </button>
              </div>
            )}
            {ship && ship.status !== 'failed' && (
              <div className="space-y-3 rounded-xl border border-cream-400 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone="neutral">{label(ship.status)}</Pill>
                  <span className="font-medium">{ship.courier_name ?? 'Courier pending'}</span>
                  {ship.awb_code && <span className="font-mono text-stone-700">{ship.awb_code}</span>}
                  {ship.tracking_url && /^https:\/\//.test(ship.tracking_url) && <a href={ship.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-700 underline">Track <ExternalLink size={11} aria-hidden /></a>}
                </div>
                <p className="text-xs text-stone-500">
                  {ship.pickup_scheduled_at && <>Pickup {formatDate(ship.pickup_scheduled_at, true)} · </>}
                  {ship.etd && <>ETA {formatDate(ship.etd)} · </>}
                  Last update {ship.last_event_at ? formatDate(ship.last_event_at, true) : 'none yet'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!ship.awb_code || isBusy(`refresh-${ship.id}`)} onClick={() => props.onShipmentAction(ship, 'refresh', 'Tracking refreshed.')} className={btnGhost}>
                    <RefreshCw size={12} className={isBusy(`refresh-${ship.id}`) ? 'animate-spin' : ''} /> Refresh tracking
                  </button>
                  <button type="button" disabled={isBusy(`label-${ship.id}`)} onClick={() => ship.label_url ? window.open(ship.label_url, '_blank', 'noopener,noreferrer') : props.onShipmentAction(ship, 'label', 'Label ready.')} className={btnGhost}>
                    Print label
                  </button>
                  {PRE_PICKUP.includes(ship.status) && (
                    <button type="button" disabled={isBusy(`cancel_shipment-${ship.id}`)} onClick={() => props.onShipmentAction(ship, 'cancel_shipment', 'Shipment cancelled.')} className={btnDanger}>Cancel shipment</button>
                  )}
                  {mode === 'mock' && ship.awb_code && (
                    <select aria-label="Simulate courier update" value="" onChange={(e) => e.target.value && props.onSimulate(ship, e.target.value)} className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs">
                      <option value="">Simulate courier…</option>
                      {SIMULATE.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>

          {o.returns.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Returns</h3>
              <ul className="space-y-1 text-sm">
                {o.returns.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2"><Pill tone="warn">{label(r.status)}</Pill><span className="text-stone-600">{r.reason}</span>{r.refund_amount ? <span className="text-xs text-stone-500">· refund {money(r.refund_amount)}</span> : null}</li>
                ))}
                <li className="text-xs text-stone-500">Manage returns in the Returns tab.</li>
              </ul>
            </div>
          )}

          {o.refunds.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Refunds</h3>
              <ul className="space-y-1 text-sm">
                {o.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <Pill tone={r.status === 'processed' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{label(r.status)}</Pill>
                    <span>{paise(r.amount_paise)}</span><span className="text-xs text-stone-500">{label(r.reason)} · {formatDate(r.created_at, true)}</span>
                    {r.error && <span className="text-xs text-red-700">{r.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-cream-300 pt-4">
            {canCancel && <button type="button" onClick={props.onCancel} className={btnDanger}>Cancel order{isPaid(o) ? ' & refund' : ''}</button>}
            {isPaid(o) && refundable >= 1 && <button type="button" onClick={props.onRefund} className={btnGhost}>Issue refund…</button>}
            {manualOptions.length > 0 && !cancelled && isPaid(o) && (
              <details className="ml-auto text-xs">
                <summary className="cursor-pointer text-stone-500">Manual status override</summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {manualOptions.map((n) => <button key={n} type="button" disabled={isBusy(`manual-${o.id}`)} onClick={() => props.onManual(n)} className={btnGhost}>{label(n)}</button>)}
                </div>
              </details>
            )}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-500">Activity log</summary>
            {props.events === undefined ? (
              <p className="mt-2 text-xs text-stone-500">Loading…</p>
            ) : props.events.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">No events recorded.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {props.events.map((e) => (
                  <li key={e.id} className="text-xs text-stone-700">
                    <span className="text-stone-400">{formatDate(e.created_at, true)}</span> · <span className="font-medium">{label(e.event_type)}</span>
                    {(e.from_value || e.to_value) && <span> ({e.from_value ?? '—'} → {e.to_value ?? '—'})</span>}
                    <span className="text-stone-400"> · {e.actor_type}</span>{e.note ? ` · ${e.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      )}
    </li>
  );
}
