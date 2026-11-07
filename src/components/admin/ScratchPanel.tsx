import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { useStoreConfig } from '@/lib/storeConfig';
import { btnDanger, btnGhost, btnPrimary, Card, Field, inputCls, Notice, Stat, Toggle } from '@/components/admin/AdminUI';

interface Prize { id: string; label: string; kind: 'percent' | 'flat'; value: number; max_discount: number | null; min_order: number; valid_days: number; weight: number; is_active: boolean }
const EMPTY = { label: '', kind: 'percent' as 'percent' | 'flat', value: '', max_discount: '', min_order: '0', valid_days: '30', weight: '10' };

export function ScratchPanel() {
  const { config, refresh } = useStoreConfig();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [stats, setStats] = useState({ issued: 0, revealed: 0 });
  const [minOrder, setMinOrder] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = config.scratch_enabled === 'true';
  useEffect(() => { setMinOrder(config.scratch_min_order ?? ''); }, [config.scratch_min_order]);

  const load = useCallback(async () => {
    const [p, a, b] = await Promise.all([
      supabase.from('scratch_prizes').select('*').order('created_at'),
      supabase.from('scratch_cards').select('id', { count: 'exact', head: true }),
      supabase.from('scratch_cards').select('id', { count: 'exact', head: true }).eq('status', 'revealed'),
    ]);
    if (p.error) setMsg({ k: 'error', t: errorMessage(p.error) }); else setPrizes((p.data ?? []) as Prize[]);
    setStats({ issued: a.count ?? 0, revealed: b.count ?? 0 });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setCfg = async (values: Record<string, string>) => {
    const { error } = await supabase.rpc('admin_set_store_config', { p_values: values });
    if (error) { setMsg({ k: 'error', t: errorMessage(error) }); return false; }
    await refresh(); return true;
  };
  const activeCount = prizes.filter((p) => p.is_active).length;

  const flip = async (on: boolean) => {
    setMsg(null);
    if (on && activeCount === 0) return setMsg({ k: 'error', t: 'Switch on at least one prize first, so every card has something to give.' });
    if (await setCfg({ scratch_enabled: on ? 'true' : 'false' })) setMsg({ k: 'ok', t: on ? 'Scratch cards are ON. Paid orders now receive a card.' : 'Scratch cards are OFF.' });
  };
  const saveMin = async () => { if (await setCfg({ scratch_min_order: minOrder.trim() })) setMsg({ k: 'ok', t: 'Minimum order saved.' }); };

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const value = Number(f.value);
    if (f.label.trim().length < 2) return setMsg({ k: 'error', t: 'Give the prize a name, e.g. “5% off your next order”.' });
    if (!(value > 0)) return setMsg({ k: 'error', t: 'Enter the discount value.' });
    if (f.kind === 'percent' && value > 50) return setMsg({ k: 'error', t: 'Percent prizes are limited to 50%.' });
    setBusy(true);
    const { error } = await supabase.from('scratch_prizes').insert({
      label: f.label.trim(), kind: f.kind, value, max_discount: Number(f.max_discount) > 0 ? Number(f.max_discount) : null,
      min_order: Number(f.min_order) || 0, valid_days: Math.min(365, Math.max(1, Number(f.valid_days) || 30)), weight: Math.max(1, Number(f.weight) || 10), is_active: false,
    });
    setBusy(false);
    if (error) return setMsg({ k: 'error', t: errorMessage(error) });
    setF(EMPTY); setOpen(false); void load();
  };
  const upd = async (id: string, patch: Partial<Prize>) => {
    const { error } = await supabase.from('scratch_prizes').update(patch).eq('id', id);
    if (error) setMsg({ k: 'error', t: errorMessage(error) }); else void load();
  };
  const del = async (p: Prize) => {
    if (!confirm(`Delete prize “${p.label}”?`)) return;
    const { error } = await supabase.from('scratch_prizes').delete().eq('id', p.id);
    if (error) setMsg({ k: 'error', t: errorMessage(error) }); else void load();
  };
  const total = prizes.filter((p) => p.is_active).reduce((n, p) => n + p.weight, 0) || 1;
  const s = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Cards issued" value={stats.issued} /><Stat label="Revealed" value={stats.revealed} /><Stat label="Active prizes" value={activeCount} tone={activeCount ? 'good' : 'warn'} />
      </div>
      <Card title="Scratch cards">
        <p className="mb-3 text-sm leading-6 text-ink/75">After a customer’s payment is confirmed, the server picks a prize by weight and keeps it hidden until they scratch. Prizes become one-time, single-customer coupons that expire after the days you set. No prize is ever shown in the browser before it is scratched.</p>
        <Toggle checked={enabled} onChange={(v) => void flip(v)} label={enabled ? 'Scratch cards are ON' : 'Scratch cards are OFF'} />
        <div className="mt-3 flex max-w-sm items-end gap-3"><Field label="Only for orders above (₹)" hint="Empty = every paid order"><input type="number" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} className={inputCls} /></Field><button onClick={() => void saveMin()} className={btnGhost}>Save</button></div>
      </Card>
      <Card title="Prizes" action={<button onClick={() => setOpen((v) => !v)} className={`${btnPrimary} min-h-10`}><Plus className="h-4 w-4" />New prize</button>}>
        <Notice kind="info">The prizes below are only examples and start switched off. Choose amounts your margin can afford, then switch them on.</Notice>
        {open && (
          <form onSubmit={add} className="mt-4 grid gap-4 rounded-lg bg-cream-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2"><Field label="Prize name (shown to customer)"><input value={f.label} onChange={(e) => s('label', e.target.value)} className={inputCls} maxLength={80} /></Field></div>
            <Field label="Type"><select value={f.kind} onChange={(e) => s('kind', e.target.value)} className={inputCls}><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></Field>
            <Field label={f.kind === 'percent' ? 'Percent (max 50)' : 'Amount (₹)'}><input type="number" min={0} value={f.value} onChange={(e) => s('value', e.target.value)} className={inputCls} /></Field>
            {f.kind === 'percent' && <Field label="Maximum ₹ off"><input type="number" min={0} value={f.max_discount} onChange={(e) => s('max_discount', e.target.value)} className={inputCls} /></Field>}
            <Field label="Minimum order (₹)"><input type="number" min={0} value={f.min_order} onChange={(e) => s('min_order', e.target.value)} className={inputCls} /></Field>
            <Field label="Valid for (days)"><input type="number" min={1} max={365} value={f.valid_days} onChange={(e) => s('valid_days', e.target.value)} className={inputCls} /></Field>
            <Field label="Chance weight" hint="Higher = more often"><input type="number" min={1} value={f.weight} onChange={(e) => s('weight', e.target.value)} className={inputCls} /></Field>
            <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><button disabled={busy} className={btnPrimary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add prize</button><button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button></div>
          </form>
        )}
        <ul className="mt-4 divide-y divide-cream-300">
          {prizes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="font-medium text-ink">{p.label}</p><p className="text-xs text-ink/60">{p.kind === 'percent' ? `${p.value}%` : `₹${p.value}`}{p.max_discount ? ` (max ₹${p.max_discount})` : ''} · min ₹{p.min_order} · {p.valid_days} days · {p.is_active ? `${Math.round((p.weight / total) * 100)}% chance` : 'not in the draw'}</p></div>
              <div className="flex items-center gap-2"><Toggle checked={p.is_active} onChange={(v) => void upd(p.id, { is_active: v })} label={p.is_active ? 'On' : 'Off'} /><button onClick={() => void del(p)} aria-label={`Delete ${p.label}`} className={`${btnDanger} min-h-10 px-3`}><Trash2 className="h-4 w-4" /></button></div>
            </li>
          ))}
          {prizes.length === 0 && <li className="py-6 text-center text-sm text-ink/60">No prizes yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
