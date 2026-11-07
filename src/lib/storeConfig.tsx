import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

/** Business details and charges the owner edits in Admin > Store settings. All values arrive as text. */
export type StoreConfig = Partial<Record<
  | 'legal_name' | 'address' | 'support_email' | 'support_phone' | 'support_hours' | 'whatsapp_number'
  | 'grievance_name' | 'grievance_email' | 'grievance_phone' | 'gstin' | 'website_url' | 'map_url'
  | 'instagram_url' | 'facebook_url' | 'processing_time' | 'delivery_estimate' | 'return_shipping_rule'
  | 'policy_effective_date' | 'shipping_fee' | 'free_shipping_threshold' | 'gift_wrap_fee'
  | 'scratch_enabled' | 'scratch_min_order' | 'store_pickup_enabled',
  string
>>;

interface Ctx {
  config: StoreConfig;
  loaded: boolean;
  refresh: () => Promise<void>;
  num: (key: keyof StoreConfig) => number;
  /** wa.me link for the owner's number, optionally with a pre-filled message. null when no number is set yet. */
  whatsappLink: (message?: string) => string | null;
}

const StoreConfigContext = createContext<Ctx | undefined>(undefined);

export function digitsOnly(v: string | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

export function StoreConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<StoreConfig>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    try {
      const { data, error } = await supabase.rpc('get_store_config');
      if (!error && data && typeof data === 'object') setConfig(data as StoreConfig);
    } catch {
      /* the store works with empty settings */
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const value = useMemo<Ctx>(() => ({
    config, loaded, refresh,
    num: (key) => {
      const n = Number(config[key]);
      return Number.isFinite(n) ? n : 0;
    },
    whatsappLink: (message) => {
      let d = digitsOnly(config.whatsapp_number);
      if (d.length === 10) d = `91${d}`;
      if (d.length < 11) return null;
      return `https://wa.me/${d}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
    },
  }), [config, loaded]);

  return <StoreConfigContext.Provider value={value}>{children}</StoreConfigContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStoreConfig() {
  const ctx = useContext(StoreConfigContext);
  if (!ctx) throw new Error('useStoreConfig must be used within StoreConfigProvider');
  return ctx;
}
