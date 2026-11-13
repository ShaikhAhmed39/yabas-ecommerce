import { useEffect, useState } from 'react';
import { Loader2, PackageSearch } from 'lucide-react';
import { Section, SectionHead } from '@/components/ornaments';
import { Stepper } from '@/components/orders/Stepper';
import { ShipmentCard } from '@/components/orders/ShipmentCard';
import { callFunction, errorMessage } from '@/lib/api';
import { forwardSteps, formatDate, label, money, type Order, type Shipment } from '@/lib/orders';
import { validateIndianMobile } from '@/lib/payment';

interface Tracked {
  found: boolean;
  order_number?: string; created_at?: string; status?: string; payment_status?: string; delivery_status?: string;
  total_amount?: number; city?: string;
  items?: { title: string; quantity: number; unit_price: number }[];
  shipments?: (Omit<Shipment, 'id' | 'order_id' | 'return_request_id' | 'created_at' | 'picked_up_at' | 'pickup_scheduled_at' | 'last_event_at' | 'events'> & {
    events: { status: string | null; activity: string | null; location: string | null; time: string }[];
  })[];
}

/** Guest-friendly tracking: order number + the mobile number used at checkout. No account needed. */
export function TrackOrderPage({ initialOrder }: { initialOrder?: string }) {
  const [orderNo, setOrderNo] = useState((initialOrder ?? '').toUpperCase());
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Tracked | null>(null);

  useEffect(() => { if (initialOrder) setOrderNo(initialOrder.toUpperCase()); }, [initialOrder]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setResult(null);
    const no = orderNo.trim().toUpperCase();
    if (!/^YB[0-9]{4,10}$/.test(no)) { setError('Order numbers look like YB000123. You can find it in your confirmation e-mail.'); return; }
    const bad = validateIndianMobile(phone);
    if (bad) { setError(bad); return; }
    setBusy(true);
    try {
      const r = await callFunction<Tracked>('track-order', { order_number: no, phone });
      if (!r.found) setError('We could not find an order with that number and mobile number. Please check both and try again.');
      else setResult(r);
    } catch (err) { setError(errorMessage(err, 'We could not look up your order right now. Please try again.')); }
    finally { setBusy(false); }
  };

  const steps = result ? forwardSteps({
    payment_status: result.payment_status ?? '', delivery_status: result.delivery_status ?? '', status: result.status ?? '',
  } as unknown as Order) : [];

  const input = 'h-12 w-full rounded-md border border-gold-500/50 bg-white px-3.5 text-[16px] focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-400/60';

  return (
    <Section className="max-w-2xl py-10">
      <SectionHead title="Track your order" deva="ऑर्डर ट्रैक करें" sub="Enter your order number and the mobile number you used at checkout." />
      <form onSubmit={submit} className="frame-gold space-y-4 rounded-md bg-cream-50 p-5 sm:p-6" noValidate>
        <label className="block"><span className="mb-1 block text-sm font-medium">Order number</span>
          <input value={orderNo} onChange={(e) => setOrderNo(e.target.value.toUpperCase())} placeholder="YB000123" autoCapitalize="characters" className={input} /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Mobile number</span>
          <div className="flex"><span className="grid h-12 place-items-center rounded-l-md border border-r-0 border-gold-500/50 bg-cream-200 px-3 text-sm">+91</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" type="tel" className={`${input} rounded-l-none`} /></div></label>
        {error && <p role="alert" className="rounded-md bg-[#FBEAEE] p-3 text-sm text-maroon-600">{error}</p>}
        <button disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded bg-onyx-300 font-display text-sm tracking-[0.12em] text-gold-200 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}TRACK ORDER</button>
        <p className="text-center text-[13px] text-ink/60">Have an account? <a href="/orders" className="text-onyx-300 underline underline-offset-4">Open My orders</a> for returns and full history.</p>
      </form>

      {result && (
        <div className="mt-6 space-y-5">
          <div className="frame-gold rounded-md bg-cream-50 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-lg text-onyx-300">{result.order_number}</p>
              <p className="text-sm text-ink/70">Placed {formatDate(result.created_at)} · {money(result.total_amount)}</p>
            </div>
            <p className="mt-1 text-sm text-ink/80">{result.status === 'cancelled' ? 'This order was cancelled.' : `Status: ${label(result.delivery_status || result.status)}`}{result.city ? ` · Delivering to ${result.city}` : ''}</p>
            {result.status !== 'cancelled' && <div className="mt-5"><Stepper steps={steps} ariaLabel="Order progress" /></div>}
          </div>
          {(result.shipments ?? []).map((s, i) => (
            <ShipmentCard key={i} title={s.direction === 'return' ? 'Return pickup' : 'Delivery'}
              shipment={{ ...s, id: String(i), order_id: '', return_request_id: null, created_at: '', picked_up_at: null, pickup_scheduled_at: null, last_event_at: null,
                events: s.events.map((e, j) => ({ id: String(j), shipment_id: String(i), mapped_status: e.status, activity: e.activity, location: e.location, event_time: e.time })) }} />
          ))}
          <div className="frame-gold rounded-md bg-cream-50 p-5">
            <p className="mb-2 font-display text-sm tracking-[0.1em] text-onyx-300">ITEMS</p>
            <ul className="divide-y divide-gold-500/20 text-sm">{(result.items ?? []).map((it, i) => <li key={i} className="flex justify-between py-2"><span>{it.title} × {it.quantity}</span><span>{money(it.unit_price * it.quantity)}</span></li>)}</ul>
          </div>
        </div>
      )}
    </Section>
  );
}
