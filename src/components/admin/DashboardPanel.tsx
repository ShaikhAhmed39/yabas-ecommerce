import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { formatDate, label, money } from '@/lib/orders';
import { formatINR } from '@/utils/format';
import { loadOrders, num, paidStatus, type OrdersPage } from '@/components/admin/adminData';
import { btnGhost, Card, Notice, Stat } from '@/components/admin/AdminUI';
import type { AdminOrder } from '@/components/admin/adminTypes';

const DAY = 86_400_000;

export function DashboardPanel({ go }: { go: (section: string) => void }) {
  const [data, setData] = useState<OrdersPage | null>(null);
  const [lowStock, setLowStock] = useState<{ id: string; title: string; stock: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const [o, p] = await Promise.all([loadOrders(500), supabase.from('products').select('id,title,stock').lte('stock', 5).order('stock').limit(8)]);
      setData(o); setLowStock((p.data ?? []) as typeof lowStock);
    } catch (e) { setErr(errorMessage(e, 'Could not load the dashboard.')); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);

  if (busy && !data) return <p className="flex items-center justify-center gap-2 py-16 text-ink/60"><Loader2 className="h-5 w-5 animate-spin" />Loading…</p>;
  if (err || !data) return <Notice kind="error">{err ?? 'No data.'}</Notice>;

  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const paid = data.orders.filter(paidStatus);
  const sum = (list: AdminOrder[]) => list.reduce((n, o) => n + num(o.total_amount) - num(o.refunded_amount), 0);
  const today = paid.filter((o) => +new Date(o.created_at) >= +startToday);
  const week = paid.filter((o) => now - +new Date(o.created_at) <= 7 * DAY);
  const month = paid.filter((o) => now - +new Date(o.created_at) <= 30 * DAY);
  const c = data.counts;
  const attention = data.orders.filter((o) => o.needs_attention).slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/65">Courier mode: <strong className={data.mode === 'live' ? 'text-emerald-700' : 'text-amber-700'}>{data.mode === 'live' ? 'LIVE (Shiprocket)' : 'TEST (no real bookings)'}</strong></p>
        <button onClick={() => void load()} className={btnGhost}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales today" value={formatINR(sum(today))} sub={`${today.length} paid order${today.length === 1 ? '' : 's'}`} tone="good" />
        <Stat label="Last 7 days" value={formatINR(sum(week))} sub={`${week.length} orders`} />
        <Stat label="Last 30 days" value={formatINR(sum(month))} sub={`${month.length} orders`} />
        <Stat label="Average order" value={formatINR(month.length ? sum(month) / month.length : 0)} sub="last 30 days" />
      </div>
      <p className="-mt-2 text-xs text-ink/55">Sales are paid orders minus refunds, from your latest {data.orders.length} orders.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button className="h-full text-left [&>div]:h-full" onClick={() => go('orders')}><Stat label="To ship" value={c.to_ship ?? 0} tone={c.to_ship ? 'warn' : 'neutral'} sub="paid, not shipped" /></button>
        <button className="h-full text-left [&>div]:h-full" onClick={() => go('orders')}><Stat label="In transit" value={c.in_transit ?? 0} /></button>
        <button className="h-full text-left [&>div]:h-full" onClick={() => go('orders')}><Stat label="Needs attention" value={c.attention ?? 0} tone={c.attention ? 'bad' : 'good'} sub="failed / stuck" /></button>
        <button className="h-full text-left [&>div]:h-full" onClick={() => go('returns')}><Stat label="Open returns" value={c.returns ?? 0} tone={c.returns ? 'warn' : 'neutral'} /></button>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Needs attention" action={<button onClick={() => go('orders')} className="text-sm text-onyx-300 underline">Open orders</button>}>
          {attention.length === 0 ? <p className="text-sm text-emerald-700">Nothing needs attention right now.</p> : (
            <ul className="divide-y divide-cream-300">{attention.map((o) => (
              <li key={o.id} className="flex items-start gap-3 py-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <div className="min-w-0"><p className="font-medium">{o.order_number} · {money(o.total_amount)}</p><p className="text-ink/65">{o.attention_reason ?? label(o.delivery_status)} · {formatDate(o.created_at)}</p></div></li>))}</ul>)}
        </Card>
        <Card title="Low stock" action={<button onClick={() => go('products')} className="text-sm text-onyx-300 underline">Open products</button>}>
          {lowStock.length === 0 ? <p className="text-sm text-emerald-700">All products are well stocked.</p> : (
            <ul className="divide-y divide-cream-300">{lowStock.map((p) => <li key={p.id} className="flex justify-between gap-3 py-2.5 text-sm"><span className="line-clamp-1">{p.title}</span><span className={p.stock <= 0 ? 'font-medium text-red-700' : 'text-amber-700'}>{p.stock <= 0 ? 'Sold out' : `${p.stock} left`}</span></li>)}</ul>)}
        </Card>
      </div>
    </div>
  );
}
