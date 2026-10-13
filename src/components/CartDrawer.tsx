import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { formatINR } from '@/utils/format';

interface CartDrawerProps {
  onCheckout: () => void;
}

export function CartDrawer({ onCheckout }: CartDrawerProps) {
  const { items, isCartOpen, setCartOpen, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();

  if (!isCartOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-onyx-500/40 backdrop-blur-sm animate-fade-in"
        onClick={() => setCartOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[420px] bg-cream-100 shadow-medium animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gold-200/40 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingBag className="h-5 w-5 text-gold-500 flex-shrink-0" />
            <h3 className="font-display text-base sm:text-lg font-bold text-onyx-300 truncate">
              Your Bag ({totalItems})
            </h3>
          </div>
          <button
            onClick={() => setCartOpen(false)}
            className="p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300 flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-cream-200 flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-gold-300" />
            </div>
            <p className="font-serif text-lg text-onyx-300 font-semibold">Your bag is empty</p>
            <p className="text-sm text-onyx-300 mt-2 mb-6">
              Add some beautiful pieces to your collection.
            </p>
            <button
              onClick={() => setCartOpen(false)}
              className="px-6 py-2.5 gold-gradient text-cream-100 font-medium rounded-full shadow-gold hover:scale-[1.02] transition-transform"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 scrollbar-hide">
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex gap-3 bg-cream-50 rounded-xl p-3 shadow-soft"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0 bg-cream-200">
                      <img
                        src={item.product.image_url}
                        alt={item.product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-serif text-sm font-semibold text-onyx-300 line-clamp-1">
                        {item.product.title}
                      </h4>
                      <p className="text-xs text-onyx-300 mt-0.5">{item.product.category}</p>
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <span className="font-display text-sm sm:text-base font-bold text-onyx-300 whitespace-nowrap">
                          {formatINR(item.product.selling_price * item.quantity)}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 rounded-full bg-cream-200 hover:bg-gold-100 flex items-center justify-center transition-colors text-onyx-300"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-sm font-medium text-onyx-300 w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            disabled={item.quantity >= item.product.stock}
                            className="w-7 h-7 rounded-full bg-cream-200 hover:bg-gold-100 flex items-center justify-center transition-colors text-onyx-300 disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.product.id)}
                            className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors text-onyx-100 hover:text-red-600 ml-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gold-200/40 px-4 sm:px-5 py-4 space-y-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-onyx-300">Subtotal</span>
                <span className="font-display text-lg sm:text-xl font-bold text-onyx-300">
                  {formatINR(totalPrice)}
                </span>
              </div>
              <p className="text-xs text-onyx-300">
                Shipping calculated at checkout. Login required to proceed.
              </p>
              <button
                onClick={onCheckout}
                className="w-full flex items-center justify-center gap-2 py-3.5 gold-gradient text-cream-100 font-medium rounded-full shadow-gold hover:scale-[1.01] transition-transform"
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
