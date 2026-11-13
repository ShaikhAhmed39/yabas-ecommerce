import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { callFunction, errorMessage } from '@/lib/api';
import { formatDate, label, money, paise } from '@/lib/orders';
import { ActionDialog, type DialogConfig } from '@/components/admin/ActionDialog';
import type { AdminRefund, AdminShipment } from '@/components/admin/adminTypes';

interface ReturnRecord {
  id: string;
  order_id: string;
  order_item_id: string;
  quantity?: number;
  reason: string;
  description: string;
  status: string;
  admin_note: string | null;
  rejection_reason: string | null;
  pickup_scheduled_at: string | null;
  refund_amount: number | null;
  created_at: string;
  photo_count: number;
  order: {
    order_number: string | null; total_amount: number; payment_status: string | null; delivered_at: string | null; customer_name: string | null;
    shipping_address_line1: string | null; shipping_address_line2: string | null; city: string | null; state: string | null; pincode: string | null;
    primary_phone: string | null; backup_phone: string | null;
  } | null;
  item: { product_title: string; unit_price: number | string; quantity: number } | null;
  shipment: AdminShipment | null;
  refund: AdminRefund | null;
}

interface ListResponse {
  requests: ReturnRecord[];
  total: number;
  page_size: number;
  counts: Record<string, number>;
}

type Filter = 'needs_action' | 'open' | 'all';
const TABS: Array<{ id: Filter; title: string }> = [
  { id: 'needs_action', title: 'Needs action' },
  { id: 'open', title: 'All open' },
  { id: 'all', title: 'History' },
];

const btn = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50';
const btnPrimary = `${btn} border-onyx-300 bg-onyx-300 text-white hover:bg-onyx-200`;
const btnGhost = `${btn} border-cream-400 bg-white text-onyx-300 hover:bg-cream-100`;
const btnDanger = `${btn} border-red-200 bg-white text-red-700 hover:bg-red-50`;

const STATUS_TONE: Record<string, string> = {
  requested: 'border-amber-200 bg-amber-50 text-amber-900',
  received: 'border-amber-200 bg-amber-50 text-amber-900',
  inspection_passed: 'border-amber-200 bg-amber-50 text-amber-900',
  refund_pending: 'border-amber-200 bg-amber-50 text-amber-900',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  inspection_failed: 'border-red-200 bg-red-50 text-red-800',
  cancelled: 'border-stone-200 bg-stone-100 text-stone-600',
};

