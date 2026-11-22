import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface CatalogRow { id: string; kind: 'category' | 'sub' | 'type' | 'occasion'; category: string; name: string; sort: number }
export interface CatalogTree {
  categories: string[];
  subs: Record<string, string[]>;
  types: Record<string, string[]>;
  occasions: string[];
}

/** Used until the owner's own list loads (and if the database update has not been applied yet). */
export const FALLBACK_TREE: CatalogTree = {
  categories: ['Necklace', 'Ring', 'Paasa', 'Nath', 'Mangalsutra', 'Chain', 'Earrings', 'Maangtika', 'Bangles', 'Bracelet', 'Bridal'],
  subs: {
    Necklace: ['Indian Necklace', 'Turkish Necklace'], Ring: ['Indian Ring', 'Turkish Ring'],
    Mangalsutra: ['Daily Wear', 'Long Mangalsutra', 'AD Mangalsutra'], Chain: ['Chain'], Earrings: ['Indian Earrings', 'Turkish Earrings'],
    Bangles: ['Bangles', 'Kada', 'AD Bangles'], Bracelet: ['Indian Bracelet', 'Turkish Bracelet', 'AD Bracelets'],
    Bridal: ['Full Set', 'Necklace Set', 'Maang Tikka', 'Nath', 'Kamarbandh'],
  },
  types: {
    Necklace: ['Long Necklace', 'Short Necklace', 'Unique Set', 'Combo Set', 'Bridal Set'], Ring: ['Long Ring', 'Small Ring', 'Bridal Ring'],
    Earrings: ['Tops', 'Earrings', 'Sui Dhaga', 'Bridal Earrings', 'Occasion Earrings'],
  },
  occasions: ['Daily Wear', 'Wedding', 'Festive', 'Party', 'Office', 'Casual'],
};

export function buildTree(rows: CatalogRow[]): CatalogTree {
  const t: CatalogTree = { categories: [], subs: {}, types: {}, occasions: [] };
  for (const r of rows) {
    if (r.kind === 'category') t.categories.push(r.name);
    else if (r.kind === 'occasion') t.occasions.push(r.name);
    else (r.kind === 'sub' ? t.subs : t.types)[r.category] = [...((r.kind === 'sub' ? t.subs : t.types)[r.category] ?? []), r.name];
  }
  return t;
}

/** The owner's category lists for the admin dropdowns. */
export function useCatalogOptions() {
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [tree, setTree] = useState<CatalogTree>(FALLBACK_TREE);
  const [ready, setReady] = useState(false); // false = database update not applied: the list cannot be edited yet
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_catalog_options');
    if (error || !Array.isArray(data) || data.length === 0) { setReady(false); return; }
    const r = data as CatalogRow[];
    setRows(r); setTree(buildTree(r)); setReady(true);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { tree, rows, ready, reload };
}
