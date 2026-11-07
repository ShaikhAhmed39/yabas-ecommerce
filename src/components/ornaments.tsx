import type { ReactNode } from 'react';

/** Slowly turning mandala that sits behind hero and banner content. Pure decoration. */
export function Mandala({ className = '' }: { className?: string }) {
  const petals = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true" fill="none" stroke="#E2B04F" strokeOpacity=".5">
      <circle cx="200" cy="200" r="196" strokeOpacity=".35" />
      <circle cx="200" cy="200" r="150" strokeOpacity=".4" />
      <circle cx="200" cy="200" r="96" strokeOpacity=".45" />
      <circle cx="200" cy="200" r="44" strokeOpacity=".5" />
      {petals.map((a) => (
        <g key={a} transform={`rotate(${a} 200 200)`}>
          <path d="M200 52 C214 92 214 120 200 150 C186 120 186 92 200 52Z" />
          <path d="M200 110 C208 128 208 138 200 152 C192 138 192 128 200 110Z" strokeOpacity=".35" />
          <circle cx="200" cy="30" r="3" fill="#E2B04F" fillOpacity=".5" stroke="none" />
        </g>
      ))}
    </svg>
  );
}

export function OrnDivider({ className = '' }: { className?: string }) {
  return <div className={`orn-divider ${className}`} aria-hidden="true"><span>◆ ◆ ◆</span></div>;
}

export function SectionHead({ title, sub, deva, light }: { title: string; sub?: string; deva?: string; light?: boolean }) {
  return (
    <div className="mx-auto mb-7 max-w-2xl px-4 text-center">
      {deva && <p className={`font-deva text-base ${light ? 'text-gold-200' : 'text-maroon-500'}`}>{deva}</p>}
      <h2 className={`font-display text-2xl tracking-[0.08em] sm:text-3xl ${light ? 'text-gold-100' : 'text-onyx-300'}`}>{title}</h2>
      {sub && <p className={`mt-2 text-sm sm:text-base ${light ? 'text-cream-200/85' : 'text-ink/70'}`}>{sub}</p>}
    </div>
  );
}

export function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</section>;
}
