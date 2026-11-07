import type { ReactNode } from 'react';

export const inputCls = 'h-11 w-full rounded-lg border border-cream-400 bg-white px-3 text-[15px] text-ink placeholder:text-ink/40 focus:border-onyx-300 focus:outline-none focus:ring-2 focus:ring-onyx-300/20';
export const btnPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-onyx-300 px-5 text-sm font-medium text-white transition hover:bg-onyx-200 disabled:opacity-50';
export const btnGhost = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cream-400 bg-white px-4 text-sm font-medium text-onyx-300 transition hover:bg-cream-100 disabled:opacity-50';
export const btnDanger = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50';

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-cream-400 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-300 px-4 py-3 sm:px-5">
          {title && <h2 className="font-display text-base tracking-wide text-onyx-300">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/55">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub, tone = 'neutral' }: { label: string; value: ReactNode; sub?: string; tone?: 'neutral' | 'warn' | 'good' | 'bad' }) {
  const bar = { neutral: 'bg-onyx-300', warn: 'bg-amber-500', good: 'bg-emerald-600', bad: 'bg-red-600' }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-cream-400 bg-white p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="text-xs uppercase tracking-wider text-ink/60">{label}</p>
      <p className="mt-1 font-display text-2xl text-onyx-300">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/55">{sub}</p>}
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const cls = { error: 'border-red-200 bg-red-50 text-red-800', ok: 'border-emerald-200 bg-emerald-50 text-emerald-800', info: 'border-sky-200 bg-sky-50 text-sky-900' }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex min-h-11 items-center gap-3 text-sm text-ink">
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-onyx-300' : 'bg-cream-400'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}
