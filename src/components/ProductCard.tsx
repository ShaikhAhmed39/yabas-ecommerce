import { productHref } from '@/lib/router';
import { Heart, ShoppingBag } from 'lucide-react';
import type { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { formatINR, calculateDiscount } from '@/utils/format';
import { PLACEHOLDER_IMG } from '@/utils/images';

/** Jewel-toned arch panel (teal / maroon alternating) so gold pieces always have strong contrast. */
export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { addToCart, setCartOpen } = useCart();
  const wish = useWishlist();
  const hasDiscount = product.original_price > product.selling_price;
  const discount = product.discount_percent || calculateDiscount(product.original_price, product.selling_price);
  const out = product.stock <= 0;
  const low = product.stock > 0 && product.stock <= 5;
  const saved = wish.has(product.id);
  void index;

  return (
    <article className="relative flex flex-col">
      <div className="relative overflow-hidden jewel-panel">
        <a href={productHref(product)} aria-label={`View ${product.title}`} className="block aspect-[4/5] w-full">
          <img
            src={product.image_url || PLACEHOLDER_IMG}
            alt={product.title}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-700 hover:scale-105 ${out ? 'opacity-50 grayscale' : ''}`}
          />
        </a>
        {hasDiscount && discount > 0 && !out && (
          <span className="pointer-events-none absolute left-0 top-3 bg-white px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink">{discount}% off</span>
        )}
        {out && (
          <span className="pointer-events-none absolute left-0 top-3 bg-onyx-300 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-white">Sold out</span>
        )}
        <button
          type="button"
          onClick={() => wish.toggle(product.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink shadow-sm transition-transform active:scale-90"
        >
          <Heart className="h-[18px] w-[18px]" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-0.5 pb-3 pt-3">
        <p className="text-[10.5px] uppercase tracking-[0.18em] text-gold-600">{product.category}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.6rem] font-display text-[18px] leading-[1.2] text-ink sm:text-[20px]">
          <a href={productHref(product)}>{product.title}</a>
        </h3>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-[15px] font-medium text-ink">{formatINR(product.selling_price)}</span>
          {hasDiscount && <span className="text-xs text-ink/50 line-through">{formatINR(product.original_price)}</span>}
        </p>
        <p className="min-h-[1.1rem] text-[11px] font-medium text-maroon-500">{low ? `Only ${product.stock} left` : ''}</p>
        <button
          type="button"
          disabled={out}
          onClick={() => { addToCart(product); setCartOpen(true); }}
          className="mt-2 inline-flex min-h-11 items-center justify-between border-b border-ink text-left text-[11px] font-medium uppercase tracking-[0.18em] text-ink transition-colors hover:text-gold-600 disabled:cursor-not-allowed disabled:border-ink/25 disabled:text-ink/40"
        >
          {out ? 'Sold out' : 'Add to bag'}
          <ShoppingBag className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}
