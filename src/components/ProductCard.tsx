import { ShoppingBag, ZoomIn } from 'lucide-react';
import type { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { formatINR, calculateDiscount } from '@/utils/format';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart, setCartOpen } = useCart();
  const discount = product.discount_percent || calculateDiscount(product.original_price, product.selling_price);
  const outOfStock = product.stock <= 0;
  const hasDiscount = product.original_price > product.selling_price;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (outOfStock) return;
    addToCart(product);
    setCartOpen(true);
  };

  return (
    <div
      className="group bg-cream-50 rounded-2xl overflow-hidden shadow-soft hover:shadow-medium transition-all duration-400 cursor-pointer flex flex-col w-full"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('open-lightbox', { detail: product }));
      }}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-cream-200">
        <img
          src={product.image_url || 'https://images.pexels.com/photos/8891961/pexels-photo-8891961.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
        />
        {/* Discount badge */}
        {hasDiscount && discount > 0 && (
          <span className="absolute top-2 left-2 bg-gold-400 text-cream-100 text-[10px] font-bold px-2 py-1 rounded-full shadow-soft">
            {discount}% OFF
          </span>
        )}
        {/* Stock badge */}
        {outOfStock && (
          <span className="absolute top-2 right-2 bg-onyx-300/80 text-cream-100 text-[10px] font-bold px-2 py-1 rounded-full">
            Out of Stock
          </span>
        )}
        {product.stock > 0 && product.stock <= 5 && (
          <span className="absolute top-2 right-2 bg-accent-wine/90 text-cream-100 text-[10px] font-bold px-2 py-1 rounded-full">
            Only {product.stock} left
          </span>
        )}
        {/* Zoom hint */}
        <div className="absolute inset-0 bg-onyx-300/0 group-hover:bg-onyx-300/10 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="bg-cream-100/90 rounded-full p-3 shadow-medium">
            <ZoomIn className="h-5 w-5 text-onyx-300" />
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <p className="text-[10px] text-gold-500 font-semibold uppercase tracking-wider mb-1 text-onyx-300">
          {product.category}
        </p>
        <h3 className="font-serif text-sm sm:text-base font-semibold text-onyx-300 leading-snug line-clamp-2">
          {product.title}
        </h3>

        {/* Specs */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {product.material_type && (
            <span className="text-[10px] text-onyx-300 bg-cream-200 px-2 py-0.5 rounded-full font-medium">
              {product.material_type}
            </span>
          )}
          {product.polish_finish && (
            <span className="text-[10px] text-onyx-300 bg-cream-200 px-2 py-0.5 rounded-full font-medium">
              {product.polish_finish}
            </span>
          )}
        </div>

        {/* Price — strike-through original + bold selling */}
        <div className="mt-3 flex items-baseline gap-2 flex-wrap">
          {hasDiscount && (
            <span className="text-xs sm:text-sm text-onyx-100 line-through decoration-onyx-100/60 font-medium">
              {formatINR(product.original_price)}
            </span>
          )}
          <span className="font-display text-lg sm:text-xl font-bold text-onyx-300">
            {formatINR(product.selling_price)}
          </span>
        </div>

        {/* Quick add */}
        <button
          onClick={handleQuickAdd}
          disabled={outOfStock}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-medium transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed
            bg-cream-200 text-onyx-300 hover:gold-gradient hover:text-cream-100 border border-gold-200/40"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          {outOfStock ? 'Out of Stock' : 'Add to Bag'}
        </button>
      </div>
    </div>
  );
}
