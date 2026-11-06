import type { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { formatINR, calculateDiscount } from '@/utils/format';

interface ProductCardProps {
  product: Product;
}

const PLACEHOLDER =
  'https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart, setCartOpen } = useCart();
  const hasDiscount = product.original_price > product.selling_price;
  const discount = product.discount_percent || calculateDiscount(product.original_price, product.selling_price);
  const outOfStock = product.stock <= 0;
  const lowStock = product.stock > 0 && product.stock <= 5;

  const openGallery = () => window.dispatchEvent(new CustomEvent('open-lightbox', { detail: product }));

  const quickAdd = () => {
    if (outOfStock) return;
    addToCart(product);
    setCartOpen(true);
  };

  return (
    <article className="group flex flex-col">
      {/* The piece sits in an arched niche, like a jeweller's display window */}
      <button
        type="button"
        onClick={openGallery}
        aria-label={`View ${product.title} larger`}
        className="arch arch-outline relative block aspect-[4/5] w-full overflow-hidden bg-cream-50 text-left focus-visible:outline-offset-[7px]"
      >
        <img
          src={product.image_url || PLACEHOLDER}
          alt={product.title}
          loading="lazy"
          className={`h-full w-full object-cover ${outOfStock ? 'opacity-50 grayscale' : ''}`}
        />
        {hasDiscount && discount > 0 && !outOfStock && (
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-onyx-300 px-3 py-1 text-xs font-medium text-gold-200">
            {discount}% off
          </span>
        )}
      </button>

      <div className="mt-6 flex flex-1 flex-col text-center">
        <p className="text-xs text-onyx-100">{product.category}</p>
        <h3 className="mt-1 font-display text-lg leading-snug text-onyx-300 line-clamp-2">{product.title}</h3>

        <p className="mt-2 flex items-baseline justify-center gap-2">
          <span className="font-display text-xl text-onyx-300">{formatINR(product.selling_price)}</span>
          {hasDiscount && (
            <span className="text-sm text-onyx-100 line-through">{formatINR(product.original_price)}</span>
          )}
        </p>

        <p className="mb-4 mt-1 min-h-[1rem] text-xs font-medium text-accent-wine">{lowStock ? `Only ${product.stock} left` : ''}</p>

        <button
          type="button"
          onClick={quickAdd}
          disabled={outOfStock}
          className="mt-auto min-h-11 w-full border border-onyx-300 px-4 text-sm font-medium text-onyx-300 transition-colors hover:bg-onyx-300 hover:text-gold-100 disabled:cursor-not-allowed disabled:border-onyx-100/30 disabled:text-onyx-100/60 disabled:hover:bg-transparent"
        >
          {outOfStock ? 'Sold out' : 'Add to bag'}
        </button>
      </div>
    </article>
  );
}
