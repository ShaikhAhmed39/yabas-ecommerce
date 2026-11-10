import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ScratchCard, type ScratchCardData } from '@/components/ScratchCard';

/** "My rewards": unscratched cards first, then earned coupon codes. Renders nothing when the customer has no cards. */
export function RewardsSection() {
  const [cards, setCards] = useState<ScratchCardData[]>([]);
  const load = async () => {
    const { data } = await supabase.rpc('my_scratch_cards');
    setCards(Array.isArray(data) ? (data as ScratchCardData[]) : []);
  };
  useEffect(() => { void load(); }, []);
  if (cards.length === 0) return null;
  const fresh = cards.filter((c) => c.status === 'unrevealed');
  const earned = cards.filter((c) => c.status === 'revealed');
  return (
    <section aria-labelledby="rewards" className="mb-8 rounded-xl border border-gold-400 bg-cream-50 p-5">
      <h2 id="rewards" className="flex items-center gap-2 font-display text-lg tracking-wide text-maroon-500"><Gift className="h-5 w-5" aria-hidden />My rewards</h2>
      {fresh.length > 0 && (
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {fresh.map((c) => <div key={c.id}><p className="mb-2 text-center text-sm text-ink/70">From order {c.order_number}</p><ScratchCard card={c} onRevealed={() => void load()} /></div>)}
        </div>
      )}
      {earned.length > 0 && (
        <ul className="mt-4 divide-y divide-gold-400/30 text-sm">
          {earned.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-ink">{c.prize_label}</span>
              <span><span className="rounded border border-dashed border-gold-500 bg-white px-2 py-1 font-mono tracking-wider">{c.code}</span>
                <span className="ml-2 text-xs text-ink/60">until {c.valid_until ? new Date(c.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
