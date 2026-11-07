import { useMemo } from 'react';
import { Gift, MessageCircle, PackageSearch, Gem, ShieldCheck, RotateCcw, Truck, Lock, MapPin, Phone } from 'lucide-react';
import { Hero } from '@/components/Hero';
import { ProductCard } from '@/components/ProductCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { About } from '@/components/About';
import { OrnDivider, Section, SectionHead } from '@/components/ornaments';
import { useProducts } from '@/context/ProductsContext';
import { useStoreConfig } from '@/lib/storeConfig';
import { SHOP_DEFAULTS } from '@/lib/policies';
import { shopHref } from '@/lib/router';
import { formatINR } from '@/utils/format';
import { PLACEHOLDER_IMG } from '@/utils/images';

export function HomePage() {
  const { products, loading, error, refetch } = useProducts();
  const { config, num, whatsappLink } = useStoreConfig();

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    products.forEach((p) => { if (p.category && !seen.has(p.category)) seen.set(p.category, p.image_url); });
    return [...seen.entries()];
  }, [products]);
  const trending = useMemo(() => {
    const f = products.filter((p) => p.is_featured && p.stock > 0);
    return (f.length >= 2 ? f : products.filter((p) => p.stock > 0)).slice(0, 2);
  }, [products]);
  const occasions = useMemo(() => [...new Set(products.map((p) => p.occasion_wear).filter(Boolean))].slice(0, 8), [products]);
  const ready = products.filter((p) => p.stock > 0).slice(0, 8);
  const freeOver = num('free_shipping_threshold');
  const wa = whatsappLink("Hello Yaba's, I would like help choosing a piece.") ?? `https://wa.me/91${SHOP_DEFAULTS.whatsapp_number}`;

  const quick = [
    { icon: PackageSearch, label: 'Track order', href: '#/track' },
    { icon: MessageCircle, label: 'WhatsApp us', href: wa, external: true },
    { icon: Gift, label: 'Gift a piece', href: shopHref('All', 'gift') },
    { icon: Gem, label: 'Shop all', href: shopHref() },
  ];

  return (
    <>
      <div className="border-b border-cream-400 bg-cream-200 text-ink">
        <div className="mx-auto flex max-w-7xl justify-around gap-2 px-2 py-2 text-[10px] font-medium uppercase tracking-[0.14em] sm:text-xs">
          <span>{freeOver > 0 ? `FREE DELIVERY OVER ${formatINR(freeOver)}` : 'DELIVERED ACROSS INDIA'}</span>
          <span>7-DAY RETURNS</span>
          <span>SECURE PAYMENTS</span>
        </div>
      </div>
      <Hero />

      <Section className="py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quick.map((q) => (
            <a key={q.label} href={q.href} {...(q.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="frame-gold flex min-h-14 items-center gap-3 rounded-md bg-cream-50 px-3.5 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:bg-cream-200 sm:text-[12px]">
              <q.icon className="h-5 w-5 flex-shrink-0 text-gold-500" aria-hidden />{q.label}
            </a>
          ))}
        </div>
      </Section>

      {error && (
        <Section className="py-10 text-center">
          <p role="alert" className="text-ink">{error}</p>
          <button onClick={() => void refetch()} className="mt-4 min-h-11 rounded border border-onyx-300 px-6 text-sm text-onyx-300 hover:bg-onyx-300 hover:text-gold-100">Try again</button>
        </Section>
      )}

      {categories.length > 0 && (
        <section className="py-6">
          <OrnDivider className="mx-auto max-w-sm px-8" />
          <SectionHead title="Shop by category" deva="श्रेणियाँ" />
          <div className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-5 pb-3 scrollbar-hide sm:justify-center sm:gap-8">
            {categories.map(([name, img], i) => (
              <a key={name} href={shopHref(name)} className="w-[112px] flex-shrink-0 text-center sm:w-36">
                <span className={`mb-3 block aspect-[3/4] overflow-hidden rounded-t-full border border-gold-500/60 ${i % 2 ? 'jewel-panel-maroon' : 'jewel-panel'}`}>
                  <img src={img || PLACEHOLDER_IMG} alt="" loading="lazy" className="h-full w-full object-cover" />
                </span>
                <span className="font-display text-[19px] text-ink">{name}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {trending.length > 0 && (
        <section className="py-6">
          <OrnDivider className="mx-auto max-w-sm px-8" />
          <SectionHead title="Trending now" deva="लोकप्रिय" sub="Pieces our customers keep coming back for." />
          <Section>
            <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:gap-6">
              {trending.map((p) => (
                <a key={p.id} href={`#/product/${p.id}`}
                  className={`group relative block aspect-[3/4.3] overflow-hidden rounded-t-full border border-gold-500/60 jewel-panel`}>
                  <img src={p.image_url || PLACEHOLDER_IMG} alt={p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-5 pt-14 text-center">
                    <span className="block line-clamp-1 font-display text-sm text-gold-100 sm:text-base">{p.title}</span>
                    <span className="mt-2 inline-block border-b border-white pb-0.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white">Shop now</span>
                  </span>
                </a>
              ))}
            </div>
          </Section>
        </section>
      )}

      {occasions.length > 0 && (
        <section className="py-6">
          <OrnDivider className="mx-auto max-w-sm px-8" />
          <SectionHead title="Shop by occasion" deva="अवसर" />
          <div className="mx-auto flex max-w-7xl gap-2.5 overflow-x-auto px-5 pb-2 scrollbar-hide sm:flex-wrap sm:justify-center">
            {occasions.map((o) => (
              <a key={o} href={shopHref('All', o)} className="flex-shrink-0 rounded-full border border-cream-400 bg-white px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:bg-onyx-300 hover:text-white">{o}</a>
            ))}
          </div>
        </section>
      )}

      <section className="py-6">
        <OrnDivider className="mx-auto max-w-sm px-8" />
        <SectionHead title="Ready to ship" deva="तैयार" sub="In stock now, packed with care." />
        <Section>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">{Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : ready.length === 0 && !error ? (
            <p className="py-10 text-center text-ink/70">New pieces are added regularly. Please check back soon.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
              {ready.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
          {products.length > 8 && (
            <div className="mt-8 text-center">
              <a href={shopHref()} className="inline-flex min-h-12 items-center bg-onyx-300 px-10 text-[12px] font-medium uppercase tracking-[0.2em] text-white hover:bg-onyx-200">View all pieces</a>
            </div>
          )}
        </Section>
      </section>

      <Section className="py-8">
        <div className="jaali-maroon grid grid-cols-2 gap-x-3 gap-y-6 px-4 py-7 text-center text-[12px] text-cream-100 sm:grid-cols-4 sm:text-sm">
          {[
            { i: Lock, t: 'Secure payments', d: 'UPI, cards and netbanking via Razorpay' },
            { i: RotateCcw, t: '7-day returns', d: 'Raise it online from My orders' },
            { i: Truck, t: 'Delivered across India', d: 'With tracking you can follow' },
            { i: ShieldCheck, t: 'Honest descriptions', d: 'Material and finish stated on every piece' },
          ].map((x) => (
            <div key={x.t}><x.i className="mx-auto mb-2 h-6 w-6 text-gold-300" aria-hidden /><p className="font-display tracking-wide text-gold-100">{x.t}</p><p className="mx-auto mt-1 max-w-[180px] text-cream-200/85">{x.d}</p></div>
          ))}
        </div>
      </Section>

      <Section className="py-4">
        <div className="relative overflow-hidden bg-onyx-300 px-6 py-8 text-cream-100 sm:px-12 sm:py-10">
          <div className="relative z-10 max-w-md">
            <p className="font-deva text-gold-200">उपहार</p>
            <h2 className="font-display text-2xl tracking-wide text-gold-100 sm:text-3xl">Make it a gift</h2>
            <p className="mt-2 text-sm text-cream-100/90 sm:text-base">Choose gift wrap and add a personal message at checkout. We include it with the parcel.</p>
            <a href={shopHref()} className="mt-5 inline-flex min-h-11 items-center border border-gold-400 px-6 text-[11px] font-medium uppercase tracking-[0.2em] text-gold-100 hover:bg-white/10">Choose a gift</a>
          </div>
          <Gift className="absolute -right-4 -top-4 h-44 w-44 text-gold-400/15 sm:right-8 sm:h-60 sm:w-60" aria-hidden />
        </div>
      </Section>

      <About />

      <Section className="py-12">
        <SectionHead title="Visit our store" deva="हमारी दुकान" sub="See the pieces in person, try them on and get help choosing." />
        <div className="frame-gold mx-auto flex max-w-3xl flex-col gap-4 rounded-md bg-cream-50 p-6 sm:flex-row sm:items-start sm:justify-between">
          <p className="flex items-start gap-3 text-[15px] text-ink"><MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-500" aria-hidden />{config.address || SHOP_DEFAULTS.address}</p>
          <div className="flex flex-col gap-2 text-[15px]">
            <a href={`tel:+91${config.support_phone || SHOP_DEFAULTS.support_phone}`} className="inline-flex min-h-11 items-center gap-2 text-onyx-300 hover:underline"><Phone className="h-4 w-4" aria-hidden />{config.support_phone || SHOP_DEFAULTS.support_phone}</a>
            {config.map_url && <a href={config.map_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-onyx-300 underline underline-offset-4">Open in Maps</a>}
          </div>
        </div>
      </Section>
    </>
  );
}
