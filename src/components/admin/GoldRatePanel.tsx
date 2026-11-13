import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/orders';
import { btnGhost, btnPrimary, Card, Field, inputCls, Notice, Stat } from '@/components/admin/AdminUI';

interface HistoryRow { at: string; raw: number; margin: number; final: number }
interface Status { margin_percent: number; raw_rate: number | null; final_rate: number | null; updated_at: string | null; history: HistoryRow[] }

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

export function GoldRatePanel() {
  const [s, setS] = useState<Status | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_gold_rate_status');
    if (error) { setMsg({ kind: 'error', text: errorMessage(error) }); return; }
    const st = data as Status;
    setS(st);
    setInput(String(st.margin_percent));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pct = Number(input);
  const valid = input.trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 60;
  const preview = s?.raw_rate && valid ? Math.round(s.raw_rate * (1 + pct / 100)) : null;
  const changed = s ? valid && pct !== Number(s.margin_percent) : false;

  async function save() {
    if (!valid) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('admin_set_gold_margin', { p_percent: pct });
    setBusy(false);
    if (error) { setMsg({ kind: 'error', text: errorMessage(error) }); return; }
    const st = data as Status;
    setS(st); setInput(String(st.margin_percent));
    setMsg({ kind: 'ok', text: `Saved. The website now shows ${inr(st.final_rate ?? 0)} per gram.` });
  }

  if (!s) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-onyx-300" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Market rate (24K / gram)" value={s.raw_rate ? inr(s.raw_rate) : '—'} sub="Before your margin" />
        <Stat label="Your margin" value={`${s.margin_percent}%`} sub="Added on top" />
        <Stat label="Website shows (per gram)" value={s.final_rate ? inr(s.final_rate) : '—'} sub={s.updated_at ? `Market rate fetched ${formatDate(s.updated_at, true)}` : 'No rate yet'} tone="good" />
      </div>

      <Card title="Change your margin" action={<button className={btnGhost} onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</button>}>
        <div className="space-y-4">
          <Field label="Gold margin (%)" hint="Covers import duty, GST and your own margin. Allowed: 0 to 60. Example: 19 means market rate + 19%.">
            <input className={inputCls} type="number" inputMode="decimal" min={0} max={60} step={0.1} value={input} onChange={(e) => { setInput(e.target.value); setMsg(null); }} />
          </Field>

          <div className="rounded-lg bg-cream-100 p-4 text-sm">
            <p className="text-ink/60">Preview with {valid ? `${pct}%` : 'this margin'}</p>
            {preview !== null ? (
              <p className="mt-1 text-ink">
                <span className="text-2xl font-semibold text-onyx-300">{inr(preview)}</span> per gram
                <span className="ml-3 text-ink/60">{inr(preview * 10)} per 10 g</span>
              </p>
            ) : <p className="mt-1 text-ink/60">{valid ? 'No market rate saved yet.' : 'Enter a number between 0 and 60.'}</p>}
          </div>

          <button className={btnPrimary} disabled={busy || !changed} onClick={() => void save()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save margin
          </button>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <p className="text-xs text-ink/55">The change shows on the website within a minute. The market rate refreshes by itself 3 times a day on weekdays; your margin is applied every time. To match another website such as Indriya, adjust the margin until the preview equals their per-gram rate.</p>
        </div>
      </Card>

      <Card title="Recent rates">
        <ul className="divide-y divide-cream-300 text-sm">
          {s.history.map((h) => (
            <li key={h.at} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-ink/60">{formatDate(h.at, true)}</span>
              <span className="text-ink">{inr(h.raw)} + {h.margin}% = <b>{inr(h.final)}</b></span>
            </li>
          ))}
          {s.history.length === 0 && <li className="py-2 text-ink/60">No rates saved yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
