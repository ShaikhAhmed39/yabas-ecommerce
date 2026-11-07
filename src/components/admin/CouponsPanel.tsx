import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/orders';
import { btnDanger, btnGhost, btnPrimary, Card, Field, inputCls, Notice, Toggle } from '@/components/admin/AdminUI';

interface Coupon { id: string; code: string; description: string | null; kind: 'percent' | 'flat'; value: number; min_order: number; max_discount: number | null; expires_at: string | null; usage_limit: number | null; used_count: number; per_user_limit: number; is_active: boolean; source: string }
const EMPTY = { code: '', description: '', kind: 'percent' as 'percent' | 'flat', value: '', min_order: '', max_discount: '', expires: '', usage_limit: '', per_user_limit: '1' };

export function CouponsPanel() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('coupons').select('*').eq('source', 'manual').order('created_at', { ascending: false });
    if (error) setMsg({ k: 'error', t: errorMessage(error) }); else setRows((data ?? []) as Coupon[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return setMsg({ k: 'error', t: 'Code: 3–32 letters, numbers, - or _.' });
    const value = Number(f.value);
    if (!(value > 0)) return setMsg({ k: 'error', t: 'Enter the discount value.' });
    if (f.kind === 'percent' && value > 90) return setMsg({ k: 'error', t: 'Percent discount cannot be above 90.' });
    setBusy(true);
    const { error } = await supabase.from('coupons').insert({
      code, description: f.description.trim() || null, kind: f.kind, value,
      min_order: Number(f.min_order) || 0, max_discount: Number(f.max_discount) > 0 ? Number(f.max_discount) : null,
      expires_at: f.expires ? new Date(`${f.expires}T23:59:59+05:30`).toISOString() : null,
      usage_limit: Number(f.usage_limit) > 0 ? Number(f.usage_limit) : null, per_user_limit: Math.max(1, Number(f.per_user_limit) || 1),
    });
    setBusy(false);
    if (error) return setMsg({ k: 'error', t: /duplicate/i.test(error.message) ? 'That code already exists.' : errorMessage(error) });
    setF(EMPTY); setOpen(false); setMsg({ k: 'ok', t: `Coupon ${code} created.` }); void load();
  };

  const toggle = async (c: Coupon) => {
    const { error } = await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) setMsg({ k: 'error', t: errorMessage(error) }); else void load();
  };
  const del = async (c: Coupon) => {
    if (c.used_count > 0) return setMsg({ k: 'error', t: 'This coupon has been used. Switch it off instead of deleting.' });
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    const { error } = await supabase.from('coupons').delete().eq('id', c.id);
    if (error) setMsg({ k: 'error', t: errorMessage(error) }); else void load();
  };
  const s = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      <div className="flex justify-end"><button onClick={() => setOpen((v) => !v)} className={btnPrimary}><Plus className="h-4 w-4" />New coupon</button></div>
      {open && (
        <Card title="New coupon">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Code" hint="Customers type this, e.g. FESTIVE10"><input value={f.code} onChange={(e) => s('code', e.target.value.toUpperCase())} className={inputCls} /></Field>
            <Field label="Type"><select value={f.kind} onChange={(e) => s('kind', e.target.value)} className={inputCls}><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></Field>
            <Field label={f.kind === 'percent' ? 'Percent (max 90)' : 'Amount (₹)'}><input type="number" min={0} value={f.value} onChange={(e) => s('value', e.target.value)} className={inputCls} /></Field>
            <Field label="Minimum order (₹)"><input type="number" min={0} value={f.min_order} onChange={(e) => s('min_order', e.target.value)} className={inputCls} /></Field>
            {f.kind === 'percent' && <Field label="Maximum discount (₹)" hint="Protects your margin"><input type="number" min={0} value={f.max_discount} onChange={(e) => s('max_discount', e.target.value)} className={inputCls} /></Field>}
            <Field label="Valid until"><input type="date" value={f.expires} onChange={(e) => s('expires', e.target.value)} className={inputCls} /></Field>
            <Field label="Total uses allowed" hint="Empty = unlimited"><input type="number" min={0} value={f.usage_limit} onChange={(e) => s('usage_limit', e.target.value)} className={inputCls} /></Field>
            <Field label="Uses per customer"><input type="number" min={1} value={f.per_user_limit} onChange={(e) => s('per_user_limit', e.target.value)} className={inputCls} /></Field>
            <Field label="Note (internal)"><input value={f.description} onChange={(e) => s('description', e.target.value)} className={inputCls} /></Field>
            <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><button disabled={busy} className={btnPrimary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create coupon</button><button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button></div>
          </form>
        </Card>
      )}
      {loading ? <p className="py-8 text-center text-ink/60">Loading…</p> : rows.length === 0 ? <p className="py-8 text-center text-ink/60">No coupons yet.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-xl border border-cream-400 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-mono text-lg tracking-wider text-onyx-300">{c.code}</p><p className="text-sm text-ink/75">{c.kind === 'percent' ? `${c.value}% off` : `₹${c.value} off`}{c.min_order > 0 ? ` · min ₹${c.min_order}` : ''}{c.max_discount ? ` · up to ₹${c.max_discount}` : ''}</p></div>
                <Toggle checked={c.is_active} onChange={() => void toggle(c)} label={c.is_active ? 'On' : 'Off'} />
              </div>
              <p className="mt-2 text-xs text-ink/60">Used {c.used_count}{c.usage_limit ? ` of ${c.usage_limit}` : ''} · {c.per_user_limit} per customer · {c.expires_at ? `ends ${formatDate(c.expires_at)}` : 'no end date'}{c.description ? ` · ${c.description}` : ''}</p>
              <div className="mt-3"><button onClick={() => void del(c)} className={`${btnDanger} min-h-10`}><Trash2 className="h-4 w-4" />Delete</button></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