export function ReturnsPanel() {
  const [filter, setFilter] = useState<Filter>('needs_action');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [photos, setPhotos] = useState<Record<string, { path: string; signed_url: string }[] | 'loading' | 'error'>>({});
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const my = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await callFunction<ListResponse>('manage-return-request', { action: 'list', status: filter, page, page_size: 15 });
      if (my === reqId.current) setData(res);
    } catch (e) {
      if (my === reqId.current) setError(errorMessage(e, 'Could not load return requests.'));
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (r: ReturnRecord, action: string, extra: Record<string, unknown> = {}, okText = 'Return updated.') => {
    setBusy(r.id);
    setError(null);
    setNotice(null);
    try {
      const res = await callFunction<{ pickup_error?: string | null }>('manage-return-request', { action, return_request_id: r.id, ...extra });
      setNotice(res.pickup_error ? `${okText} Pickup could not be booked automatically: ${res.pickup_error}. Use “Retry pickup”.` : okText);
      await load();
    } finally {
      setBusy(null);
    }
  };
  /** Same as act, but shows errors in the page banner (for buttons that open no dialog). */
  const actQuiet = (r: ReturnRecord, action: string, extra?: Record<string, unknown>, okText?: string) =>
    act(r, action, extra, okText).catch((e) => setError(errorMessage(e)));

  const confirmThen = (r: ReturnRecord, cfg: Omit<DialogConfig, 'onConfirm'>, action: string, extraFrom?: (v: string) => Record<string, unknown>, okText?: string) =>
    setDialog({ ...cfg, onConfirm: (v) => act(r, action, extraFrom ? extraFrom(v) : {}, okText) });

  const showPhotos = async (r: ReturnRecord) => {
    if (photos[r.id] && photos[r.id] !== 'error') {
      setPhotos((p) => { const { [r.id]: _drop, ...rest } = p; void _drop; return rest; });
      return;
    }
    setPhotos((p) => ({ ...p, [r.id]: 'loading' }));
    try {
      const res = await callFunction<{ photos: { path: string; signed_url: string }[] }>('manage-return-request', { action: 'get_photos', return_request_id: r.id });
      setPhotos((p) => ({ ...p, [r.id]: res.photos }));
    } catch {
      setPhotos((p) => ({ ...p, [r.id]: 'error' }));
    }
  };

  const actions = (r: ReturnRecord) => {
    const itemTotal = r.item ? Number(r.item.unit_price) * (r.quantity ?? r.item.quantity) : 0;
    const shipmentFailed = r.shipment?.status === 'failed';
    const out: React.ReactNode[] = [];
    const B = (key: string, text: string, onClick: () => void, cls = btnGhost) => (
      <button key={key} type="button" disabled={busy === r.id} onClick={onClick} className={cls}>{text}</button>
    );
    const reject = B('reject', 'Reject', () =>
      confirmThen(r, { title: 'Reject this return?', description: 'The customer sees this reason.', input: { label: 'Reason', type: 'textarea', required: true }, confirmLabel: 'Reject return', tone: 'danger' },
        'reject', (v) => ({ rejection_reason: v }), 'Return rejected.'), btnDanger);
    const cancel = B('cancel', 'Cancel', () =>
      confirmThen(r, { title: 'Cancel this return request?', confirmLabel: 'Cancel return', tone: 'danger' }, 'cancel', undefined, 'Return cancelled.'), btnDanger);

    switch (r.status) {
      case 'requested':
        out.push(B('approve', 'Approve & book pickup', () =>
          confirmThen(r, { title: 'Approve this return?', description: 'A courier pickup from the customer is booked automatically.', input: { label: 'Note to keep with the request (optional)', type: 'text' }, confirmLabel: 'Approve' },
            'approve', (v) => (v ? { admin_note: v } : {}), 'Return approved.'), btnPrimary), reject, cancel);
        break;
      case 'approved':
        out.push(B('retry', r.shipment ? 'Retry pickup' : 'Book pickup', () => void actQuiet(r, 'retry_pickup', {}, 'Pickup booked.'), btnPrimary),
          B('manual', 'Self-arranged pickup…', () =>
            confirmThen(r, { title: 'Record a self-arranged pickup', description: 'Use this only if you collect the item without the courier.', input: { label: 'Pickup date & time', type: 'text', required: true, defaultValue: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16) }, confirmLabel: 'Save pickup' },
              'schedule_pickup', (v) => ({ pickup_scheduled_at: new Date(v).toISOString() }), 'Pickup recorded.')),
          B('recv', 'Mark received', () => confirmThen(r, { title: 'Mark as received?', confirmLabel: 'Mark received' }, 'mark_received', undefined, 'Marked as received.')), reject, cancel);
        break;
      case 'pickup_scheduled':
        if (shipmentFailed) out.push(B('retry', 'Retry pickup', () => void actQuiet(r, 'retry_pickup', {}, 'Pickup booked.'), btnPrimary));
        out.push(B('recv', 'Mark received', () => confirmThen(r, { title: 'Mark as received?', description: 'Normally this happens automatically when the courier delivers it to you.', confirmLabel: 'Mark received' }, 'mark_received', undefined, 'Marked as received.'), btnPrimary));
        break;
      case 'received':
        out.push(B('pass', 'Inspection passed', () => confirmThen(r, { title: 'Inspection passed?', confirmLabel: 'Passed' }, 'inspection_passed', undefined, 'Inspection recorded.'), btnPrimary),
          B('fail', 'Inspection failed', () => confirmThen(r, { title: 'Inspection failed?', description: 'The customer will not be refunded. You can reject the return afterwards with a reason.', confirmLabel: 'Failed', tone: 'danger' }, 'inspection_failed', undefined, 'Inspection recorded.'), btnDanger));
        break;
      case 'inspection_failed':
        out.push(reject);
        break;
      case 'inspection_passed':
        out.push(B('refundpending', 'Approve refund amount…', () =>
          confirmThen(r, { title: 'Refund amount', description: `Maximum ${money(itemTotal)} (the price of the pieces being returned). Nothing is sent to the customer yet.`, input: { label: 'Amount (₹)', type: 'number', required: true, defaultValue: itemTotal.toFixed(2), min: 1, max: itemTotal, step: 0.01 }, confirmLabel: 'Save amount' },
            'mark_refund_pending', (v) => ({ refund_amount: Math.round(Number(v) * 100) / 100 }), 'Refund amount saved. You can now issue the refund.'), btnPrimary));
        break;
      case 'refund_pending':
      case 'refund_initiated':
        out.push(B('refund', r.status === 'refund_pending' ? `Issue refund ${money(r.refund_amount)}` : 'Check / retry refund', () =>
          confirmThen(r, { title: `Refund ${money(r.refund_amount)} to the customer?`, description: 'Money is sent to the customer\'s original payment method through Razorpay. This cannot be undone.', confirmLabel: 'Issue refund', tone: 'danger' },
            'issue_refund', undefined, 'Refund started.'), btnPrimary));
        break;
    }
    return out;
  };

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 15;
  const lastPage = Math.max(Math.ceil(total / pageSize) - 1, 0);

  return (
    <section className="space-y-4" aria-labelledby="returns-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="returns-title" className="font-display text-xl font-bold text-onyx-300">Returns</h2>
          <p className="mt-1 text-xs text-onyx-100">Approve, book the pickup, inspect and refund. Customers follow every step.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={btnGhost + ' !rounded-xl !px-4 !py-2 text-sm'}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div role="tablist" aria-label="Return filters" className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={filter === t.id} onClick={() => { setFilter(t.id); setPage(0); }}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${filter === t.id ? 'bg-onyx-300 text-white' : 'border border-gold-200/40 bg-cream-50 text-onyx-300 hover:bg-gold-50'}`}>
            {t.title}
            {data?.counts?.[t.id] !== undefined && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${filter === t.id ? 'bg-white/20' : 'bg-cream-300 text-stone-600'}`}>{data.counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span>{notice}</span></div>}

      {loading && !data ? (
        <div className="flex items-center justify-center rounded-2xl bg-cream-50 py-16 shadow-soft"><Loader2 className="h-7 w-7 animate-spin text-gold-500" /><span className="ml-3 text-sm text-onyx-200">Loading returns…</span></div>
      ) : data && data.requests.length === 0 ? (
        <div className="rounded-2xl border border-gold-200/20 bg-cream-50 py-16 text-center shadow-soft">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-onyx-100/40" />
          <p className="text-sm font-medium text-onyx-300">No returns here.</p>
        </div>
      ) : (
        <ul className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {data?.requests.map((r) => {
            const o = r.order;
            const address = [o?.shipping_address_line1, o?.shipping_address_line2, o?.city, o?.state, o?.pincode].filter(Boolean).join(', ');
            const ph = photos[r.id];
            return (
              <li key={r.id} className="overflow-hidden rounded-2xl border border-gold-200/20 bg-cream-50 shadow-soft">
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-stone-500">Return {r.id.slice(0, 8)}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status] ?? 'border-cream-400 bg-cream-100 text-stone-700'}`}>{label(r.status)}</span>
                    <span className="text-xs text-stone-500">Order <span className="font-mono">{o?.order_number ?? r.order_id.slice(0, 8)}</span> · requested {formatDate(r.created_at, true)}</span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="font-serif text-lg font-semibold text-onyx-300">{r.item?.product_title ?? 'Item'}</h3>
                      <p className="text-sm text-stone-600">{r.item ? `${money(r.item.unit_price)} each · customer bought ${r.item.quantity}` : ''}</p>
                      <p className="text-sm font-medium text-onyx-300">{r.item ? `Returning ${r.quantity ?? r.item.quantity} of ${r.item.quantity} piece${r.item.quantity === 1 ? '' : 's'}` : ''}</p>
                      <p className="mt-2 text-sm"><strong>{r.reason}</strong></p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{r.description}</p>
                      {r.rejection_reason && <p className="mt-2 text-sm text-red-700">Rejected: {r.rejection_reason}</p>}
                      {r.admin_note && <p className="mt-2 text-xs text-stone-500">Note: {r.admin_note}</p>}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{o?.customer_name}</p>
                      <p className="text-stone-600">{address}</p>
                      <p className="mt-1 text-stone-600">{o?.primary_phone && <a href={`tel:${o.primary_phone}`} className="underline">{o.primary_phone}</a>}{o?.backup_phone && <> · <a href={`tel:${o.backup_phone}`} className="underline">{o.backup_phone}</a></>}</p>
                      <p className="mt-1 text-xs text-stone-500">Delivered {formatDate(o?.delivered_at)}</p>
                    </div>
                  </div>

                  {r.shipment && (
                    <div className={`rounded-xl border p-3 text-sm ${r.shipment.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-cream-400 bg-white'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>Return pickup</strong> <span className="text-stone-600">{label(r.shipment.status)}</span>
                        {r.shipment.courier_name && <span>· {r.shipment.courier_name}</span>}
                        {r.shipment.awb_code && <span className="font-mono">· {r.shipment.awb_code}</span>}
                        {r.shipment.tracking_url && /^https:\/\//.test(r.shipment.tracking_url) && <a href={r.shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-700 underline">Track <ExternalLink size={11} /></a>}
                        {r.shipment.label_url && /^https:\/\//.test(r.shipment.label_url) && <a href={r.shipment.label_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-700 underline">Label</a>}
                      </div>
                      {r.shipment.error && <p className="mt-1 text-xs text-red-700"><AlertTriangle size={12} className="mr-1 inline" />{r.shipment.error}</p>}
                      {r.shipment.pickup_scheduled_at && <p className="mt-1 text-xs text-stone-500">Pickup {formatDate(r.shipment.pickup_scheduled_at, true)}</p>}
                    </div>
                  )}

                  {r.refund && (
                    <p className={`text-sm ${r.refund.status === 'failed' ? 'text-red-700' : 'text-stone-700'}`}>
                      Refund {paise(r.refund.amount_paise)} · <strong>{label(r.refund.status)}</strong>{r.refund.error ? ` · ${r.refund.error}` : ''}
                    </p>
                  )}
                  {!r.refund && r.refund_amount ? <p className="text-sm text-stone-700">Approved refund amount: {money(r.refund_amount)}</p> : null}

                  {r.photo_count > 0 && (
                    <div>
                      <button type="button" onClick={() => void showPhotos(r)} className={btnGhost}>
                        {ph === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} {ph && ph !== 'error' && ph !== 'loading' ? 'Hide photos' : `View photos (${r.photo_count})`}
                      </button>
                      {ph === 'error' && <p role="alert" className="mt-2 text-xs text-red-700">Could not load photos.</p>}
                      {Array.isArray(ph) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {ph.map((p) => (
                            <a key={p.path} href={p.signed_url} target="_blank" rel="noopener noreferrer"><img src={p.signed_url} alt="Customer return photo" loading="lazy" className="h-24 w-24 rounded-lg border border-cream-400 object-cover" /></a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {actions(r).length > 0 && <div className="flex flex-wrap gap-2 border-t border-gold-200/30 bg-white px-4 py-3 sm:px-5">{actions(r)}</div>}
              </li>
            );
          })}
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
