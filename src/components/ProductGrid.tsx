import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/types';
import { ProductCard } from '@/components/ProductCard';
import { SkeletonCard } from '@/components/SkeletonCard';

const CATEGORIES = ['All', 'Necklace', 'Earrings', 'Bangles', 'Rings', 'Bracelet', 'Bridal', 'Anklets'];

export function ProductGrid() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;
      setProducts(data ?? []);
    } catch {
      setError('Could not load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered =
    activeCategory === 'All'
      ? products
      : products.filter((p) => p.category === activeCategory);

  const availableCategories = CATEGORIES.filter(
    (cat) => cat === 'All' || products.some((p) => p.category === cat),
  );

  return (
    <section id="collections" className="py-12 sm:py-20 lg:py-24 bg-cream-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-8 sm:mb-14">
          <p className="text-xs font-semibold text-gold-500 tracking-widest uppercase mb-3">
            Curated Collection
          </p>
          <h2 className="font-display text-2xl sm:text-4xl lg:text-5xl font-bold text-onyx-300">
            Our Jewellery Collections
          </h2>
          <p className="mt-4 text-sm sm:text-base text-onyx-300 max-w-2xl mx-auto leading-relaxed">
            Each piece is crafted with precision and care, offering you the beauty
            of fine jewellery at accessible prices.
          </p>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 sm:mb-10">
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${
                activeCategory === cat
                  ? 'gold-gradient text-cream-100 shadow-gold'
                  : 'bg-cream-200 text-onyx-300 hover:bg-gold-50 border border-gold-200/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="text-center py-12">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 inline-block">
              {error}
            </p>
            <button
              onClick={fetchProducts}
              className="block mx-auto mt-4 text-sm text-gold-500 font-medium hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Products */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-onyx-300">No products in this category yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
