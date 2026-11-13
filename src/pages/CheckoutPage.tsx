import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, CheckCircle2, Gift, Loader2, Lock, ShieldCheck, Tag, Truck, X } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useStoreConfig } from '@/lib/storeConfig';
import { callFunction, errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  INDIAN_STATES, lookupPincode, startRazorpayPayment, validateEmail, validateIndianMobile, validatePincodeFormat,
  type CheckoutCustomer,
} from '@/lib/payment';
import { POLICY_LINKS, POLICY_VERSION } from '@/lib/policies';
import { shopHref } from '@/lib/router';
import { formatINR } from '@/utils/format';
import { ScratchCard, type ScratchCardData } from '@/components/ScratchCard';

const LOGO_PATH = '/yabas_logo.png';
const FORM_KEY = 'yabas-checkout-v1';
const STEPS = ['Delivery', 'Gift & offers', 'Payment'];

type Form = {
  email: string; full_name: string; primary_phone: string; backup_phone: string;
  address1: string; address2: string; pincode: string; city: string; state: string;
};
const EMPTY: Form = { email: '', full_name: '', primary_phone: '', backup_phone: '', address1: '', address2: '', pincode: '', city: '', state: '' };

function loadForm(): Form {
  try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}') as Partial<Form>) }; } catch { return EMPTY; }
}

const field = 'h-12 w-full rounded-md border bg-white px-3.5 text-[16px] text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-gold-400/60';

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-[13px] text-maroon-500">{error}</span> : hint ? <span className="mt-1 block text-[13px] text-ink/60">{hint}</span> : null}
    </label>
  );
}

