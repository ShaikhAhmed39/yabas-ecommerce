import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Gift, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/api';

export interface ScratchCardData {
  id: string;
  order_number: string;
  status: 'unrevealed' | 'revealed' | string;
  prize_label: string | null;
  code: string | null;
  valid_until: string | null;
  min_order: number | null;
}
interface Prize { prize_label: string; code: string; valid_until: string | null; min_order: number | null }

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function PrizeFace({ prize }: { prize: Prize }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(prize.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <Sparkles className="h-6 w-6 text-gold-500" aria-hidden />
      <p className="mt-1 font-display text-lg leading-tight text-maroon-500">{prize.prize_label}</p>
      <button onClick={() => void copy()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded border-2 border-dashed border-gold-500 bg-white px-4 font-mono text-base tracking-widest text-ink">
        {prize.code}{copied ? <Check className="h-4 w-4 text-[#1B6E45]" /> : <Copy className="h-4 w-4" />}
      </button>
      <p className="mt-2 text-xs text-ink/65">
        {prize.min_order ? `On orders above ₹${prize.min_order}. ` : ''}Valid until {fmtDate(prize.valid_until)}. One use. Enter it at checkout.
      </p>
    </div>
  );
}

/**
 * Scratch-and-reveal card. The prize is picked and stored on the server when the payment is confirmed
 * and is only sent to the browser after the customer starts scratching, so it cannot be peeked at.
 */
export function ScratchCard({ card, onRevealed }: { card: ScratchCardData; onRevealed?: () => void }) {
  const initial: Prize | null = card.status === 'revealed' && card.code
    ? { prize_label: card.prize_label ?? 'Reward', code: card.code, valid_until: card.valid_until, min_order: card.min_order } : null;
  const [prize, setPrize] = useState<Prize | null>(initial);
  const [cleared, setCleared] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const fetching = useRef(false);
  const down = useRef(false);

  const fetchPrize = useCallback(async () => {
    if (fetching.current || prize) return;
    fetching.current = true;
    const { data, error: e } = await supabase.rpc('reveal_scratch_card', { p_card_id: card.id });
    if (e || !data) { fetching.current = false; setError(errorMessage(e, 'Could not reveal the card. Please try again.')); return; }
    const d = data as { prize_label: string; code: string; valid_until: string | null; min_order: number | null };
    setPrize({ prize_label: d.prize_label, code: d.code, valid_until: d.valid_until, min_order: d.min_order });
    onRevealed?.();
  }, [card.id, prize, onRevealed]);

  useEffect(() => {
    if (cleared) return;
    const c = canvas.current; const w = wrap.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = w.getBoundingClientRect();
    c.width = width * dpr; c.height = height * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#F6DFA8'); g.addColorStop(0.45, '#E2B04F'); g.addColorStop(1, '#B8862D');
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(123,30,58,.55)';
    ctx.font = '600 15px Cinzel, serif'; ctx.textAlign = 'center';
    ctx.fillText('SCRATCH HERE', width / 2, height / 2 - 4);
    ctx.font = '12px Jost, sans-serif';
    ctx.fillText('to reveal your reward', width / 2, height / 2 + 16);
  }, [cleared]);

  const scratchAt = (clientX: number, clientY: number) => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(clientX - r.left, clientY - r.top, 22, 0, Math.PI * 2); ctx.fill();
  };

  const progress = () => {
    const c = canvas.current; const ctx = c?.getContext('2d');
    if (!c || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let clear = 0; const step = 16 * 4;
    for (let i = 3; i < data.length; i += step) if (data[i] === 0) clear++;
    return clear / (data.length / step);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!down.current) return;
    scratchAt(e.clientX, e.clientY);
    const p = progress();
    if (p > 0.12) void fetchPrize();
    if (p > 0.42 && prize) setCleared(true);
  };

  useEffect(() => { if (prize && !cleared) { /* wait for scratching to finish */ } }, [prize, cleared]);

  const revealNow = async () => { await fetchPrize(); setCleared(true); };

  return (
    <div className="mx-auto w-full max-w-sm">
      <div ref={wrap} className="frame-gold relative h-48 overflow-hidden rounded-lg bg-gradient-to-br from-cream-50 to-cream-200">
        <div className="absolute inset-0">
          {prize ? <PrizeFace prize={prize} /> : (
            <div className="flex h-full flex-col items-center justify-center text-center text-ink/60"><Gift className="h-7 w-7 text-gold-500" aria-hidden /><p className="mt-2 text-sm">Your reward is waiting</p></div>
          )}
        </div>
        {!cleared && (
          <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none cursor-pointer"
            onPointerDown={(e) => { down.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); onMove(e); }}
            onPointerMove={onMove}
            onPointerUp={() => { down.current = false; if (prize) setCleared(true); }}
            onPointerCancel={() => { down.current = false; }} />
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-center text-sm text-maroon-500">{error}</p>}
      {!cleared && <button onClick={() => void revealNow()} className="mx-auto mt-3 block min-h-10 text-sm text-onyx-300 underline underline-offset-4">Reveal without scratching</button>}
    </div>
  );
}
