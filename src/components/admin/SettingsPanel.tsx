import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';
import { useStoreConfig, type StoreConfig } from '@/lib/storeConfig';
import { btnPrimary, Card, Field, inputCls, Notice } from '@/components/admin/AdminUI';

type K = keyof StoreConfig;
const GROUPS: { title: string; note?: string; fields: { k: K; label: string; hint?: string; type?: 'number' | 'url' | 'email' | 'tel'; wide?: boolean }[] }[] = [
  { title: 'Business details', note: 'These fill the placeholders in your Terms, Privacy, Returns and Shipping pages, the footer and the Contact page.', fields: [
    { k: 'legal_name', label: 'Legal business name' }, { k: 'gstin', label: 'GSTIN (if registered)' },
    { k: 'address', label: 'Business address', wide: true }, { k: 'website_url', label: 'Website address', type: 'url' },
    { k: 'support_email', label: 'Support e-mail', type: 'email' }, { k: 'support_phone', label: 'Support phone (10 digits)', type: 'tel' },
    { k: 'support_hours', label: 'Support hours', hint: 'e.g. Mon–Sat, 11 am – 8 pm', wide: true },
    { k: 'whatsapp_number', label: 'WhatsApp number (10 digits)', type: 'tel', hint: 'Powers the WhatsApp buttons on the site' },
    { k: 'map_url', label: 'Google Maps link', type: 'url' }, { k: 'instagram_url', label: 'Instagram link', type: 'url' }, { k: 'facebook_url', label: 'Facebook link', type: 'url' },
  ] },
  { title: 'Grievance contact', note: 'Required by Indian e-commerce rules. Shown on the Contact & Grievance page.', fields: [
    { k: 'grievance_name', label: 'Name and designation' }, { k: 'grievance_email', label: 'Grievance e-mail', type: 'email' }, { k: 'grievance_phone', label: 'Grievance phone', type: 'tel' },
  ] },
  { title: 'Delivery & policy text', fields: [
    { k: 'processing_time', label: 'Order processing time', hint: 'e.g. 1–2 working days' }, { k: 'delivery_estimate', label: 'Delivery estimate', hint: 'e.g. 3–7 (working days after dispatch)' },
    { k: 'return_shipping_rule', label: 'Return shipping rule', wide: true, hint: 'Who pays for return shipping, and when' }, { k: 'policy_effective_date', label: 'Policy effective date', hint: 'e.g. 1 December 2026' },
  ] },
  { title: 'Charges', note: 'The server applies these when the order is created. Leave a field empty for none.', fields: [
    { k: 'shipping_fee', label: 'Delivery fee (₹)', type: 'number' }, { k: 'free_shipping_threshold', label: 'Free delivery above (₹)', type: 'number', hint: 'Empty = never free' }, { k: 'gift_wrap_fee', label: 'Gift wrap fee (₹)', type: 'number' },
  ] },
];

export function SettingsPanel() {
  const { config, refresh } = useStoreConfig();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null);
  useEffect(() => { setVals(Object.fromEntries(Object.entries(config).map(([k, v]) => [k, v ?? '']))); }, [config]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const keys = GROUPS.flatMap((g) => g.fields.map((f) => f.k as string));
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = (vals[k] ?? '').trim();
    for (const k of ['support_phone', 'whatsapp_number', 'grievance_phone']) if (out[k] && !/^\d{10}$/.test(out[k].replace(/\D/g, '').slice(-10))) return setMsg({ k: 'error', t: 'Phone numbers must be 10 digits.' });
    for (const k of ['support_phone', 'whatsapp_number', 'grievance_phone']) if (out[k]) out[k] = out[k].replace(/\D/g, '').slice(-10);
    for (const k of ['website_url', 'map_url', 'instagram_url', 'facebook_url']) if (out[k] && !/^https:\/\//i.test(out[k])) return setMsg({ k: 'error', t: 'Links must start with https://' });
    setBusy(true);
    const { error } = await supabase.rpc('admin_set_store_config', { p_values: out });
    setBusy(false);
    if (error) return setMsg({ k: 'error', t: errorMessage(error, 'Could not save settings.') });
    await refresh(); setMsg({ k: 'ok', t: 'Saved. The website, footer and policy pages now show these details.' });
  };

  return (
    <form onSubmit={save} className="space-y-5">
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      {GROUPS.map((g) => (
        <Card key={g.title} title={g.title}>
          {g.note && <p className="mb-4 text-sm text-ink/65">{g.note}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.k} className={f.wide ? 'sm:col-span-2' : ''}>
                <Field label={f.label} hint={f.hint}>
                  <input type={f.type === 'number' ? 'number' : 'text'} inputMode={f.type === 'number' || f.type === 'tel' ? 'decimal' : undefined} min={f.type === 'number' ? 0 : undefined}
                    value={vals[f.k] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))} className={inputCls} />
                </Field>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Card title="Courier (Shiprocket) and payment keys">
        <p className="text-sm leading-6 text-ink/75">For safety, secret keys are never typed into this website. They live in Supabase → Edge Functions → Secrets. Razorpay is already set. To switch Shiprocket from test mode to live, add the secrets listed in <code>docs/DEPLOY.md</code> (<code>SHIPROCKET_API_EMAIL</code>, <code>SHIPROCKET_API_PASSWORD</code>, <code>SHIPROCKET_PICKUP_LOCATION</code>, <code>SHIPROCKET_PICKUP_PINCODE</code>, <code>SHIPROCKET_WEBHOOK_TOKEN</code>, then <code>SHIPPING_MODE=live</code>). The Orders tab shows a “live” or “test” badge so you can confirm which mode is active.</p>
      </Card>
      <div className="sticky bottom-16 z-10 rounded-xl border border-cream-400 bg-white/95 p-3 shadow-medium backdrop-blur lg:bottom-4"><button disabled={busy} className={`${btnPrimary} w-full`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save settings</button></div>
    </form>
  );
}
