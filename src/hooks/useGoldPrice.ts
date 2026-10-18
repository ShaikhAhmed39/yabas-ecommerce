import { useEffect, useState } from 'react';

export interface GoldPrice {
  price_per_gram_24k: number;
  timestamp: string;
}

export function useGoldPrice() {
  const [goldPrice, setGoldPrice] = useState<GoldPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchGoldPrice() {
      try {
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(
          `${url}/rest/v1/gold_rates?select=rate_per_gram_24k,created_at&order=created_at.desc&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        if (!rows.length) throw new Error('No rate saved yet');
        if (!cancelled) {
          setGoldPrice({
            price_per_gram_24k: Number(rows[0].rate_per_gram_24k),
            timestamp: rows[0].created_at,
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load gold rate');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGoldPrice();
    const interval = setInterval(fetchGoldPrice, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { goldPrice, loading, error };
}