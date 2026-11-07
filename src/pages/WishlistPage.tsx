import { Heart } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { Section, SectionHead } from '@/components/ornaments';
import { useProducts } from '@/context/ProductsContext';
import { useWishlist } from '@/context/WishlistContext';
import { shopHref } from '@/lib/router';

export function WishlistPage() {
  const { products, loading } = useProducts();
  const wish = useWishlist();
  const saved = products.filter((p) => wish.has(p.id));
  return (
    <Section className="py-10">
      <SectionHead title="Your wishlist" deva="पसंदीदा" sub="Pieces you saved. They stay on this device and in your account." />
      {!loading && saved.length === 0 ? (
        <div className="py-12 text-center"><Heart className="mx-auto h-10 w-10 text-gold-500" aria-hidden /><p className="mt-3 text-ink/75">Nothing saved yet. Tap the heart on any piece to keep it here.</p>
          <a href={shopHref()} className="mt-6 inline-flex min-h-12 items-center rounded bg-onyx-300 px-8 font-display text-sm tracking-[0.12em] text-gold-200">BROWSE THE COLLECTION</a></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">{saved.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
      )}
    </Section>
  );
}
