import { useState } from 'react';
import { useProducts } from '@/context/ProductsContext';
import { ProductCard } from '@/components/ProductCard';
import { SkeletonCard } from '@/components/SkeletonCard';

const CATEGORIES = ['All', 'Necklace', 'Earrings', 'Bangles', 'Rings', 'Bracelet', 'Bridal', 'Anklets'];

export function ProductGrid() {
  const { products, loading, error, refetch: fetchProducts } = useProducts();
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered =
    activeCategory === 'All'
      ? products
      : products.filter((p) => p.category === activeCategory);

  const availableCategories = CATEGORIES.filter(
    (cat) => cat === 'All' || products.some((p) => p.category === cat),
  );

  return (
    <section id="collections" className="bg-cream-100 py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl text-onyx-300 sm:text-4xl lg:text-[2.75rem] text-balance">
            The collection
          </h2>
          <p className="mt-4 text-base leading-7 text-onyx-100">
            Gold-plated pieces for brides, festivals and everyday wear. Tap any piece to see it up close.
          </p>
        </div>

        {/* Categories as plain tabs: the active one carries a gold rule */}
        <div className="mt-10 sm:mt-12 border-b border-gold-400/30">
          <div role="tablist" aria-label="Jewellery categories" className="flex gap-7 overflow-x-auto scrollbar-hide justify-start sm:justify-center">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
                className={`relative whitespace-nowrap pb-3 pt-1 text-[15px] transition-colors ${
                  activeCategory === cat ? 'text-onyx-300' : 'text-onyx-100 hover:text-onyx-300'
                }`}
              >
                {cat}
                {activeCategory === cat && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gold-400" />}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" className="py-12 text-center">
            <p className="text-base text-onyx-300">{error}</p>
            <button onClick={() => void fetchProducts()} className="mt-4 min-h-11 border border-onyx-300 px-6 text-sm font-medium text-onyx-300 hover:bg-onyx-300 hover:text-gold-100 transition-colors">
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 && !error ? (
          <div className="py-16 text-center">
            <p className="font-display text-xl text-onyx-300">Nothing in {activeCategory === 'All' ? 'the collection' : activeCategory} yet</p>
            <p className="mt-2 text-onyx-100">New pieces are added regularly. Try another category.</p>
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-16">
            {filtered.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        )}
      </div>
    </section>
  );
}
