import { useEffect, useState } from 'react';
import { TrendingUp, ChevronDown, X } from 'lucide-react';
import { useGoldPrice } from '@/hooks/useGoldPrice';
import { formatINR } from '@/utils/format';

export function GoldTicker() {
  const { goldPrice, loading } = useGoldPrice();
  const [popupOpen, setPopupOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const purityRows = [
    { label: '24 Carat Pure Gold', perGram: goldPrice?.price_per_gram_24k ?? 0 },
  ];

  return (
    <>
      <div
        className={`w-full bg-onyx-300 text-gold-200 border-b border-black transition-opacity duration-500 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-center">
          <button
            onClick={() => setPopupOpen(true)}
            className="flex items-center gap-2 text-xs sm:text-sm text-cream-200 hover:text-gold-300 transition-colors duration-200 px-3 sm:px-4 py-2"
          >
            <TrendingUp className="h-3.5 w-3.5 text-gold-300" aria-hidden />
            <span className="flex items-center gap-1.5">
              {goldPrice
                ? <>Mumbai 24K gold today: <strong className="font-medium text-gold-200">{formatINR(goldPrice.price_per_gram_24k)}</strong> per gram</>
                : <>See today&apos;s Mumbai 24K gold rate</>}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </span>
          </button>
        </div>
      </div>

      {/* Gold Rate Popup */}
      {popupOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-start justify-center pt-16 sm:pt-24 px-4 animate-fade-in"
          onClick={() => setPopupOpen(false)}
        >
          <div className="absolute inset-0 bg-onyx-500/50 backdrop-blur-md" />

          <div
            className="relative w-full max-w-md bg-cream-100 rounded-2xl shadow-medium overflow-hidden animate-scale-in border border-gold-200/30"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-onyx-300 to-onyx-400 px-5 py-5 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-cream-100">
                  Mumbai, Maharashtra · 24K Gold
                </h3>
                <p className="text-xs text-cream-300 mt-0.5">
                  Updated 3 times a day on weekdays
                </p>
              </div>
              <button
                onClick={() => setPopupOpen(false)}
                className="p-1.5 rounded-full hover:bg-cream-100/10 text-cream-300 hover:text-cream-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Rate table */}
            <div className="p-5">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-gold-200 border-t-gold-400 animate-spin" />
                    <p className="text-sm text-onyx-300">Fetching gold rate...</p>
                  </div>
                </div>
              ) : goldPrice ? (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-3 gap-2 mb-3 pb-2 border-b border-gold-200/40">
                    <span className="text-[10px] font-semibold text-onyx-300 uppercase tracking-wider">Purity</span>
                    <span className="text-[10px] font-semibold text-onyx-300 uppercase tracking-wider text-right">1 Gram</span>
                    <span className="text-[10px] font-semibold text-onyx-300 uppercase tracking-wider text-right">10 Grams</span>
                  </div>

                  {/* Rate rows */}
                  <div className="space-y-3">
                    {purityRows.map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-3 gap-2 items-center py-2.5 px-3 rounded-xl bg-cream-200/40 hover:bg-gold-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-onyx-300">{row.label}</span>
                        <span className="font-display text-sm font-bold text-onyx-300 text-right">
                          {formatINR(row.perGram)}
                        </span>
                        <span className="font-display text-sm font-bold text-gold-500 text-right">
                          {formatINR(row.perGram * 10)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Footer note */}
                  <div className="mt-4 pt-3 border-t border-gold-200/30">
                    <p className="text-[11px] text-onyx-300 leading-relaxed">
                      Indicative 24K gold rate per gram for Mumbai, Maharashtra.
                      Prices vary by city and state, so please check your nearest
                      jeweller for the exact rate. Jewellery pricing also varies
                      with making charges, wastage and GST.
                    </p>
                    {Date.now() - new Date(goldPrice.timestamp).getTime() > 36 * 3600 * 1000 && (
                      <p role="status" className="mt-2 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        This rate has not been refreshed for over a day. Please treat it as old.
                      </p>
                    )}
                    <p className="text-[10px] text-onyx-100 mt-2">
                      Last updated:{' '}
                      {new Date(goldPrice.timestamp).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-onyx-300">Gold rate temporarily unavailable.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}