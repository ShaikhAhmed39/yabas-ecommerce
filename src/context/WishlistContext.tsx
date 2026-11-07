import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface Ctx {
  ids: Set<string>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
}
const WishlistContext = createContext<Ctx | undefined>(undefined);
const KEY = 'yabas-wishlist-v1';

function load(): string[] {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** Saved pieces live in this browser, and are also synced to the account (or guest session) so they follow the customer. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(() => new Set(load()));
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
  }, [ids]);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || syncedFor.current === userId) return;
    syncedFor.current = userId;
    void (async () => {
      const { data } = await supabase.from('wishlist_items').select('product_id');
      const server = new Set((data ?? []).map((r: { product_id: string }) => r.product_id));
      const local = load();
      const missing = local.filter((id) => !server.has(id));
      if (missing.length) {
        await supabase.from('wishlist_items').upsert(missing.map((product_id) => ({ user_id: userId, product_id })), { onConflict: 'user_id,product_id', ignoreDuplicates: true });
      }
      setIds(new Set([...server, ...local]));
    })().catch(() => { /* wishlist stays local */ });
  }, [userId]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id); else next.delete(id);
      if (userId) {
        const op = adding
          ? supabase.from('wishlist_items').upsert({ user_id: userId, product_id: id }, { onConflict: 'user_id,product_id', ignoreDuplicates: true })
          : supabase.from('wishlist_items').delete().eq('user_id', userId).eq('product_id', id);
        void Promise.resolve(op).catch(() => { /* local copy still saved */ });
      }
      return next;
    });
  }, [userId]);

  const value = useMemo(() => ({ ids, has: (id: string) => ids.has(id), toggle }), [ids, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
