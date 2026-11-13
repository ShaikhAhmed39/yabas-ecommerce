import { go, productHref } from '@/lib/router';
import { useEffect } from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { formatINR } from '@/utils/format';

interface CartDrawerProps {
  onCheckout: () => void;
}

export function CartDrawer({ onCheckout }: CartDrawerProps) {
  const { items, isCartOpen, setCartOpen, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();

  useEffect(() => {
    if (!isCartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCartOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isCartOpen, setCartOpen]);

  if (!isCartOpen) return null;

  const stepBtn =
    'w-9 h-9 border border-onyx-300/30 flex items-center justify-center text-onyx-300 hover:bg-onyx-300 hover:text-gold-100 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-onyx-300';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-onyx-500/60 animate-fade-in" onClick={() => setCartOpen(false)} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-[440px] flex-col bg-cream-100 shadow-medium animate-slide-in-right"
      >
        <div className="flex items-center justify-between border-b border-gold-400/30 px-5 py-4">
          <h2 className="font-display text-2xl text-onyx-300">
            Your bag{totalItems > 0 && <span className="ml-2 text-base text-onyx-100">({totalItems})</span>}
          </h2>
          <button onClick={() => setCartOpen(false)} aria-label="Close bag" className="p-2 text-onyx-300 hover:text-gold-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="flex h-24 w-20 items-end rounded-t-full justify-center border border-gold-400/50 pb-5">
              <ShoppingBag className="h-6 w-6 text-gold-500" aria-hidden />
            </div>
            <p className="mt-6 font-display text-xl text-onyx-300">Your bag is empty</p>
            <p className="mt-2 text-onyx-100">Pick a piece from the collection and it will wait for you here.</p>
            <button onClick={() => { setCartOpen(false); go('/shop'); }} className="mt-6 min-h-11 rounded bg-onyx-300 px-8 text-sm font-medium text-gold-100 hover:bg-onyx-200 transition-colors">
              Browse the collection
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {items.map((item) => (
                <li key={item.product.id} className="flex gap-4 border-b border-gold-400/20 pb-5 last:border-0">
                  <div className="jewel-panel h-24 w-[76px] flex-shrink-0 overflow-hidden rounded-t-full border border-gold-500">
                    <img src={item.product.image_url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-[15px] leading-snug text-ink line-clamp-2"><a href={productHref(item.product)} onClick={() => setCartOpen(false)}>{item.product.title}</a></h3>
                        <p className="mt-0.5 text-sm text-onyx-100">{formatINR(item.product.selling_price)} each</p>
                      </div>
                      <button onClick={() => removeFromCart(item.product.id)} aria-label={`Remove ${item.product.title}`} className="p-1.5 text-onyx-100 hover:text-accent-wine transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex items-center">
                        <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label="Decrease quantity" className={stepBtn}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-10 text-center text-sm font-medium text-onyx-300" aria-live="polite">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} disabled={item.quantity >= item.product.stock} aria-label="Increase quantity" className={stepBtn}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="font-display text-lg text-onyx-300">{formatINR(item.product.selling_price * item.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3 border-t border-gold-400/30 bg-cream-50 px-5 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-onyx-100">Subtotal</span>
                <span className="font-display text-2xl text-onyx-300">{formatINR(totalPrice)}</span>
              </div>
              <p className="text-sm text-onyx-100">Delivery charges and coupons are applied at checkout. You will sign in before paying.</p>
              <button onClick={onCheckout} className="min-h-12 w-full rounded bg-onyx-300 font-display text-sm tracking-[0.12em] text-gold-100 hover:bg-onyx-200 transition-colors">
                CHECKOUT
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
