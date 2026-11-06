import { Check } from 'lucide-react';
import type { Step } from '@/lib/orders';

/** Horizontal progress tracker (scrolls on very small screens). Purely presentational. */
export function Stepper({ steps, compact = false, ariaLabel }: { steps: Step[]; compact?: boolean; ariaLabel: string }) {
  return (
    <ol aria-label={ariaLabel} className="flex w-full items-start overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => (
        <li
          key={step.key}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="relative flex min-w-[4.5rem] flex-1 flex-col items-center text-center"
        >
          {i > 0 && (
            <span
              aria-hidden
              className={`absolute right-1/2 top-3 h-0.5 w-full ${
                step.state === 'todo' ? 'bg-cream-400' : 'bg-gold-400'
              }`}
            />
          )}
          <span
            className={`relative z-10 flex items-center justify-center rounded-full border-2 ${
              compact ? 'h-5 w-5' : 'h-6 w-6'
            } ${
              step.state === 'done'
                ? 'border-gold-500 bg-gold-500 text-white'
                : step.state === 'current'
                  ? 'border-gold-500 bg-white text-gold-600 ring-4 ring-gold-100'
                  : 'border-cream-400 bg-white text-transparent'
            }`}
          >
            {step.state === 'done' ? <Check size={compact ? 11 : 13} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <span
            className={`mt-2 px-1 text-[11px] leading-tight sm:text-xs ${
              step.state === 'todo' ? 'text-stone-400' : step.state === 'current' ? 'font-semibold text-onyx-300' : 'text-stone-700'
            }`}
          >
            {step.title}
          </span>
        </li>
      ))}
    </ol>
  );
}
