import { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { btnGhost, Card, Notice } from '@/components/admin/AdminUI';

interface Row { product_id: string; title: string; in_stock: boolean; emails: string[]; waiting: number }

/** People who asked "notify me" on a sold-out piece. Email them yourself when you restock, then clear the list. */
export function StockAlertsCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_stock_alerts');
    if (e) { console.warn('stock alerts unavailable', e.message); return; } // e.g. before the database update: stay quiet
    setRows((data ?? []) as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!rows || rows.length === 0) return null;

  const copy = async (r: Row) => { try { await navigator.clipboard.writeText(r.emails.join(', ')); setCopied(r.product_id); setTimeout(() => setCopied(''), 2000); } catch { /* ignore */ } };
  const clear = async (r: Row) => {
    if (!window.confirm(`Remove the ${r.waiting} waiting email(s) for ${r.title}? Do this after you have told them it is back.`)) return;
    const { error: e } = await supabase.rpc('admin_clear_stock_alerts', { p_product_id: r.product_id });
    if (e) setError(errorMessage(e)); else void load();
  };

  return (
    <Card title="Customers waiting for a restock">
      <p className="mb-3 flex items-center gap-2 text-sm text-ink/70"><BellRing className="h-4 w-4 text-onyx-300" aria-hidden />They asked "Notify me" on a sold-out piece. When you restock, copy their emails and write to them, then clear the list.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="divide-y divide-cream-300">
        {rows.map((r) => (
          <li key={r.product_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-ink">{r.title} <span className="ml-1 rounded bg-cream-200 px-2 py-0.5 text-xs">{r.waiting} waiting</span> {r.in_stock && <span className="text-xs text-[#1B6E45]">back in stock: email them now</span>}</p>
              <p className="mt-1 break-all text-xs text-ink/60">{r.emails.join(', ')}</p>
            </div>
            <div className="flex gap-2">
              <button className={btnGhost} onClick={() => void copy(r)}>{copied === r.product_id ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy emails</>}</button>
              <button className={btnGhost} onClick={() => void clear(r)}>Clear</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
