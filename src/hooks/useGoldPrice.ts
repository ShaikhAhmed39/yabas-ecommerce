import { useEffect, useState } from 'react';
import type { GoldPrice } from '@/types';

export function useGoldPrice() {
  const [goldPrice, setGoldPrice] = useState<GoldPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchGoldPrice() {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(`${supabaseUrl}/functions/v1/gold-price`, {
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: GoldPrice = await res.json();
        if (!cancelled) {
          setGoldPrice(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch gold price');
          setGoldPrice({
            price_per_gram_24k: 7250,
            price_per_gram_22k: 6638,
            price_per_gram_18k: 5438,
            currency: 'INR',
            timestamp: new Date().toISOString(),
            source: 'fallback',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGoldPrice();
    const interval = setInterval(fetchGoldPrice, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { goldPrice, loading, error };
}
