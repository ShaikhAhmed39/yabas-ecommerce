import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { useCatalogOptions, type CatalogRow } from '@/lib/catalogOptions';
import { btnPrimary, Card, inputCls, Notice } from '@/components/admin/AdminUI';

/** Add or remove the names that appear in the product form dropdowns. */
export function CatalogPanel() {
  const { rows, ready, reload } = useCatalogOptions();
  const [cat, setCat] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = (rows ?? []).filter((r) => r.kind === 'category');
  const current = cat || categories[0]?.name || '';

  const add = async (kind: CatalogRow['kind'], category: string, name: string) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_add_catalog_option', { p_kind: kind, p_category: category, p_name: name });
    setBusy(false);
    if (error) { setMsg({ kind: 'error', text: errorMessage(error) }); return false; }
    setMsg({ kind: 'ok', text: `"${name.trim()}" added. It is now in the product form.` });
    await reload(); return true;
  };
  const remove = async (r: CatalogRow) => {
    const extra = r.kind === 'category' ? ' Its sub-categories and types leave the list too.' : '';
    if (!window.confirm(`Remove "${r.name}" from the list?${extra}\n\nProducts that already use it keep it. Only the dropdown changes.`)) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('admin_remove_catalog_option', { p_id: r.id });
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: errorMessage(error) }); else { setMsg({ kind: 'ok', text: `"${r.name}" removed.` }); await reload(); }
  };

  if (!ready) return <Notice kind="info">The category list is not switched on yet. The product form is using the standard list. Ask your developer to apply the latest database update, then this page will let you add your own.</Notice>;

  const Chips = ({ list }: { list: CatalogRow[] }) => (
    <ul className="flex flex-wrap gap-2">
      {list.length === 0 && <li className="text-sm text-ink/50">Nothing yet</li>}
      {list.map((r) => (
        <li key={r.id} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-cream-400 bg-white pl-3 pr-1 text-sm text-onyx-300">
          {r.name}
          <button type="button" disabled={busy} aria-label={`Remove ${r.name}`} onClick={() => void remove(r)} className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-red-50 hover:text-red-700"><X className="h-4 w-4" aria-hidden /></button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <Card title="Categories"><AddBox label="New category, e.g. Hair Pin" onAdd={(n) => add('category', '', n)} busy={busy} /><div className="mt-4"><Chips list={categories} /></div></Card>
      <Card title="Sub-categories and types">
        <label className="mb-3 block text-sm text-ink/70">Choose the category you want to change
          <select value={current} onChange={(e) => setCat(e.target.value)} className={`${inputCls} mt-1 max-w-sm`}>{categories.map((c) => <option key={c.id}>{c.name}</option>)}</select>
        </label>
        {current && (<div className="grid gap-6 md:grid-cols-2">
          <div><h3 className="mb-2 text-sm font-medium text-onyx-300">Sub-categories of {current}</h3><AddBox label="e.g. Indian Necklace" onAdd={(n) => add('sub', current, n)} busy={busy} /><div className="mt-3"><Chips list={(rows ?? []).filter((r) => r.kind === 'sub' && r.category === current)} /></div></div>
          <div><h3 className="mb-2 text-sm font-medium text-onyx-300">Types of {current} <span className="font-normal text-ink/50">(second dropdown, optional)</span></h3><AddBox label="e.g. Long Necklace" onAdd={(n) => add('type', current, n)} busy={busy} /><div className="mt-3"><Chips list={(rows ?? []).filter((r) => r.kind === 'type' && r.category === current)} /></div></div>
        </div>)}
      </Card>
      <Card title="Occasions"><AddBox label="New occasion, e.g. Karwa Chauth" onAdd={(n) => add('occasion', '', n)} busy={busy} /><div className="mt-4"><Chips list={(rows ?? []).filter((r) => r.kind === 'occasion')} /></div></Card>
      <p className="text-xs text-ink/60">Removing a name never changes products that already use it. Spell names the way customers should see them.</p>
    </div>
  );
}

function AddBox({ label, onAdd, busy }: { label: string; onAdd: (name: string) => Promise<boolean>; busy: boolean }) {
  const [v, setV] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) void onAdd(v).then((ok) => ok && setV('')); }} className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={60} placeholder={label} aria-label={label} className={inputCls} />
      <button type="submit" disabled={busy || !v.trim()} className={`${btnPrimary} shrink-0 disabled:opacity-50`}><Plus className="h-4 w-4" aria-hidden />Add</button>
    </form>
  );
}
