import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/orders';
import { btnGhost, Card, Notice } from '@/components/admin/AdminUI';

type Health = Record<string, number | string | boolean | null>;
type Level = 'ok' | 'warn' | 'bad';
interface Row { label: string; value: string; level: Level; help: string; go?: string }

const HOUR = 3_600_000;
const n = (h: Health, k: string) => Number(h[k] ?? 0) || 0;
const ageHours = (iso: unknown) => (typeof iso === 'string' ? (Date.now() - +new Date(iso)) / HOUR : null);
const count = (v: number, bad = false): { value: string; level: Level } => ({ value: String(v), level: v === 0 ? 'ok' : bad ? 'bad' : 'warn' });

function buildRows(h: Health): { group: string; rows: Row[] }[] {
  const timerAge = ageHours(h.timer_last_run_at);
  const timer: Row = h.timer_installed === false || h.timer_installed === null
    ? { label: 'Safety timer (every 15 minutes)', value: 'Not installed', level: 'bad', help: 'Lost payments and abandoned checkouts are not cleaned up. Ask your developer to run the timer setup.' }
    : timerAge === null
      ? { label: 'Safety timer (every 15 minutes)', value: 'Installed, no run yet', level: 'warn', help: 'Wait 15 minutes and refresh this page.' }
      : timerAge > 1 || h.timer_last_status === 'failed'
        ? { label: 'Safety timer (every 15 minutes)', value: `Last run ${Math.round(timerAge * 60)} min ago (${String(h.timer_last_status)})`, level: 'bad', help: 'The timer has stopped or is failing. Tell your developer.' }
        : { label: 'Safety timer (every 15 minutes)', value: `Last run ${Math.max(Math.round(timerAge * 60), 0)} min ago`, level: 'ok', help: 'Working.' };

  const goldAge = ageHours(h.gold_rate_last_at);
  const gold: Row = goldAge === null
    ? { label: 'Gold rate', value: 'No rate saved yet', level: 'warn', help: 'The gold ticker has no data. Check the gold price setup.' }
    : goldAge > 48
      ? { label: 'Gold rate', value: `Last updated ${formatDate(String(h.gold_rate_last_at), true)}`, level: 'warn', help: 'The gold rate is more than 2 days old. It is only refreshed when the gold-price function is called.' }
      : { label: 'Gold rate', value: `Updated ${formatDate(String(h.gold_rate_last_at), true)}`, level: 'ok', help: 'Fresh.' };

  const c = (k: string, bad = false) => count(n(h, k), bad);
  return [
    { group: 'Needs you today', rows: [
      { label: 'Paid orders not shipped for 48 hours', ...c('paid_not_shipped_48h'), help: 'Create the shipment for these orders now.', go: 'orders' },
      { label: 'Orders marked "needs attention"', ...c('orders_needing_attention'), help: 'Open each one and read the red message.', go: 'orders' },
      { label: 'Return requests waiting more than 2 days', ...c('returns_waiting_2d'), help: 'Approve or reject them.', go: 'returns' },
    ] },
    { group: 'Money', rows: [
      { label: 'Failed refunds', ...c('refunds_failed', true), help: 'Open the return or order and use Check / retry refund.', go: 'returns' },
      { label: 'Refunds not finished after 3 days', ...c('refunds_stuck_3d', true), help: 'Check the refund in the Razorpay dashboard; tell your developer if it is not there.', go: 'returns' },
      { label: 'Unfinished checkouts still holding stock (over 2 hours)', ...c('stale_unpaid_holding_stock', true), help: 'The safety timer should clear these. If the number stays above 0, the timer is not working.' },
    ] },
    { group: 'Delivery', rows: [
      { label: 'Failed courier bookings', ...c('shipments_failed', true), help: 'Open the order and use Retry booking. Usual causes: wallet balance, address, pincode.', go: 'orders' },
      { label: 'Parcels with no courier update for 4 days', ...c('shipments_no_update_4d'), help: 'Open the order, click Track, then ask the courier.', go: 'orders' },
    ] },
    { group: 'Products', rows: [
      { label: 'Sold-out products', ...c('products_sold_out'), help: 'Restock or hide them.', go: 'products' },
      { label: 'Products with negative stock', ...c('products_negative_stock', true), help: 'This should never happen. Tell your developer and fix the stock number.', go: 'products' },
    ] },
    { group: 'Systems', rows: [
      timer, gold,
      { label: 'Last message from Razorpay', value: h.last_razorpay_event_at ? formatDate(String(h.last_razorpay_event_at), true) : 'None yet', level: h.last_razorpay_event_at ? 'ok' : 'warn', help: 'Shows when a payment last reached the website. "None yet" is normal before your first order.' },
      { label: 'Last message from the courier', value: h.last_courier_event_at ? formatDate(String(h.last_courier_event_at), true) : 'None yet', level: h.last_courier_event_at ? 'ok' : 'warn', help: 'Shows when a courier update last arrived. "None yet" is normal in test shipping mode.' },
      { label: 'Database size', value: `${n(h, 'db_size_mb')} MB`, level: n(h, 'db_size_mb') > 400 ? 'warn' : 'ok', help: 'The free Supabase plan includes 500 MB. If this nears 400 MB, plan an upgrade.' },
      { label: 'Database connections', value: String(n(h, 'db_connections')), level: n(h, 'db_connections') > 40 ? 'warn' : 'ok', help: 'Normally below 20.' },
    ] },
  ];
}

