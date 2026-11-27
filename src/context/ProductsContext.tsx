import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/types';
import { imgVariant, productImages } from '@/utils/images';
import { prefetchPhotos, readCache, saveCache } from '@/lib/offline';

interface ProductsContextValue {
  products: Product[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const ProductsContext = createContext<ProductsContextValue | undefined>(undefined);

/** Loads the catalogue ONCE for the whole app (grid, gallery and cart all share it) and refreshes when the tab regains focus. */
export function ProductsProvider({ children }: { children: ReactNode }) {
  // the last catalogue seen on this phone, so the shop still shows every product with no internet
  const cached = useRef(readCache<Product[]>('products'));
  const [products, setProducts] = useState<Product[]>(cached.current ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastLoad = useRef(0);

  const refetch = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      const list = (data ?? []) as Product[];
      setProducts(list);
      saveCache('products', list);
      prefetchPhotos(list.flatMap((p) => productImages(p).flatMap((u) => [imgVariant(u, 'sm'), imgVariant(u, 'md')])));
      cached.current = list;
      setError(null);
      lastLoad.current = Date.now();
    } catch {
      // with a saved catalogue we keep showing it quietly; the offline banner explains
      if (!cached.current?.length) setError('Could not load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    // Stock and prices change: refresh when the customer comes back to the tab (at most once a minute).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60_000) void refetch();
    };
    const onOnline = () => void refetch();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onOnline); };
  }, [refetch]);

  return <ProductsContext.Provider value={{ products, loading, error, refetch }}>{children}</ProductsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
