import { Heart, ShoppingBag } from 'lucide-react';
import type { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { formatINR, calculateDiscount } from '@/utils/format';
import { PLACEHOLDER_IMG } from '@/utils/images';
import { go } from '@/lib/router';

/** Jewel-toned arch panel (teal / maroon alternating) so gold pieces always have strong contrast. */
export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { addToCart, setCartOpen } = useCart();
  const wish = useWishlist();
  const hasDiscount = product.original_price > product.selling_price;
  const discount = product.discount_percent || calculateDiscount(product.original_price, product.selling_price);
  const out = product.stock <= 0;
  const low = product.stock > 0 && product.stock <= 5;
  const saved = wish.has(product.id);
  const maroon = index % 3 === 1;

  return (
    <article className="frame-gold relative flex flex-col rounded-md bg-cream-50">
      <div className={`relative mx-2 mt-2 overflow-hidden rounded-t-full ${maroon ? 'jewel-panel-maroon' : 'jewel-panel'}`}>
        <a
          href={`#/product/${product.id}`}
          aria-label={`View ${product.title}`}
          className="block aspect-[1/1.08] w-full"
        >
          <img
            src={product.image_url || PLACEHOLDER_IMG}
            alt={product.title}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-500 hover:scale-105 ${out ? 'opacity-50 grayscale' : ''}`}
          />
        </a>
        {hasDiscount && discount > 0 && !out && (
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-maroon-500 px-2.5 py-0.5 text-[11px] font-medium text-gold-200">
            {discount}% off
          </span>
        )}
        {out && (
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink/80 px-2.5 py-0.5 text-[11px] font-medium text-cream-100">
            Sold out
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => wish.toggle(product.id)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
        className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-cream-50/90 text-maroon-500 shadow-sm backdrop-blur transition-transform active:scale-90"
      >
        <Heart className="h-[18px] w-[18px]" fill={saved ? 'currentColor' : 'none'} />
      </button>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-3 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-gold-600">{product.category}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-[14px] leading-5 text-ink sm:text-[15px]">
          <a href={`#/product/${product.id}`} className="hover:text-onyx-200">{product.title}</a>
        </h3>
        <p className="mt-1 flex items-baseline justify-center gap-2">
          <span className="text-base font-semibold text-ink sm:text-lg">{formatINR(product.selling_price)}</span>
          {hasDiscount && <span className="text-xs text-ink/55 line-through">{formatINR(product.original_price)}</span>}
        </p>
        <p className="min-h-[1.1rem] text-[11px] font-medium text-maroon-500">{low ? `Only ${product.stock} left` : ''}</p>
        <div className="mt-auto grid gap-1.5 pt-2">
          <button
            type="button"
            onClick={() => go(`/product/${product.id}`)}
            className="min-h-10 rounded border border-onyx-300 text-xs font-medium text-onyx-300 transition-colors hover:bg-onyx-300 hover:text-gold-100"
          >
            View details
          </button>
          <button
            type="button"
            disabled={out}
            onClick={() => { addToCart(product); setCartOpen(true); }}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-onyx-300 font-display text-xs tracking-wider text-gold-200 transition-colors hover:bg-onyx-200 disabled:cursor-not-allowed disabled:bg-ink/25 disabled:text-ink/60"
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
            {out ? 'SOLD OUT' : 'ADD TO BAG'}
          </button>
        </div>
      </div>
    </article>
  );
}
