import { StockAlertsCard } from '@/components/admin/StockAlertsCard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { compressImageToWebP } from '@/utils/imageCompress';
import { calculateDiscount, formatINR } from '@/utils/format';
import { productImages } from '@/utils/images';
import { btnDanger, btnGhost, btnPrimary, Card, Field, inputCls, Notice, Toggle } from '@/components/admin/AdminUI';
import type { Product, ProductInput } from '@/types';

const CATEGORIES = ['Necklace', 'Earrings', 'Bangles', 'Rings', 'Bracelet', 'Bridal', 'Anklets'];
const SUB: Record<string, string[]> = {
  Necklace: ['Choker', 'Long', 'Rani Haar', 'Mangalsutra', 'Pendant'], Earrings: ['Studs', 'Jhumka', 'Chandbali', 'Hoop', 'Drop'],
  Bangles: ['Kada', 'Stack', 'Glass', 'Gold Plated'], Rings: ['Cocktail', 'Engagement', 'Daily Wear', 'Adjustable'],
  Bracelet: ['Chain', 'Cuff', 'Charm', 'Pearl'], Bridal: ['Full Set', 'Necklace Set', 'Maang Tikka', 'Nath', 'Kamarbandh'],
  Anklets: ['Chain', 'Beaded', 'Traditional', 'Modern'],
};
const OCCASIONS = ['Daily Wear', 'Wedding', 'Festive', 'Party', 'Traditional', 'Office', 'Casual'];
const MAX_PHOTOS = 8;

type Form = ProductInput & { photos: string[] };
const EMPTY: Form = {
  title: '', description: '', original_price: 0, selling_price: 0, discount_percent: 0, stock: 0, weight_grams: 100,
  material_type: '', polish_finish: '', dimensions: '', category: '', sub_category: '', occasion_wear: '', is_featured: false, photos: [],
  purity: '', plating: '', stone_type: '', certification: '', care_notes: '', style_tags: [],
};

