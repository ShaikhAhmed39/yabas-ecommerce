import { Home, LayoutGrid, Heart, Package, ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import type { Route } from '@/lib/router';

/** Thumb-reach navigation for phones. Hidden on desktop and on the checkout page (which has its own pay bar). */
export function BottomNav({ route }: { route: Route }) {
  const { totalItems, setCartOpen } = useCart();
  const wish = useWishlist();
  if (route.name === 'product') return null; // the product page has its own add-to-bag bar
  const item = (active: boolean) =>
    `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] transition-colors ${active ? 'text-ink' : 'text-ink/55'}`;
  return (
    <nav aria-label="Quick navigation" className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-cream-400 bg-cream-100 lg:hidden">
      <a href="/" className={item(route.name === 'home')}><Home className="h-5 w-5" />Home</a>
      <a href="/shop" className={item(route.name === 'shop')}><LayoutGrid className="h-5 w-5" />Shop</a>
      <a href="/wishlist" className={item(route.name === 'wishlist')}>
        <Heart className="h-5 w-5" />Wishlist
        {wish.ids.size > 0 && <span className="absolute right-[28%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-onyx-300 px-1 text-[9px] font-semibold text-white">{wish.ids.size}</span>}
      </a>
      <a href="/orders" className={item(route.name === 'orders' || route.name === 'track')}><Package className="h-5 w-5" />Orders</a>
      <button onClick={() => setCartOpen(true)} className={item(false)} aria-label="Open bag">
        <ShoppingBag className="h-5 w-5" />Bag
        {totalItems > 0 && <span className="absolute right-[28%] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-onyx-300 px-1 text-[9px] font-semibold text-white">{totalItems}</span>}
      </button>
    </nav>
  );
}