export function CheckoutPage({ onSignIn }: { onSignIn: () => void }) {
  const { items, totalPrice, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { num, config } = useStoreConfig();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(loadForm);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [pinState, setPinState] = useState<{ busy: boolean; serviceable: boolean | null; days?: number } | null>(null);
  const [gift, setGift] = useState(false);
  const [giftMsg, setGiftMsg] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; description?: string } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [done, setDone] = useState<{ orderId: string; orderNumber: string | null; email: string; items: number; total: number } | null>(null);
  const [card, setCard] = useState<ScratchCardData | null>(null);
  const requestRef = useRef<{ fp: string; id: string } | null>(null);

  useEffect(() => { if (!done) window.scrollTo({ top: 0 }); }, [step, done]);
  useEffect(() => {
    try { localStorage.setItem(FORM_KEY, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form]);
  useEffect(() => { if (user?.email && !form.email) setForm((f) => ({ ...f, email: user.email ?? '' })); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const shipFee = num('shipping_fee');
  const freeOver = num('free_shipping_threshold');
  const wrapFee = num('gift_wrap_fee');
  const discount = coupon?.discount ?? 0;
  const afterDiscount = Math.max(totalPrice - discount, 0);
  const shipping = shipFee > 0 && !(freeOver > 0 && afterDiscount >= freeOver) ? shipFee : 0;
  const giftCost = gift ? wrapFee : 0;
  const total = afterDiscount + shipping + giftCost;

  const set = (k: keyof Form, v: string) => {
    if (k === 'pincode') v = v.replace(/\D/g, '').slice(0, 6);
    if (k === 'primary_phone' || k === 'backup_phone') v = v.replace(/\D/g, '').slice(0, 10);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // PIN code: fill city/state and say whether the courier delivers there. Never blocks on a lookup failure.
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(form.pincode)) { setPinState(null); return; }
    let cancelled = false;
    setPinState({ busy: true, serviceable: null });
    const t = setTimeout(async () => {
      const [info, del] = await Promise.all([
        lookupPincode(form.pincode),
        callFunction<{ serviceable: boolean | null; etdDays?: number }>('check-delivery', { pincode: form.pincode }).catch(() => ({ serviceable: null as boolean | null, etdDays: undefined })),
      ]);
      if (cancelled) return;
      if (info.status === 'invalid') setErrors((e) => ({ ...e, pincode: 'This PIN code was not found. Please check it.' }));
      if (info.status === 'valid') setForm((f) => ({
        ...f,
        city: f.city || info.city || '',
        state: f.state || (INDIAN_STATES.find((s) => s.toLowerCase() === (info.state ?? '').toLowerCase()) ?? ''),
      }));
      setPinState({ busy: false, serviceable: del.serviceable, days: del.etdDays });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.pincode]);

  // a coupon was priced against an older bag total: ask the customer to re-apply
  const couponFor = useRef(totalPrice);
  useEffect(() => {
    if (coupon && couponFor.current !== totalPrice) { setCoupon(null); setCouponMsg('Your bag changed, so please apply the coupon again.'); }
    couponFor.current = totalPrice;
  }, [totalPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  const validateStep0 = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    const mail = validateEmail(form.email); if (mail) e.email = mail;
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name.';
    const ph = validateIndianMobile(form.primary_phone); if (ph) e.primary_phone = ph;
    if (form.backup_phone) {
      if (validateIndianMobile(form.backup_phone)) e.backup_phone = 'Enter a valid 10-digit mobile number.';
      else if (form.backup_phone === form.primary_phone) e.backup_phone = 'Use a different number from the primary one.';
    }
    if (form.address1.trim().length < 5) e.address1 = 'Enter your house number and street.';
    const pin = validatePincodeFormat(form.pincode); if (pin) e.pincode = pin;
    if (!form.city.trim()) e.city = 'Enter your city.';
    if (!form.state) e.state = 'Select your state.';
    if (!pin && pinState?.serviceable === false) e.pincode = 'Sorry, our courier does not deliver to this PIN code yet.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    setError(null);
    if (step === 0 && !validateStep0()) {
      setTimeout(() => document.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
      return;
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true); setCouponMsg(null);
    try {
      if (!user) throw new Error('Please sign in to use a coupon.');
      const { data, error: e } = await supabase.rpc('preview_coupon', { p_code: code, p_subtotal: totalPrice });
      if (e) throw e;
      const r = data as { ok: boolean; code?: string; description?: string; discount?: number; reason?: string; min_order?: number };
      if (r.ok && r.discount) { setCoupon({ code: r.code ?? code, discount: r.discount, description: r.description }); setCouponMsg(null); }
      else {
        const why: Record<string, string> = {
          invalid: 'That coupon code is not valid.', inactive: 'That coupon is not active.', not_started: 'That coupon is not active yet.',
          expired: 'That coupon has expired.', used_up: 'That coupon has been fully used.', already_used: 'You have already used that coupon.',
          no_discount: 'That coupon does not apply to this order.', rate_limited: 'Too many tries. Please wait a few minutes.',
          min_order: `Add items worth ${formatINR(r.min_order ?? 0)} or more to use this coupon.`,
        };
        setCoupon(null); setCouponMsg(why[r.reason ?? ''] ?? 'That coupon cannot be applied.');
      }
    } catch (e) { setCouponMsg(errorMessage(e, 'Could not check the coupon. Please try again.')); }
    finally { setCouponBusy(false); }
  };

  const customer = (): CheckoutCustomer => ({
    customer_name: form.full_name.trim(),
    shipping_address_line1: form.address1.trim(),
    shipping_address_line2: form.address2.trim() || null,
    city: form.city.trim(), state: form.state, pincode: form.pincode,
    primary_phone: form.primary_phone, backup_phone: form.backup_phone || null,
  });

  const pay = async () => {
    setError(null); setNotice(null);
    if (!agree) { setError('Please tick the box to accept the Terms & Conditions and policies.'); document.getElementById('consent-box')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!validateStep0()) { setStep(0); return; }
    if (items.length === 0) { setError('Your bag is empty.'); return; }
    setPaying(true);
    try {
      if (!user) throw new Error('Please sign in to place your order.');
      const payload = {
        items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
        customer: customer(), coupon: coupon?.code ?? '', gift, giftMsg: gift ? giftMsg.trim() : '',
      };
      const fp = JSON.stringify(payload);
      if (!requestRef.current || requestRef.current.fp !== fp) requestRef.current = { fp, id: crypto.randomUUID() };
      const email = form.email.trim().toLowerCase();
      const snapshot = { items: items.reduce((n, i) => n + i.quantity, 0), total };
      await startRazorpayPayment({
        requestId: requestRef.current.id,
        items: payload.items,
        customer: payload.customer,
        extras: { email, coupon_code: coupon?.code, gift_wrap: gift, gift_message: gift ? giftMsg.trim() : '', consent_version: POLICY_VERSION },
        prefillEmail: email,
        onRequestExpired: () => { requestRef.current = null; },
        cb: {
          onStatus: setNotice,
          onError: (m) => { setError(m); setPaying(false); },
          onDismiss: () => { setPaying(false); setNotice('The payment window was closed. Your order is not confirmed yet. You can try again whenever you are ready.'); },
          onPaid: ({ orderId, orderNumber }) => {
            requestRef.current = null; clearCart(); setPaying(false);
            try { localStorage.removeItem('yabas-checkout-v1'); } catch { /* ignore */ }
            setDone({ orderId, orderNumber, email, ...snapshot });
          },
        },
      });
    } catch (e) {
      setError(errorMessage(e, 'We could not start the payment. Please try again.'));
      setPaying(false);
    }
  };

  // After payment the server issues a scratch card (when the owner has switched them on).
  useEffect(() => {
    if (!done?.orderNumber) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < 4 && !cancelled; i++) {
        const { data } = await supabase.rpc('my_scratch_cards');
        const found = (Array.isArray(data) ? (data as ScratchCardData[]) : []).find((c) => c.order_number === done.orderNumber);
        if (found) { if (!cancelled) setCard(found); return; }
        await new Promise((r) => setTimeout(r, 2500));
      }
    })().catch(() => { /* no card, nothing to show */ });
    return () => { cancelled = true; };
  }, [done?.orderNumber]);

  const lines = useMemo(() => items.map((i) => ({ ...i, line: i.product.selling_price * i.quantity })), [items]);

  const Summary = (
    <div className="space-y-4">
      <ul className="divide-y divide-gold-500/20">
        {lines.map((l) => (
          <li key={l.product.id} className="flex gap-3 py-3">
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded jewel-panel"><img src={l.product.image_url} alt="" className="h-full w-full object-cover" />
              <span className="absolute -right-0 -top-0 grid h-5 min-w-5 place-items-center rounded-bl bg-onyx-300 px-1 text-[11px] text-gold-100">{l.quantity}</span></div>
            <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm text-ink">{l.product.title}</p><p className="text-xs text-ink/60">{formatINR(l.product.selling_price)} each</p></div>
            <p className="text-sm font-medium text-ink">{formatINR(l.line)}</p>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t border-gold-500/30 pt-4 text-sm">
        <div className="flex justify-between"><dt className="text-ink/70">Subtotal</dt><dd>{formatINR(totalPrice)}</dd></div>
        {discount > 0 && <div className="flex justify-between text-[#1B6E45]"><dt>Coupon {coupon?.code}</dt><dd>− {formatINR(discount)}</dd></div>}
        <div className="flex justify-between"><dt className="text-ink/70">Delivery</dt><dd>{shipping > 0 ? formatINR(shipping) : 'Free'}</dd></div>
        {gift && <div className="flex justify-between"><dt className="text-ink/70">Gift wrap</dt><dd>{giftCost > 0 ? formatINR(giftCost) : 'Free'}</dd></div>}
        <div className="flex justify-between border-t border-dashed border-gold-500 pt-3 text-lg font-semibold text-ink"><dt>Total</dt><dd>{formatINR(total)}</dd></div>
        {shipFee > 0 && freeOver > 0 && afterDiscount < freeOver && <p className="text-[13px] text-ink/65">Add {formatINR(freeOver - afterDiscount)} more for free delivery.</p>}
      </dl>
    </div>
  );

  const topBar = (
    <header className="jaali-teal">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="/" aria-label="Yaba's, home" className="flex items-center gap-3">
          <img src={LOGO_PATH} alt="" className="hidden h-9 w-9 rounded-full ring-1 ring-gold-400/70 sm:block" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="font-display text-2xl tracking-[0.12em] text-gold-200">YABA&apos;S</span>
        </a>
        <p className="flex items-center gap-2 text-xs text-cream-100 sm:text-sm"><Lock className="h-4 w-4 text-gold-300" aria-hidden />Secure checkout</p>
      </div>
      <div className="scallop-ivory" aria-hidden="true" />
    </header>
  );

  if (done) {
    return (
      <div className="min-h-screen bg-cream-100">
        {topBar}
        <main className="mx-auto max-w-xl px-4 py-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#E5F6EC]"><CheckCircle2 className="h-9 w-9 text-[#1B6E45]" /></div>
          <h1 className="mt-4 font-display text-2xl tracking-wide text-onyx-300 sm:text-3xl">Thank you! Order confirmed</h1>
          <p className="mt-2 text-ink/80">Your payment of {formatINR(done.total)} was received.</p>
          <div className="frame-gold mx-auto mt-6 rounded-md bg-cream-50 p-5">
            <p className="text-sm text-ink/70">Your order number</p>
            <p className="font-mono text-2xl tracking-wider text-onyx-300">{done.orderNumber ?? done.orderId.slice(0, 8)}</p>
            <p className="mt-3 text-sm text-ink/75">We will send updates to <strong>{done.email}</strong>. You can follow it any time from My orders.</p>
          </div>
          {card && (
            <div className="mt-8">
              <h2 className="font-display text-lg tracking-wide text-maroon-500">A little thank-you for you</h2>
              <p className="mb-4 mt-1 text-sm text-ink/70">Scratch the card to reveal your reward for the next order.</p>
              <ScratchCard card={card} />
            </div>
          )}
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a href="/orders" className="inline-flex min-h-12 items-center justify-center gap-2 bg-onyx-300 text-[11px] font-medium uppercase tracking-[0.2em] text-white"><Truck className="h-4 w-4" />Track this order</a>
            <a href={shopHref()} className="inline-flex min-h-12 items-center justify-center rounded border-2 border-onyx-300 font-display text-xs tracking-[0.12em] text-onyx-300">CONTINUE SHOPPING</a>
          </div>
        </main>
      </div>
    );
  }

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-cream-100 text-ink/60"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  // Browsing, wishlist and bag are open to everyone; paying needs an account.
  if (!user && !done) {
    return (
      <div className="min-h-screen bg-cream-100 pb-10">{topBar}
        <main className="mx-auto max-w-lg px-4 py-10">
          <h1 className="text-center font-display text-3xl text-ink">Sign in to check out</h1>
          <p className="mx-auto mt-3 max-w-sm text-center text-[15px] leading-7 text-ink/70">Your bag is saved. Sign in or create an account so we can keep your orders, tracking, returns and rewards in one place.</p>
          {items.length > 0 && (
            <div className="frame-gold mt-6 bg-white p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-600">Your bag · {items.reduce((n, i) => n + i.quantity, 0)} item(s)</p>
              <ul className="divide-y divide-cream-400">{items.map((i) => <li key={i.product.id} className="flex justify-between gap-3 py-2 text-sm"><span className="line-clamp-1">{i.product.title} × {i.quantity}</span><span>{formatINR(i.product.selling_price * i.quantity)}</span></li>)}</ul>
              <p className="mt-2 flex justify-between border-t border-cream-400 pt-2 font-medium"><span>Subtotal</span><span>{formatINR(totalPrice)}</span></p>
            </div>
          )}
          <button onClick={onSignIn} className="mt-6 min-h-12 w-full bg-onyx-300 text-[12px] font-medium uppercase tracking-[0.2em] text-white hover:bg-onyx-200">Sign in or create account</button>
          <a href={shopHref()} className="mt-4 block text-center text-sm text-ink/70 underline underline-offset-4">Continue shopping</a>
        </main>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-cream-100">{topBar}
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-2xl text-onyx-300">Your bag is empty</h1>
          <p className="mt-2 text-ink/70">Add a piece you love and come back to check out.</p>
          <a href={shopHref()} className="mt-6 inline-flex min-h-12 items-center rounded bg-onyx-300 px-8 font-display text-sm tracking-[0.12em] text-gold-200">BROWSE THE COLLECTION</a>
        </main>
      </div>
    );
  }

  const ec = (k: keyof Form) => `${field} ${errors[k] ? 'border-maroon-500' : 'border-gold-500/50 focus:border-gold-500'}`;

  return (
    <div className="min-h-screen bg-cream-100 pb-32 lg:pb-12">
      {topBar}
      <main className="mx-auto max-w-6xl px-4 py-6 lg:grid lg:grid-cols-[1fr_380px] lg:gap-10">
        <div>
          <a href={shopHref()} className="mb-4 inline-flex min-h-10 items-center gap-1.5 text-sm text-onyx-300 hover:underline"><ArrowLeft className="h-4 w-4" />Continue shopping</a>

          <ol className="mb-6 flex items-center" aria-label="Checkout steps">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center last:flex-none" aria-current={i === step ? 'step' : undefined}>
                <button type="button" disabled={i > step} onClick={() => setStep(i)} className="flex items-center gap-2 disabled:cursor-default">
                  <span className={`grid h-8 w-8 place-items-center rounded-full border-2 text-sm font-medium ${i < step ? 'border-onyx-300 bg-onyx-300 text-gold-100' : i === step ? 'border-gold-500 bg-gold-200 text-ink' : 'border-gold-500/40 text-ink/50'}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
                  <span className={`hidden text-sm sm:inline ${i === step ? 'font-medium text-ink' : 'text-ink/60'}`}>{s}</span>
                </button>
                {i < STEPS.length - 1 && <span className={`mx-3 h-0.5 flex-1 ${i < step ? 'bg-onyx-300' : 'bg-gold-500/30'}`} />}
              </li>
            ))}
          </ol>

          <button type="button" onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen} className="frame-gold mb-5 flex w-full items-center justify-between rounded-md bg-cream-50 px-4 py-3 text-left lg:hidden">
            <span className="flex items-center gap-2 text-sm text-onyx-300">Order summary ({items.reduce((n, i) => n + i.quantity, 0)} items)<ChevronDown className={`h-4 w-4 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} /></span>
            <span className="font-semibold text-ink">{formatINR(total)}</span>
          </button>
          {summaryOpen && <div className="mb-5 rounded-md bg-cream-50 p-4 lg:hidden">{Summary}</div>}

          {error && <div role="alert" className="mb-4 rounded-md border border-maroon-500/40 bg-[#FBEAEE] p-3 text-sm text-maroon-600">{error}</div>}
          {notice && <div role="status" className="mb-4 rounded-md border border-gold-500/50 bg-cream-200 p-3 text-sm text-ink">{notice}</div>}

          {step === 0 && (
            <section aria-labelledby="s0" className="space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h1 id="s0" className="font-display text-xl tracking-wide text-onyx-300">Where should we deliver?</h1>
                <span className="text-sm text-ink/60">Signed in as {user?.email}</span></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="E-mail" error={errors.email} hint="Order confirmation and tracking updates are sent here.">
                  <input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={ec('email')} placeholder="you@example.com" /></Field></div>
                <div className="sm:col-span-2"><Field label="Full name" error={errors.full_name}>
                  <input autoComplete="name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className={ec('full_name')} /></Field></div>
                <Field label="Mobile number" error={errors.primary_phone} hint="The courier will call this number.">
                  <div className="flex"><span className="grid h-12 place-items-center rounded-l-md border border-r-0 border-gold-500/50 bg-cream-200 px-3 text-sm">+91</span>
                    <input type="tel" inputMode="numeric" autoComplete="tel-national" value={form.primary_phone} onChange={(e) => set('primary_phone', e.target.value)} className={`${ec('primary_phone')} rounded-l-none`} /></div></Field>
                <Field label="Alternate mobile (optional)" error={errors.backup_phone}>
                  <input type="tel" inputMode="numeric" value={form.backup_phone} onChange={(e) => set('backup_phone', e.target.value)} className={ec('backup_phone')} /></Field>
                <div className="sm:col-span-2"><Field label="Address" error={errors.address1}>
                  <input autoComplete="address-line1" value={form.address1} onChange={(e) => set('address1', e.target.value)} className={ec('address1')} placeholder="House / flat no., building, street" /></Field></div>
                <div className="sm:col-span-2"><Field label="Area, landmark (optional)">
                  <input autoComplete="address-line2" value={form.address2} onChange={(e) => set('address2', e.target.value)} className={ec('address2')} /></Field></div>
                <Field label="PIN code" error={errors.pincode}>
                  <input inputMode="numeric" autoComplete="postal-code" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} className={ec('pincode')} />
                  {!errors.pincode && pinState && <span className="mt-1 block text-[13px]" role="status">{pinState.busy ? <span className="text-ink/60">Checking…</span> : pinState.serviceable === true ? <span className="text-[#1B6E45]">Delivery available{pinState.days ? ` · about ${pinState.days} days after dispatch` : ''}</span> : pinState.serviceable === false ? <span className="text-maroon-500">Not serviceable by our courier yet</span> : <span className="text-ink/60">We will confirm delivery after you order</span>}</span>}
                </Field>
                <Field label="City" error={errors.city}><input autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} className={ec('city')} /></Field>
                <div className="sm:col-span-2"><Field label="State" error={errors.state}>
                  <select autoComplete="address-level1" value={form.state} onChange={(e) => set('state', e.target.value)} className={ec('state')}><option value="">Select state</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="s1" className="space-y-6">
              <h1 id="s1" className="font-display text-xl tracking-wide text-onyx-300">Gift &amp; offers</h1>
              <div className="frame-gold rounded-md bg-cream-50 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} className="mt-1 h-5 w-5 accent-[#16130F]" />
                  <span><span className="flex items-center gap-2 font-medium text-ink"><Gift className="h-4 w-4 text-gold-500" aria-hidden />Make it a gift {wrapFee > 0 ? `(+ ${formatINR(wrapFee)})` : '(free)'}</span><span className="text-sm text-ink/65">Gift wrap and a printed message card. The price is not shown on the parcel.</span></span>
                </label>
                {gift && <div className="mt-3"><Field label="Message for the card (optional)" hint={`${giftMsg.length}/200`}>
                  <textarea value={giftMsg} maxLength={200} rows={3} onChange={(e) => setGiftMsg(e.target.value)} className="w-full rounded-md border border-gold-500/50 bg-white p-3 text-[16px] focus:border-gold-500 focus:outline-none" /></Field></div>}
              </div>

              <div className="frame-gold rounded-md bg-cream-50 p-4">
                <p className="flex items-center gap-2 font-medium text-ink"><Tag className="h-4 w-4 text-gold-500" aria-hidden />Coupon code</p>
                {coupon ? (
                  <div className="mt-3 flex items-center justify-between rounded-md bg-[#E5F6EC] px-3 py-2.5 text-sm text-[#1B6E45]">
                    <span><strong>{coupon.code}</strong> applied · you save {formatINR(coupon.discount)}</span>
                    <button onClick={() => { setCoupon(null); setCouponInput(''); }} aria-label="Remove coupon" className="grid h-9 w-9 place-items-center"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); void applyCoupon(); }} className="mt-3 flex gap-2">
                    <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} aria-label="Coupon code" placeholder="Enter code" autoCapitalize="characters" className={`${field} min-w-0 flex-1 border-gold-500/50 uppercase`} />
                    <button type="submit" disabled={couponBusy || !couponInput.trim()} className="min-h-12 rounded bg-onyx-300 px-5 font-display text-xs tracking-[0.1em] text-gold-200 disabled:opacity-50">{couponBusy ? '…' : 'APPLY'}</button>
                  </form>
                )}
                {couponMsg && <p role="alert" className="mt-2 text-sm text-maroon-500">{couponMsg}</p>}
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="s2" className="space-y-6">
              <h1 id="s2" className="font-display text-xl tracking-wide text-onyx-300">Review &amp; pay</h1>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="frame-gold rounded-md bg-cream-50 p-4 text-sm"><div className="mb-1 flex items-center justify-between"><p className="font-display tracking-wide text-onyx-300">Delivering to</p><button onClick={() => setStep(0)} className="min-h-9 text-xs text-onyx-300 underline">Edit</button></div>
                  <p className="font-medium text-ink">{form.full_name}</p><p className="text-ink/80">{form.address1}{form.address2 ? `, ${form.address2}` : ''}<br />{form.city}, {form.state} {form.pincode}</p><p className="mt-1 text-ink/80">+91 {form.primary_phone}<br />{form.email}</p></div>
                <div className="frame-gold rounded-md bg-cream-50 p-4 text-sm"><p className="mb-1 font-display tracking-wide text-onyx-300">Pay securely with Razorpay</p>
                  <p className="text-ink/80">UPI, cards, netbanking and wallets. Cash on delivery is not available right now.</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink/65"><ShieldCheck className="h-4 w-4 text-onyx-300" aria-hidden />We never see or store your card or UPI details.</p></div>
              </div>

              <label id="consent-box" className="flex cursor-pointer items-start gap-3 rounded-md border border-gold-500/40 bg-cream-50 p-4">
                <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setError(null); }} className="mt-1 h-5 w-5 flex-shrink-0 accent-[#16130F]" />
                <span className="text-sm leading-6 text-ink/90">
                  I have read and agree to the{' '}
                  <a href={POLICY_LINKS.terms.href} target="_blank" rel="noopener noreferrer" className="text-onyx-300 underline underline-offset-4">Terms &amp; Conditions</a>,{' '}
                  <a href={POLICY_LINKS.privacy.href} target="_blank" rel="noopener noreferrer" className="text-onyx-300 underline underline-offset-4">Privacy Policy</a>,{' '}
                  <a href={POLICY_LINKS.returns.href} target="_blank" rel="noopener noreferrer" className="text-onyx-300 underline underline-offset-4">Return &amp; Refund Policy</a> and{' '}
                  <a href={POLICY_LINKS.shipping.href} target="_blank" rel="noopener noreferrer" className="text-onyx-300 underline underline-offset-4">Shipping Policy</a>. I understand these are imitation (gold-plated) jewellery pieces.
                </span>
              </label>
              <p className="text-[13px] text-ink/60">Also see our <a href={POLICY_LINKS.cancellation.href} target="_blank" rel="noopener noreferrer" className="underline">Cancellation Policy</a> and <a href={POLICY_LINKS.care.href} target="_blank" rel="noopener noreferrer" className="underline">Jewellery Care</a>. Seller: {config.legal_name || "Yaba's Imitation & Jewellery"}.</p>
            </section>
          )}

          <div className="mt-8 hidden items-center justify-between lg:flex">
            {step > 0 ? <button onClick={() => setStep((s) => s - 1)} className="min-h-12 rounded border-2 border-onyx-300 px-8 font-display text-xs tracking-[0.12em] text-onyx-300">BACK</button> : <span />}
            {step < 2
              ? <button onClick={next} className="min-h-12 rounded bg-onyx-300 px-10 font-display text-sm tracking-[0.12em] text-gold-200 hover:bg-onyx-200">CONTINUE</button>
              : <button onClick={() => void pay()} disabled={paying} className="inline-flex min-h-12 items-center gap-2 rounded bg-onyx-300 px-10 font-display text-sm tracking-[0.12em] text-gold-100 hover:bg-onyx-200 disabled:opacity-60">{paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}PAY {formatINR(total)}</button>}
          </div>
        </div>

        <aside className="hidden lg:block"><div className="frame-gold sticky top-6 rounded-md bg-cream-50 p-5"><h2 className="mb-2 font-display text-base tracking-[0.1em] text-onyx-300">ORDER SUMMARY</h2>{Summary}</div></aside>
      </main>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-gold-500/40 bg-cream-100 px-4 pt-3 pb-3 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step > 0 && <button onClick={() => setStep((s) => s - 1)} className="min-h-12 rounded border-2 border-onyx-300 px-5 font-display text-xs tracking-[0.1em] text-onyx-300" aria-label="Back">BACK</button>}
          {step < 2
            ? <button onClick={next} className="min-h-12 flex-1 rounded bg-onyx-300 font-display text-sm tracking-[0.12em] text-gold-200">CONTINUE</button>
            : <button onClick={() => void pay()} disabled={paying} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded bg-onyx-300 font-display text-sm tracking-[0.1em] text-gold-100 disabled:opacity-60">{paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}PAY {formatINR(total)}</button>}
        </div>
      </div>
    </div>
  );
}
