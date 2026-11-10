import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Section, SectionHead } from '@/components/ornaments';
import { useProducts } from '@/context/ProductsContext';
import { go, shopHref } from '@/lib/router';
import type { Product } from '@/types';

const SORTS = [
  { v: 'new', l: 'Newest first' },
  { v: 'low', l: 'Price: low to high' },
  { v: 'high', l: 'Price: high to low' },
  { v: 'off', l: 'Biggest discount' },
] as const;
const BANDS = [
  { v: 'any', l: 'Any price', test: () => true },
  { v: 'u500', l: 'Under ₹500', test: (p: Product) => p.selling_price < 500 },
  { v: 'u1000', l: '₹500 – ₹1,000', test: (p: Product) => p.selling_price >= 500 && p.selling_price <= 1000 },
  { v: 'u2000', l: '₹1,000 – ₹2,000', test: (p: Product) => p.selling_price > 1000 && p.selling_price <= 2000 },
  { v: 'o2000', l: 'Above ₹2,000', test: (p: Product) => p.selling_price > 2000 },
] as const;

const haystack = (p: Product) =>
  [p.title, p.category, p.sub_category, p.occasion_wear, p.material_type, p.polish_finish, p.description].join(' ').toLowerCase();

export function ShopPage({ category, q }: { category: string; q: string }) {
  const { products, loading, error, refetch } = useProducts();
  const [sort, setSort] = useState<(typeof SORTS)[number]['v']>('new');
  const [band, setBand] = useState<(typeof BANDS)[number]['v']>('any');
  const [inStock, setInStock] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(q);

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const test = BANDS.find((b) => b.v === band)!.test;
    const out = products.filter((p) =>
      (category === 'All' || p.category === category) &&
      (!inStock || p.stock > 0) && test(p) &&
      terms.every((t) => haystack(p).includes(t)));
    const disc = (p: Product) => (p.original_price > 0 ? (p.original_price - p.selling_price) / p.original_price : 0);
    return [...out].sort((a, b) =>
      sort === 'low' ? a.selling_price - b.selling_price
        : sort === 'high' ? b.selling_price - a.selling_price
          : sort === 'off' ? disc(b) - disc(a)
            : +new Date(b.created_at) - +new Date(a.created_at));
  }, [products, category, q, sort, band, inStock]);

  const activeFilters = (band !== 'any' ? 1 : 0) + (inStock ? 1 : 0);
  const sel = 'h-11 w-full rounded-md border border-gold-500/50 bg-white px-3 text-sm text-ink focus:border-gold-500 focus:outline-none';

  const filterPanel = (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="block text-sm text-ink/80">Sort by
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${sel} mt-1`}>{SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
      </label>
      <label className="block text-sm text-ink/80">Price
        <select value={band} onChange={(e) => setBand(e.target.value as typeof band)} className={`${sel} mt-1`}>{BANDS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</select>
      </label>
      <label className="flex min-h-11 items-center gap-3 self-end text-sm text-ink">
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-5 w-5 accent-[#16130F]" /> In stock only
      </label>
    </div>
  );

  return (
    <div className="pb-6">
      <div className="jaali-teal py-8 text-center text-cream-100">
        <p className="font-deva text-gold-200">संग्रह</p>
        <h1 className="font-display text-2xl tracking-[0.1em] text-gold-100 sm:text-4xl">{q ? `Results for “${q}”` : category === 'All' ? 'The Collection' : category}</h1>
      </div>
      <div className="scallop-teal" aria-hidden="true" />

      <Section className="pt-6">
        <form onSubmit={(e) => { e.preventDefault(); go(shopHref(category, draft.trim()).slice(1)); }} role="search" className="relative mx-auto mb-4 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" aria-hidden />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} type="search" aria-label="Search the collection" placeholder="Search by name, occasion or material"
            className="h-12 w-full rounded-md border border-gold-500/50 bg-white pl-10 pr-10 text-[15px] focus:border-gold-500 focus:outline-none" />
          {q && <button type="button" aria-label="Clear search" onClick={() => { setDraft(''); go(shopHref(category).slice(1)); }} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-ink/60"><X className="h-4 w-4" /></button>}
        </form>

        <div role="tablist" aria-label="Categories" className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide sm:flex-wrap sm:justify-center">
          {categories.map((c) => (
            <button key={c} role="tab" aria-selected={category === c} onClick={() => go(shopHref(c, q).slice(1))}
              className={`min-h-10 flex-shrink-0 rounded-full border px-5 font-display text-xs tracking-[0.06em] transition-colors ${category === c ? 'border-onyx-300 bg-onyx-300 text-gold-200' : 'border-gold-500 bg-cream-50 text-onyx-300 hover:bg-cream-200'}`}>{c}</button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-y border-gold-500/25 py-3">
          <p className="text-sm text-ink/70" aria-live="polite">{loading ? 'Loading…' : `${list.length} piece${list.length === 1 ? '' : 's'}`}</p>
          <button onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className="inline-flex min-h-10 items-center gap-2 rounded border border-onyx-300 px-4 text-sm text-onyx-300">
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Sort &amp; filter{activeFilters > 0 && <span className="grid h-5 w-5 place-items-center rounded-full bg-onyx-300 text-[11px] text-white">{activeFilters}</span>}
          </button>
        </div>
        {filtersOpen && <div className="border-b border-gold-500/25 bg-cream-50 p-4">{filterPanel}</div>}

        {error && <div role="alert" className="py-12 text-center"><p>{error}</p><button onClick={() => void refetch()} className="mt-4 min-h-11 rounded border border-onyx-300 px-6 text-sm text-onyx-300">Try again</button></div>}

        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">{Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : list.length === 0 && !error ? (
          <div className="py-16 text-center">
            <SectionHead title="Nothing found" sub="Try another category, remove a filter or search for something simpler." />
            <button onClick={() => { setBand('any'); setInStock(false); go('/shop'); }} className="min-h-11 rounded bg-onyx-300 px-8 font-display text-xs tracking-[0.12em] text-gold-200">CLEAR EVERYTHING</button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {list.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </Section>
    </div>
  );
}
