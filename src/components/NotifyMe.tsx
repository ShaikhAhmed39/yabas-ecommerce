import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';

/** Shown on a sold-out product. The page stays live (good for Google and for returning customers). */
export function NotifyMe({ productId, title }: { productId: string; title: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy'); setError('');
    const { error: err } = await supabase.rpc('request_stock_alert', { p_product_id: productId, p_email: email });
    if (err) { setState('idle'); setError(errorMessage(err, 'Could not save your email. Please try again.')); return; }
    setState('done');
  };

  return (
    <section aria-labelledby="notify-h" className="frame-gold mt-5 rounded-md bg-cream-50 p-4">
      <h2 id="notify-h" className="flex items-center gap-2 font-display text-sm tracking-wide text-onyx-300"><BellRing className="h-4 w-4 text-gold-500" aria-hidden />Notify me when it is back</h2>
      {state === 'done' ? (
        <p className="mt-3 text-sm text-[#1B6E45]" role="status">Thank you. We will email you if {title} comes back in stock.</p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-3">
          <div className="flex gap-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Your email" placeholder="you@example.com"
              className="h-11 min-w-0 flex-1 rounded-md border border-gold-500/50 bg-white px-3 text-[15px] focus:border-gold-500 focus:outline-none" />
            <button type="submit" disabled={state === 'busy'} className="inline-flex min-h-11 items-center gap-2 rounded bg-onyx-300 px-5 font-display text-xs tracking-[0.1em] text-gold-200 disabled:opacity-60">
              {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" />}NOTIFY ME
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-maroon-500" role="alert">{error}</p>}
          <p className="mt-2 text-[12px] text-ink/60">We only use your email for this one message.</p>
        </form>
      )}
    </section>
  );
}
