import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product, CartItem } from '@/types';
import { useProducts } from '@/context/ProductsContext';

interface CartContextValue {
  items: CartItem[];
  addToCart: (product: Product, qty?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = 'yabas-cart-v1';
const MAX_PER_PRODUCT = 20; // the server enforces the same limit

function loadSaved(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        typeof i === 'object' && i !== null && typeof (i as CartItem).quantity === 'number' &&
        typeof (i as CartItem).product?.id === 'string',
    );
  } catch {
    return []; // private mode / blocked storage: the cart just works in memory
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products } = useProducts();
  const [items, setItems] = useState<CartItem[]>(loadSaved);
  const [isCartOpen, setCartOpen] = useState(false);

  // Remember the cart across refreshes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable: ignore */
    }
  }, [items]);

  // A saved cart can be days old. Refresh price/stock from the live catalogue and drop what is gone or sold out.
  useEffect(() => {
    if (!products.length) return;
    setItems((prev) => {
      const next = prev.flatMap((i) => {
        const fresh = products.find((p) => p.id === i.product.id);
        if (!fresh || fresh.stock <= 0) return [];
        return [{ product: fresh, quantity: Math.max(1, Math.min(i.quantity, fresh.stock, MAX_PER_PRODUCT)) }];
      });
      const same = next.length === prev.length && next.every((n, idx) =>
        n.quantity === prev[idx].quantity && n.product.selling_price === prev[idx].product.selling_price && n.product.stock === prev[idx].product.stock);
      return same ? prev : next;
    });
  }, [products]);

  const addToCart = (product: Product, qty = 1) => {
    const limit = Math.min(product.stock, MAX_PER_PRODUCT);
    if (limit <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: Math.min(i.quantity + qty, limit) } : i,
        );
      }
      return [...prev, { product, quantity: Math.min(qty, limit) }];
    });
  };

  const removeFromCart = (productId: string) => setItems((prev) => prev.filter((i) => i.product.id !== productId));

  const updateQuantity = (productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, quantity: Math.max(1, Math.min(qty, i.product.stock, MAX_PER_PRODUCT)) }
          : i,
      ),
    );
  };

  const clearCart = () => setItems([]);

  const { totalItems, totalPrice } = useMemo(() => ({
    totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
    totalPrice: items.reduce((sum, i) => sum + i.product.selling_price * i.quantity, 0),
  }), [items]);

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice, isCartOpen, setCartOpen }}
    >
      {children}
    </CartContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