const ICON = { ok: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, warn: <TriangleAlert className="h-5 w-5 text-amber-600" />, bad: <XCircle className="h-5 w-5 text-red-600" /> };

export function HealthPanel({ go }: { go: (section: string) => void }) {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc('admin_system_health');
      if (error) throw error;
      setH(data as Health);
    } catch (e) { setErr(errorMessage(e, 'Could not load the health check.')); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  if (busy && !h) return <p className="flex items-center justify-center gap-2 py-16 text-ink/60"><Loader2 className="h-5 w-5 animate-spin" />Checking…</p>;
  if (err || !h) return <Notice kind="error">{err ?? 'No data.'}</Notice>;

  const groups = buildRows(h);
  const all = groups.flatMap((g) => g.rows);
  const bad = all.filter((r) => r.level === 'bad').length;
  const warn = all.filter((r) => r.level === 'warn').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/70">
          {bad > 0 ? <strong className="text-red-700">{bad} problem{bad === 1 ? '' : 's'} need fixing</strong> : warn > 0 ? <strong className="text-amber-700">{warn} thing{warn === 1 ? '' : 's'} to look at</strong> : <strong className="text-emerald-700">Everything looks healthy</strong>}
          {h.checked_at ? <span className="text-ink/55"> · checked {formatDate(String(h.checked_at), true)}</span> : null}
        </p>
        <button onClick={() => void load()} className={btnGhost}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Check again</button>
      </div>
      {groups.map((g) => (
        <Card key={g.group} title={g.group}>
          <ul className="divide-y divide-cream-300">
            {g.rows.map((r) => (
              <li key={r.label} className="flex items-start gap-3 py-3 text-sm">
                <span className="mt-0.5 flex-shrink-0">{ICON[r.level]}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap justify-between gap-x-3"><span className="font-medium">{r.label}</span><span className={r.level === 'ok' ? 'text-ink/65' : r.level === 'warn' ? 'text-amber-700' : 'font-medium text-red-700'}>{r.value}</span></p>
                  {r.level !== 'ok' && <p className="mt-0.5 text-ink/65">{r.help}{r.go ? <> <button onClick={() => go(r.go!)} className="text-onyx-300 underline">Open</button></> : null}</p>}
                </div>
              </li>))}
          </ul>
        </Card>))}
      <p className="text-xs text-ink/55">This page only reads information. It never changes an order, a payment or a product.</p>
    </div>
  );
}
