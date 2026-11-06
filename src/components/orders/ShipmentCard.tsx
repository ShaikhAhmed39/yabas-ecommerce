import { useState } from 'react';
import { Check, Copy, ExternalLink, Truck } from 'lucide-react';
import { formatDate, label, type Shipment } from '@/lib/orders';

/** Courier details + live activity feed for one shipment (forward delivery or return pickup). */
export function ShipmentCard({ shipment, title }: { shipment: Shipment; title: string }) {
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const events = [...(shipment.events ?? [])].sort(
    (a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime(),
  );
  const shown = showAll ? events : events.slice(0, 3);

  const copy = async () => {
    if (!shipment.awb_code) return;
    try {
      await navigator.clipboard.writeText(shipment.awb_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the number is still visible to copy by hand */
    }
  };

  const safeLink = shipment.tracking_url && /^https:\/\//i.test(shipment.tracking_url) ? shipment.tracking_url : null;

  return (
    <div className="rounded-xl border border-cream-400 bg-cream-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-onyx-300">
          <Truck size={16} className="text-gold-600" aria-hidden /> {title}
        </p>
        <span className="rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 text-xs font-medium text-gold-800">
          {label(shipment.status)}
        </span>
      </div>

      {shipment.awb_code ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-stone-500">Courier</dt>
            <dd className="text-stone-800">{shipment.courier_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Tracking number</dt>
            <dd className="flex items-center gap-1.5 font-mono text-stone-800">
              {shipment.awb_code}
              <button
                type="button"
                onClick={copy}
                aria-label="Copy tracking number"
                className="rounded p-1 text-stone-500 hover:bg-cream-300 hover:text-stone-900"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">
              {shipment.direction === 'return' && !shipment.picked_up_at ? 'Pickup' : 'Expected delivery'}
            </dt>
            <dd className="text-stone-800">
              {shipment.direction === 'return' && !shipment.picked_up_at
                ? formatDate(shipment.pickup_scheduled_at)
                : formatDate(shipment.etd)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-stone-600">Tracking details will appear here as soon as the courier is assigned.</p>
      )}

      {safeLink && (
        <a
          href={safeLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold-700 underline-offset-2 hover:underline"
        >
          Track on courier website <ExternalLink size={13} aria-hidden />
        </a>
      )}

      {events.length > 0 && (
        <div className="mt-4 border-t border-cream-400 pt-3">
          <ul className="space-y-2.5">
            {shown.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                <div>
                  <p className="text-stone-800">{e.activity || label(e.mapped_status)}</p>
                  <p className="text-xs text-stone-500">
                    {formatDate(e.event_time, true)}
                    {e.location ? ` · ${e.location}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {events.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs font-medium text-gold-700 hover:underline"
            >
              {showAll ? 'Show less' : `Show all ${events.length} updates`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
