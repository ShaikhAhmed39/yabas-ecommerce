import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export interface DialogConfig {
  title: string;
  description?: string;
  /** Show a text/number box. */
  input?: { label: string; type?: 'text' | 'number' | 'textarea'; defaultValue?: string; required?: boolean; min?: number; max?: number; step?: number; placeholder?: string };
  confirmLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: (value: string) => Promise<void>;
}

/** Small accessible modal that replaces window.prompt / window.confirm in the admin screens. */
export function ActionDialog({ config, onClose }: { config: DialogConfig | null; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!config) return;
    setValue(config.input?.defaultValue ?? '');
    setError(null);
    setBusy(false);
    const t = window.setTimeout(() => (firstField.current ?? confirmBtn.current)?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [config, busy, onClose]);

  if (!config) return null;
  const input = config.input;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (input?.required && !v) return setError(`${input.label} is required.`);
    if (input?.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return setError('Enter a valid amount.');
      if (input.max !== undefined && n > input.max) return setError(`The amount cannot be more than ${input.max}.`);
    }
    setBusy(true);
    setError(null);
    try {
      await config.onConfirm(v);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-onyx-500/60 p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-medium"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="action-dialog-title" className="font-serif text-2xl text-onyx-300">{config.title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-stone-500 hover:bg-cream-200"><X size={18} /></button>
        </div>
        {config.description && <p className="mt-2 text-sm text-stone-600">{config.description}</p>}

        {input && (
          <div className="mt-4">
            <label htmlFor="action-dialog-input" className="block text-xs font-medium text-stone-700">{input.label}{input.required ? ' *' : ''}</label>
            {input.type === 'textarea' ? (
              <textarea
                id="action-dialog-input" ref={firstField} rows={3} value={value} onChange={(e) => setValue(e.target.value)}
                placeholder={input.placeholder} maxLength={1000}
                className="mt-1 w-full rounded-lg border border-cream-400 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200"
              />
            ) : (
              <input
                id="action-dialog-input" ref={firstField} value={value} onChange={(e) => setValue(e.target.value)}
                type={input.type === 'number' ? 'number' : 'text'} min={input.min} max={input.max} step={input.step} placeholder={input.placeholder}
                className="mt-1 w-full rounded-lg border border-cream-400 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-200"
              />
            )}
          </div>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-cream-400 px-4 py-2 text-sm hover:bg-cream-100">Cancel</button>
          <button
            ref={confirmBtn} type="submit" disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${config.tone === 'danger' ? 'bg-red-700 hover:bg-red-800' : 'bg-onyx-300 hover:bg-onyx-200'}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />} {config.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