/** Product catalogue: photos only (first photo is the cover). Every angle uploaded here becomes a swipeable, zoomable photo for customers. */
export function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (e) setError(errorMessage(e)); else setProducts((data ?? []) as Product[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => products.filter((p) => !q || `${p.title} ${p.category}`.toLowerCase().includes(q.toLowerCase())), [products, q]);

  const open = (p?: Product) => {
    setError(null); setOk(null);
    if (!p) { setForm(EMPTY); setEditing('new'); }
    else {
      setForm({
        title: p.title, description: p.description ?? '', original_price: p.original_price, selling_price: p.selling_price, discount_percent: p.discount_percent,
        stock: p.stock, weight_grams: p.weight_grams ?? 100, material_type: p.material_type ?? '', polish_finish: p.polish_finish ?? '', dimensions: p.dimensions ?? '',
        category: p.category, sub_category: p.sub_category ?? '', occasion_wear: p.occasion_wear ?? '', is_featured: p.is_featured, photos: productImages(p),
        purity: p.purity ?? '', plating: p.plating ?? '', stone_type: p.stone_type ?? '', certification: p.certification ?? '', care_notes: p.care_notes ?? '', style_tags: p.style_tags ?? [],
      });
      setEditing(p.id);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - form.photos.length;
    const picked = [...files].slice(0, room);
    if (files.length > room) setError(`Only ${MAX_PHOTOS} photos per product. The first ${room} were added.`);
    setUploading(picked.length);
    const urls: string[] = [];
    for (const file of picked) {
      try {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: use JPG, PNG or WebP.`);
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} is larger than 100 MB.`);
        const blob = await compressImageToWebP(file);
        const path = `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        const { error: e } = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/webp', upsert: false });
        if (e) throw e;
        urls.push(supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl);
      } catch (e) { setError(errorMessage(e, 'A photo could not be uploaded.')); }
      setUploading((n) => n - 1);
    }
    setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }));
  };

  const move = (i: number, d: number) => setForm((f) => {
    const p = [...f.photos]; const j = i + d;
    if (j < 0 || j >= p.length) return f;
    [p[i], p[j]] = [p[j], p[i]]; return { ...f, photos: p };
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setOk(null);
    if (!form.title.trim()) return setError('Product name is required.');
    if (!form.photos.length) return setError('Add at least one photo.');
    if (Number(form.selling_price) <= 0) return setError('Selling price must be more than 0.');
    if (Number(form.original_price) > 0 && Number(form.selling_price) > Number(form.original_price)) return setError('Selling price cannot be higher than the original price.');
    if (!form.category) return setError('Choose a category.');
    setSaving(true);
    const { photos, ...rest } = form;
    const payload = {
      ...rest, title: form.title.trim(), image_url: photos[0], gallery_urls: photos.slice(1),
      discount_percent: calculateDiscount(Number(form.original_price), Number(form.selling_price)),
      // an empty box means "not applicable": store nothing, never an empty claim
      purity: form.purity?.trim() || null, plating: form.plating?.trim() || null, stone_type: form.stone_type?.trim() || null,
      certification: form.certification?.trim() || null, care_notes: form.care_notes?.trim() || null,
    };
    const res = editing === 'new'
      ? await supabase.from('products').insert(payload)
      : await supabase.from('products').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing as string);
    setSaving(false);
    if (res.error) return setError(errorMessage(res.error, 'Could not save the product.'));
    setOk(editing === 'new' ? 'Product added.' : 'Product updated.');
    setEditing(null); void load();
  };

  const remove = async (p: Product) => {
    if (!confirm(`Delete “${p.title}”? This cannot be undone. Past orders keep their own copy of the item.`)) return;
    const { error: e } = await supabase.from('products').delete().eq('id', p.id);
    if (e) setError(errorMessage(e, 'Could not delete. If this product is in past orders, set its stock to 0 instead.')); else { setOk('Product deleted.'); void load(); }
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: 'original_price' | 'selling_price' | 'stock' | 'weight_grams') => (
    <input type="number" inputMode="decimal" min={0} value={form[k] || ''} onChange={(e) => set(k, Number(e.target.value))} className={inputCls} />
  );

  if (editing) {
    const disc = calculateDiscount(Number(form.original_price), Number(form.selling_price));
    return (
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-onyx-300">{editing === 'new' ? 'Add product' : 'Edit product'}</h2>
          <button type="button" onClick={() => setEditing(null)} className={btnGhost}><X className="h-4 w-4" />Cancel</button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}

        <Card title={`Photos (${form.photos.length}/${MAX_PHOTOS})`}>
          <p className="mb-3 text-sm text-ink/70">Upload every angle: front, side, back, close-up of the stones, on-model. The first photo is the cover. Customers swipe through all of them and can zoom in. Photos only: video is switched off for products.</p>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {form.photos.map((src, i) => (
              <li key={src} className="relative overflow-hidden rounded-lg border border-cream-400 bg-onyx-400">
                <img src={src} alt={`Photo ${i + 1}`} className="aspect-square w-full object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-gold-400 px-1.5 py-0.5 text-[10px] font-semibold text-ink">COVER</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" className="grid h-8 w-8 place-items-center text-white disabled:opacity-30"><ArrowUp className="h-4 w-4 -rotate-90" /></button>
                  <button type="button" onClick={() => set('photos', form.photos.filter((_, j) => j !== i))} aria-label="Remove photo" className="grid h-8 w-8 place-items-center text-white"><Trash2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === form.photos.length - 1} aria-label="Move later" className="grid h-8 w-8 place-items-center text-white disabled:opacity-30"><ArrowDown className="h-4 w-4 -rotate-90" /></button>
                </div>
              </li>
            ))}
            {form.photos.length < MAX_PHOTOS && (
              <li><label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-gold-500/60 bg-cream-50 text-center text-xs text-onyx-300 hover:bg-cream-100">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
                <span>{uploading > 0 ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <ImagePlus className="mx-auto h-6 w-6" />}<span className="mt-1 block">{uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}</span></span>
              </label></li>
            )}
          </ul>
        </Card>

        <Card title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Product name"><input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} maxLength={120} /></Field></div>
            <div className="sm:col-span-2"><Field label="Description" hint="Shown on the product page. Be honest about material and finish."><textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} className="w-full rounded-lg border border-cream-400 p-3 text-[15px] focus:border-onyx-300 focus:outline-none" /></Field></div>
            <Field label="Category"><select value={form.category} onChange={(e) => { set('category', e.target.value); set('sub_category', ''); }} className={inputCls}><option value="">Select</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Sub-category"><select value={form.sub_category} onChange={(e) => set('sub_category', e.target.value)} className={inputCls} disabled={!form.category}><option value="">None</option>{(SUB[form.category ?? ''] ?? []).map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Occasion"><select value={form.occasion_wear} onChange={(e) => set('occasion_wear', e.target.value)} className={inputCls}><option value="">None</option>{OCCASIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Material" hint="e.g. Brass with 1-gram gold plating"><input value={form.material_type} onChange={(e) => set('material_type', e.target.value)} className={inputCls} /></Field>
            <Field label="Finish"><input value={form.polish_finish} onChange={(e) => set('polish_finish', e.target.value)} className={inputCls} /></Field>
            <Field label="Size / dimensions"><input value={form.dimensions} onChange={(e) => set('dimensions', e.target.value)} className={inputCls} /></Field>
          </div>
        </Card>

        <Card title="Extra details for Google (optional)">
          <p className="mb-4 text-sm text-ink/70">These help customers and search engines. <b>Fill a box only if it is true for this piece.</b> An empty box is simply not shown. Do not write "BIS Hallmark" or "Anti-tarnish" unless the piece really has it.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Purity" hint="e.g. 925 silver. Leave empty for plated imitation pieces."><input value={form.purity ?? ''} onChange={(e) => set('purity', e.target.value)} className={inputCls} maxLength={60} /></Field>
            <Field label="Plating" hint="e.g. 1 gram gold plated"><input value={form.plating ?? ''} onChange={(e) => set('plating', e.target.value)} className={inputCls} maxLength={60} /></Field>
            <Field label="Stone" hint="e.g. American diamond, kundan, pearl"><input value={form.stone_type ?? ''} onChange={(e) => set('stone_type', e.target.value)} className={inputCls} maxLength={60} /></Field>
            <Field label="Certification" hint="Only if you hold a real certificate for this piece"><input value={form.certification ?? ''} onChange={(e) => set('certification', e.target.value)} className={inputCls} maxLength={80} /></Field>
            <div className="sm:col-span-2"><Field label="Style tags" hint="Separate with commas, e.g. bridal, kundan, choker"><input value={(form.style_tags ?? []).join(', ')} onChange={(e) => set('style_tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10))} className={inputCls} /></Field></div>
            <div className="sm:col-span-2"><Field label="Care note for this piece" hint="Leave empty to show the standard care line"><input value={form.care_notes ?? ''} onChange={(e) => set('care_notes', e.target.value)} className={inputCls} maxLength={200} /></Field></div>
          </div>
        </Card>

        <Card title="Price & stock">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Original price (₹)">{num('original_price')}</Field>
            <Field label="Selling price (₹)">{num('selling_price')}</Field>
            <Field label="Stock">{num('stock')}</Field>
            <Field label="Weight (grams)" hint="Used for courier booking">{num('weight_grams')}</Field>
          </div>
          {disc > 0 && <p className="mt-3 text-sm text-emerald-700">Customers will see {disc}% off.</p>}
          <div className="mt-2"><Toggle checked={Boolean(form.is_featured)} onChange={(v) => set('is_featured', v)} label="Show in “Trending now” on the home page" /></div>
        </Card>

        <div className="sticky bottom-16 z-10 flex gap-3 rounded-xl border border-cream-400 bg-white/95 p-3 shadow-medium backdrop-blur lg:bottom-4">
          <button disabled={saving || uploading > 0} className={`${btnPrimary} flex-1`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save product</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Notice kind="error">{error}</Notice>}{ok && <Notice kind="ok">{ok}</Notice>}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" className={`${inputCls} pl-9`} /></div>
        <button onClick={() => open()} className={btnPrimary}><Plus className="h-4 w-4" />Add product</button>
      </div>
      <StockAlertsCard />
      {loading ? <p className="py-10 text-center text-ink/60">Loading…</p> : shown.length === 0 ? <p className="py-10 text-center text-ink/60">No products found.</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-xl border border-cream-400 bg-white p-3 shadow-sm">
              <img src={p.image_url} alt="" className="h-20 w-20 flex-shrink-0 rounded-lg bg-onyx-400 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-ink">{p.title}{p.is_featured && <Star className="ml-1 inline h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-label="Featured" />}</p>
                <p className="text-xs text-ink/60">{p.category} · {productImages(p).length} photo{productImages(p).length === 1 ? '' : 's'}</p>
                <p className="mt-1 text-sm">{formatINR(p.selling_price)} <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${p.stock <= 0 ? 'bg-red-100 text-red-800' : p.stock <= 5 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>{p.stock <= 0 ? 'Sold out' : `${p.stock} in stock`}</span></p>
                <div className="mt-2 flex gap-2"><button onClick={() => open(p)} className={`${btnGhost} min-h-10 px-3`}><Pencil className="h-3.5 w-3.5" />Edit</button><button onClick={() => void remove(p)} className={`${btnDanger} min-h-10 px-3`} aria-label={`Delete ${p.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
