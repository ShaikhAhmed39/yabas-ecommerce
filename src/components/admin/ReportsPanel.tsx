import { useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { label as lbl } from '@/lib/orders';
import { loadOrders, num, paidStatus } from '@/components/admin/adminData';
import { btnGhost, btnPrimary, Card, Field, inputCls, Notice } from '@/components/admin/AdminUI';
import type { AdminOrder } from '@/components/admin/adminTypes';
import type { Product } from '@/types';

const SECTIONS = [
  { id: 'summary', title: 'Summary & sales' }, { id: 'orders', title: 'Orders' }, { id: 'deliveries', title: 'Deliveries & tracking' },
  { id: 'returns', title: 'Returns' }, { id: 'refunds', title: 'Refunds' }, { id: 'inventory', title: 'Inventory' }, { id: 'coupons', title: 'Coupons' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const PRESETS = [{ id: '7', t: 'Last 7 days' }, { id: '30', t: 'Last 30 days' }, { id: 'month', t: 'This month' }, { id: 'all', t: 'Everything' }, { id: 'custom', t: 'Custom dates' }];

const rs = (n: number) => `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
const d0 = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '-');

/** One-tap PDF of the whole business: sales, orders, deliveries, returns, refunds, stock and coupons. Built in the browser, works on phone and desktop. */
export function ReportsPanel() {
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState<Set<SectionId>>(new Set(SECTIONS.map((s) => s.id)));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; name: string } | null>(null);

  const range = (): [number, number, string] => {
    const now = new Date(); const end = Date.now() + 1;
    if (preset === '7') return [end - 7 * 864e5, end, 'Last 7 days'];
    if (preset === '30') return [end - 30 * 864e5, end, 'Last 30 days'];
    if (preset === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end, 'This month'];
    if (preset === 'custom') {
      const a = from ? new Date(`${from}T00:00:00`).getTime() : 0; const b = to ? new Date(`${to}T23:59:59`).getTime() : end;
      return [a, b, `${from || 'Start'} to ${to || 'today'}`];
    }
    return [0, end, 'All time'];
  };

  const generate = async () => {
    setErr(null); setDone(null);
    if (picked.size === 0) return setErr('Choose at least one section.');
    if (preset === 'custom' && from && to && from > to) return setErr('The start date is after the end date.');
    try {
      setBusy('Loading orders…');
      const [a, b, rangeLabel] = range();
      const { orders: every, mode } = await loadOrders(2000, (n) => setBusy(`Loading orders… ${n}`));
      const orders = every.filter((o) => { const t = +new Date(o.created_at); return t >= a && t <= b; });
      setBusy('Loading stock and coupons…');
      const [prod, coup] = await Promise.all([
        picked.has('inventory') ? supabase.from('products').select('title,category,selling_price,stock').order('stock') : Promise.resolve({ data: [] as Product[] }),
        picked.has('coupons') ? supabase.from('coupons').select('code,kind,value,used_count,usage_limit,is_active,source,expires_at').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      ]);
      setBusy('Building PDF…');
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const TEAL: [number, number, number] = [15, 76, 74];
      let y = 40;
      const heading = (t: string) => {
        const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
        if (last && y < last.finalY) y = last.finalY;
        if (y > 470) { doc.addPage(); y = 40; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TEAL); doc.text(t, 40, y + 12); y += 20;
      };
      const table = (head: string[], body: (string | number)[][], opts: { fs?: number } = {}) => {
        autoTable(doc, { startY: y, head: [head], body: body.length ? body : [[{ content: 'No records in this period.', colSpan: head.length, styles: { halign: 'center', textColor: 120 } } as never]],
          styles: { fontSize: opts.fs ?? 8, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: TEAL }, alternateRowStyles: { fillColor: [250, 244, 232] }, margin: { left: 40, right: 40 } });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
      };

      doc.setFillColor(...TEAL); doc.rect(0, 0, W, 64, 'F');
      doc.setTextColor(246, 223, 168); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text("Yaba's Imitation & Jewellery", 40, 32);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(`Business report · ${rangeLabel} · Generated ${dt(new Date().toISOString())} · Courier mode: ${mode === 'live' ? 'live' : 'test'}`, 40, 50);
      y = 90;

      const paid = orders.filter(paidStatus);
      const gross = paid.reduce((n, o) => n + num(o.total_amount), 0);
      const refunded = orders.reduce((n, o) => n + num(o.refunded_amount), 0);
      const by = (f: (o: AdminOrder) => string) => orders.reduce<Record<string, number>>((m, o) => { const k = f(o) || '-'; m[k] = (m[k] ?? 0) + 1; return m; }, {});

      if (picked.has('summary')) {
        heading('Summary & sales');
        table(['Measure', 'Value'], [
          ['Orders placed', orders.length], ['Paid orders', paid.length], ['Gross sales (paid)', rs(gross)], ['Refunded', rs(refunded)], ['Net sales', rs(gross - refunded)],
          ['Average paid order', rs(paid.length ? gross / paid.length : 0)], ['Cancelled orders', orders.filter((o) => o.status === 'cancelled').length],
          ['Unpaid / failed orders', orders.filter((o) => !paidStatus(o) && o.status !== 'cancelled').length],
        ], { fs: 9 });
        table(['Delivery status', 'Orders'], Object.entries(by((o) => lbl(o.delivery_status))).map(([k, v]) => [k, v]));
        const top = new Map<string, { q: number; r: number }>();
        paid.forEach((o) => o.items.forEach((i) => { const t = top.get(i.product_title) ?? { q: 0, r: 0 }; t.q += i.quantity; t.r += num(i.unit_price) * i.quantity; top.set(i.product_title, t); }));
        heading('Best sellers');
        table(['Product', 'Units', 'Revenue'], [...top.entries()].sort((x, y2) => y2[1].r - x[1].r).slice(0, 10).map(([k, v]) => [k, v.q, rs(v.r)]));
      }
      if (picked.has('orders')) {
        heading(`Orders (${orders.length})`);
        table(['Order', 'Placed', 'Customer', 'City', 'Items', 'Total', 'Payment', 'Delivery', 'Payment ID'],
          orders.map((o) => [o.order_number ?? o.id.slice(0, 8), dt(o.created_at), o.customer_name ?? '-', `${o.city ?? ''} ${o.pincode ?? ''}`, o.items.map((i) => `${i.product_title} x${i.quantity}`).join('; '), rs(num(o.total_amount)), lbl(o.payment_status), lbl(o.delivery_status), o.razorpay_payment_id ?? '-']), { fs: 7 });
      }
      if (picked.has('deliveries')) {
        const rows = orders.flatMap((o) => o.shipments.filter((s) => s.direction === 'forward').map((s) => [o.order_number ?? '-', o.customer_name ?? '-', s.courier_name ?? '-', s.awb_code ?? '-', lbl(s.status), d0(s.picked_up_at), d0(s.etd), d0(s.delivered_at), s.error ?? '']));
        heading(`Deliveries (${rows.length})`);
        table(['Order', 'Customer', 'Courier', 'AWB', 'Status', 'Picked up', 'ETA', 'Delivered', 'Error'], rows);
        const toShip = orders.filter((o) => paidStatus(o) && !o.shipments.some((s) => s.direction === 'forward') && o.status !== 'cancelled');
        heading(`Paid but no shipment booked (${toShip.length})`);
        table(['Order', 'Customer', 'City', 'Paid at', 'Total'], toShip.map((o) => [o.order_number ?? '-', o.customer_name ?? '-', o.city ?? '-', dt(o.paid_at), rs(num(o.total_amount))]));
      }
      if (picked.has('returns')) {
        const rows = orders.flatMap((o) => o.returns.map((r) => [o.order_number ?? '-', o.customer_name ?? '-', o.items.find((i) => i.id === r.order_item_id)?.product_title ?? '-', lbl(r.reason), lbl(r.status), d0(r.created_at), r.refund_amount != null ? rs(num(r.refund_amount)) : '-', r.rejection_reason ?? r.admin_note ?? '']));
        heading(`Returns (${rows.length})`);
        table(['Order', 'Customer', 'Item', 'Reason', 'Status', 'Raised', 'Refund', 'Note'], rows);
        const rr = orders.flatMap((o) => o.shipments.filter((s) => s.direction === 'return').map((s) => [o.order_number ?? '-', s.courier_name ?? '-', s.awb_code ?? '-', lbl(s.status), d0(s.pickup_scheduled_at), d0(s.delivered_at)]));
        heading(`Return pickups (${rr.length})`);
        table(['Order', 'Courier', 'AWB', 'Status', 'Pickup', 'Received'], rr);
      }
      if (picked.has('refunds')) {
        const rows = orders.flatMap((o) => o.refunds.map((r) => [o.order_number ?? '-', rs(num(r.amount_paise) / 100), lbl(r.status), r.return_request_id ? 'Return' : 'Order', r.reason ?? '-', dt(r.created_at), dt(r.processed_at), r.error ?? '']));
        heading(`Refunds (${rows.length})`);
        table(['Order', 'Amount', 'Status', 'For', 'Reason', 'Created', 'Processed', 'Error'], rows);
      }
      if (picked.has('inventory')) {
        const list = (prod.data ?? []) as Pick<Product, 'title' | 'category' | 'selling_price' | 'stock'>[];
        heading(`Inventory (${list.length} products · stock value ${rs(list.reduce((n, p) => n + p.selling_price * p.stock, 0))})`);
        table(['Product', 'Category', 'Price', 'Stock'], list.map((p) => [p.title, p.category, rs(p.selling_price), p.stock <= 0 ? 'SOLD OUT' : p.stock]));
      }
      if (picked.has('coupons')) {
        const list = (coup.data ?? []) as { code: string; kind: string; value: number; used_count: number; usage_limit: number | null; is_active: boolean; source: string; expires_at: string | null }[];
        heading(`Coupons (${list.length})`);
        table(['Code', 'Source', 'Discount', 'Used', 'Limit', 'Active', 'Expires'], list.map((c) => [c.code, c.source, c.kind === 'percent' ? `${c.value}%` : rs(c.value), c.used_count, c.usage_limit ?? '-', c.is_active ? 'Yes' : 'No', d0(c.expires_at)]));
      }

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Page ${i} of ${pages}`, W - 40, 580, { align: 'right' }); doc.text('Confidential: for the shop owner', 40, 580); }
      const name = `yabas-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      const blob = doc.output('blob');
      setDone({ url: URL.createObjectURL(blob), name });
      doc.save(name);
    } catch (e) { setErr(errorMessage(e, 'Could not build the report.')); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <Card title="Build a PDF report">
        <p className="mb-4 text-sm text-ink/70">One PDF with everything you choose. It is created on your device, so nothing is uploaded anywhere.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Period"><select value={preset} onChange={(e) => setPreset(e.target.value)} className={inputCls}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.t}</option>)}</select></Field>
          {preset === 'custom' && <><Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field><Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field></>}
        </div>
        <fieldset className="mt-5"><legend className="mb-2 text-sm font-medium">Include</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{SECTIONS.map((s) => (
            <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-cream-400 px-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[#16130F]" checked={picked.has(s.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />{s.title}</label>))}</div>
        </fieldset>
        {err && <div className="mt-4"><Notice kind="error">{err}</Notice></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={() => void generate()} disabled={Boolean(busy)} className={btnPrimary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}{busy ?? 'Create PDF'}</button>
          {done && <><a href={done.url} download={done.name} className={btnGhost}><Download className="h-4 w-4" />Download again</a><a href={done.url} target="_blank" rel="noopener noreferrer" className={btnGhost}><ExternalLink className="h-4 w-4" />Open</a></>}
        </div>
      </Card>
    </div>
  );
}
