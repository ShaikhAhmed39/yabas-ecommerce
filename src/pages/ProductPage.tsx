import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Heart, Minus, Plus, RotateCcw, Share2, ShieldCheck, Truck, Lock, MapPin } from 'lucide-react';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductCard } from '@/components/ProductCard';
import { Section, SectionHead } from '@/components/ornaments';
import { useProducts } from '@/context/ProductsContext';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useStoreConfig } from '@/lib/storeConfig';
import { callFunction } from '@/lib/api';
import { go, shopHref } from '@/lib/router';
import { POLICY_LINKS } from '@/lib/policies';
import { formatINR, calculateDiscount } from '@/utils/format';
import { productImages } from '@/utils/images';
import { SkeletonCard } from '@/components/SkeletonCard';

export function ProductPage({ id }: { id: string }) {
  const { products, loading } = useProducts();
  const { addToCart, setCartOpen, items } = useCart();
  const wish = useWishlist();
  const { config } = useStoreConfig();
  const product = products.find((p) => p.id === id);
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState('');
  const [delivery, setDelivery] = useState<{ state: 'idle' | 'busy' | 'yes' | 'no' | 'unknown' | 'bad'; days?: number }>({ state: 'idle' });
  const [shared, setShared] = useState(false);

  useEffect(() => { setQty(1); window.scrollTo({ top: 0 }); }, [id]);
  useEffect(() => { if (product) document.title = `${product.title} | Yaba's Imitation & Jewellery`; return () => { document.title = "Yaba's Imitation & Jewellery"; }; }, [product]);

  const related = useMemo(
    () => (product ? products.filter((p) => p.id !== product.id && p.category === product.category && p.stock > 0).slice(0, 4) : []),
    [products, product],
  );

  if (loading && !product) {
    return <Section className="py-10"><div className="grid gap-8 lg:grid-cols-2"><SkeletonCard /><SkeletonCard /></div></Section>;
  }
  if (!product) {
    return (
      <Section className="py-20 text-center">
        <SectionHead title="Piece not found" sub="It may have been removed or sold out for good." />
        <a href={shopHref()} className="inline-flex min-h-12 items-center rounded bg-onyx-300 px-8 font-display text-sm tracking-[0.12em] text-gold-200">BROWSE THE COLLECTION</a>
      </Section>
    );
  }

  const imgs = productImages(product);
  const out = product.stock <= 0;
  const hasDiscount = product.original_price > product.selling_price;
  const discount = product.discount_percent || calculateDiscount(product.original_price, product.selling_price);
  const inBag = items.find((i) => i.product.id === product.id)?.quantity ?? 0;
  const maxQty = Math.max(0, Math.min(product.stock, 20) - inBag);
  const saved = wish.has(product.id);

  const checkPin = async () => {
    if (!/^[1-9]\d{5}$/.test(pin)) { setDelivery({ state: 'bad' }); return; }
    setDelivery({ state: 'busy' });
    try {
      const r = await callFunction<{ serviceable: boolean | null; etdDays?: number }>('check-delivery', { pincode: pin });
      setDelivery(r.serviceable === true ? { state: 'yes', days: r.etdDays } : r.serviceable === false ? { state: 'no' } : { state: 'unknown' });
    } catch { setDelivery({ state: 'unknown' }); }
  };

  const add = () => { addToCart(product, qty); setCartOpen(true); };
  const buyNow = () => { addToCart(product, qty); go('/checkout'); };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.title, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch { /* cancelled */ }
  };

  const specs = [
    ['Material', product.material_type], ['Finish', product.polish_finish], ['Size', product.dimensions],
    ['Occasion', product.occasion_wear], ['Type', product.sub_category || product.category],
  ].filter(([, v]) => v);

  const detail = 'border-t border-gold-500/30 py-4';

  return (
    <div className="pb-28 lg:pb-12">
      <Section className="pt-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13px] text-ink/65">
          <a href="#/" className="hover:text-onyx-300">Home</a><ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <a href={shopHref(product.category)} className="hover:text-onyx-300">{product.category || 'Shop'}</a><ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="line-clamp-1 text-ink">{product.title}</span>
        </nav>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <ProductGallery images={imgs} title={product.title} />

          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-gold-600">{product.category}{product.sub_category ? ` · ${product.sub_category}` : ''}</p>
            <h1 className="mt-1 font-display text-2xl leading-snug tracking-wide text-onyx-300 sm:text-3xl">{product.title}</h1>

            <p className="mt-3 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold text-ink">{formatINR(product.selling_price)}</span>
              {hasDiscount && <><span className="text-lg text-ink/55 line-through">{formatINR(product.original_price)}</span>
                {discount > 0 && <span className="rounded-sm bg-onyx-300 px-2 py-0.5 text-sm text-gold-100">{discount}% off</span>}</>}
            </p>
            <p className="mt-1 text-[13px] text-ink/60">Delivery charges, if any, are shown at checkout.</p>

            <p className={`mt-3 text-sm font-medium ${out ? 'text-maroon-500' : product.stock <= 5 ? 'text-maroon-500' : 'text-[#1B6E45]'}`}>
              {out ? 'Currently sold out' : product.stock <= 5 ? `Hurry, only ${product.stock} left` : 'In stock'}
            </p>

            {!out && (
              <div className="mt-5 flex items-center gap-4">
                <span className="text-sm text-ink/70">Quantity</span>
                <div className="inline-flex items-center rounded border border-gold-500/60 bg-white">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="grid h-11 w-11 place-items-center text-onyx-300 disabled:opacity-35" aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button>
                  <span className="w-10 text-center font-medium" aria-live="polite">{qty}</span>
                  <button onClick={() => setQty((q) => Math.min(Math.max(1, maxQty), q + 1))} disabled={qty >= maxQty} className="grid h-11 w-11 place-items-center text-onyx-300 disabled:opacity-35" aria-label="Increase quantity"><Plus className="h-4 w-4" /></button>
                </div>
                {inBag > 0 && <span className="text-xs text-ink/60">{inBag} already in your bag</span>}
              </div>
            )}

            <div className="mt-6 hidden gap-3 lg:grid lg:grid-cols-2">
              <button onClick={add} disabled={out || maxQty <= 0} className="min-h-[52px] rounded border-2 border-onyx-300 font-display text-sm tracking-[0.12em] text-onyx-300 hover:bg-onyx-300 hover:text-gold-100 disabled:opacity-40">ADD TO BAG</button>
              <button onClick={buyNow} disabled={out || maxQty <= 0} className="min-h-[52px] rounded bg-onyx-300 font-display text-sm tracking-[0.12em] text-gold-100 hover:bg-onyx-200 disabled:opacity-40">BUY NOW</button>
            </div>
            {!out && maxQty <= 0 && <p className="mt-2 text-sm text-maroon-500">You already have the maximum available in your bag.</p>}

            <div className="mt-4 flex gap-3">
              <button onClick={() => wish.toggle(product.id)} aria-pressed={saved} className="inline-flex min-h-11 items-center gap-2 rounded border border-gold-500/60 px-4 text-sm text-ink hover:bg-cream-200">
                <Heart className="h-4 w-4 text-maroon-500" fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved' : 'Save to wishlist'}
              </button>
              <button onClick={() => void share()} className="inline-flex min-h-11 items-center gap-2 rounded border border-gold-500/60 px-4 text-sm text-ink hover:bg-cream-200">
                <Share2 className="h-4 w-4" />{shared ? 'Link copied' : 'Share'}
              </button>
            </div>

            <div className="frame-gold mt-6 rounded-md bg-cream-50 p-4">
              <p className="flex items-center gap-2 font-display text-sm tracking-wide text-onyx-300"><MapPin className="h-4 w-4 text-gold-500" aria-hidden />Check delivery to your PIN code</p>
              <form onSubmit={(e) => { e.preventDefault(); void checkPin(); }} className="mt-3 flex gap-2">
                <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setDelivery({ state: 'idle' }); }} inputMode="numeric" autoComplete="postal-code" aria-label="PIN code" placeholder="6-digit PIN code"
                  className="h-11 min-w-0 flex-1 rounded-md border border-gold-500/50 bg-white px-3 text-[15px] focus:border-gold-500 focus:outline-none" />
                <button type="submit" disabled={delivery.state === 'busy'} className="min-h-11 rounded bg-onyx-300 px-5 font-display text-xs tracking-[0.1em] text-gold-200 disabled:opacity-60">{delivery.state === 'busy' ? '…' : 'CHECK'}</button>
              </form>
              <p className="mt-2 min-h-[1.25rem] text-sm" role="status">
                {delivery.state === 'bad' && <span className="text-maroon-500">Enter a valid 6-digit PIN code.</span>}
                {delivery.state === 'yes' && <span className="text-[#1B6E45]">We deliver to {pin}{delivery.days ? `, usually in about ${delivery.days} day${delivery.days === 1 ? '' : 's'} after dispatch` : ''}.</span>}
                {delivery.state === 'no' && <span className="text-maroon-500">Sorry, our courier does not deliver to {pin} yet.</span>}
                {delivery.state === 'unknown' && <span className="text-ink/70">We will confirm delivery for {pin} when you order.</span>}
              </p>
              {config.delivery_estimate && <p className="text-[13px] text-ink/65">Typical delivery: {config.delivery_estimate} working days after dispatch.</p>}
            </div>

            <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-[11.5px] text-ink/80">
              <li className="rounded-md bg-cream-200/70 px-2 py-3"><Lock className="mx-auto mb-1 h-5 w-5 text-onyx-300" aria-hidden />Secure payment</li>
              <li className="rounded-md bg-cream-200/70 px-2 py-3"><RotateCcw className="mx-auto mb-1 h-5 w-5 text-onyx-300" aria-hidden />7-day returns</li>
              <li className="rounded-md bg-cream-200/70 px-2 py-3"><Truck className="mx-auto mb-1 h-5 w-5 text-onyx-300" aria-hidden />Tracked delivery</li>
            </ul>

            <div className="mt-6">
              {product.description && (
                <details open className={detail}><summary className="cursor-pointer font-display text-sm tracking-[0.1em] text-onyx-300">DESCRIPTION</summary><p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-ink/85">{product.description}</p></details>
              )}
              {specs.length > 0 && (
                <details open className={detail}><summary className="cursor-pointer font-display text-sm tracking-[0.1em] text-onyx-300">DETAILS</summary>
                  <dl className="mt-3 grid grid-cols-2 gap-2">{specs.map(([k, v]) => <div key={k} className="rounded bg-cream-200/60 px-3 py-2"><dt className="text-xs text-ink/60">{k}</dt><dd className="text-sm font-medium text-ink">{v}</dd></div>)}</dl></details>
              )}
              <details className={detail}><summary className="cursor-pointer font-display text-sm tracking-[0.1em] text-onyx-300">CARE &amp; DISCLOSURE</summary>
                <p className="mt-3 text-[15px] leading-7 text-ink/85">This is imitation (gold-plated) jewellery. Keep it dry, store it apart from other pieces and avoid perfume and water. <a href={POLICY_LINKS.care.href} className="text-onyx-300 underline underline-offset-4">Read the full care guide</a>.</p></details>
              <details className={detail}><summary className="cursor-pointer font-display text-sm tracking-[0.1em] text-onyx-300">SHIPPING &amp; RETURNS</summary>
                <p className="mt-3 text-[15px] leading-7 text-ink/85">Delivery details are in our <a href={POLICY_LINKS.shipping.href} className="text-onyx-300 underline underline-offset-4">shipping policy</a>. You can raise a return from My orders within 7 days of delivery; see the <a href={POLICY_LINKS.returns.href} className="text-onyx-300 underline underline-offset-4">return &amp; refund policy</a>.</p></details>
              <p className="flex items-center gap-2 border-t border-gold-500/30 pt-4 text-[13px] text-ink/65"><ShieldCheck className="h-4 w-4 text-onyx-300" aria-hidden />Payments are processed by Razorpay. We never see your card or UPI details.</p>
            </div>
          </div>
        </div>
      </Section>

      {related.length > 0 && (
        <section className="mt-14">
          <SectionHead title="You may also love" deva="और देखें" />
          <Section><div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">{related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div></Section>
        </section>
      )}

      {/* Mobile action bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-gold-500/40 bg-cream-100 px-4 pt-3 pb-3 lg:hidden">
        <button onClick={add} disabled={out || maxQty <= 0} className="min-h-12 flex-1 rounded border-2 border-onyx-300 font-display text-xs tracking-[0.1em] text-onyx-300 disabled:opacity-40">ADD TO BAG</button>
        <button onClick={buyNow} disabled={out || maxQty <= 0} className="min-h-12 flex-1 rounded bg-onyx-300 font-display text-xs tracking-[0.1em] text-gold-100 disabled:opacity-40">{out ? 'SOLD OUT' : 'BUY NOW'}</button>
      </div>
    </div>
  );
}
