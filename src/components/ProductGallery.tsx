import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { ZoomViewer } from '@/components/ZoomViewer';
import { PLACEHOLDER_IMG } from '@/utils/images';

const LENS = 40; // lens covers 40% of the photo => 250% magnification
const ZOOM = 100 / (LENS / 100) ;
const lensPos = (p: number) => Math.min(100 - LENS, Math.max(0, p - LENS / 2));

/** Swipeable photo gallery. Desktop: side-by-side hover zoom, so the cursor never hides the detail. Everywhere: tap to open the full zoom viewer. Photos only (no video). */
export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const list = images.length ? images : [PLACEHOLDER_IMG];
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => { setActive(0); strip.current?.scrollTo({ left: 0 }); }, [images.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  };
  const jump = (i: number) => { setActive(i); strip.current?.scrollTo({ left: i * (strip.current.clientWidth), behavior: 'smooth' }); };

  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[84px_minmax(0,1fr)] lg:gap-4">
      {list.length > 1 && (
        <div className="order-2 mt-3 flex gap-2 overflow-x-auto scrollbar-hide lg:order-1 lg:mt-0 lg:max-h-[600px] lg:flex-col" role="tablist" aria-label="Photos">
          {list.map((src, i) => (
            <button key={src + i} role="tab" aria-selected={i === active} onClick={() => jump(i)} aria-label={`Photo ${i + 1}`}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded border-2 lg:h-[84px] lg:w-[84px] ${i === active ? 'border-gold-500' : 'border-gold-500/25 opacity-75 hover:opacity-100'}`}>
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="relative order-1 min-w-0 lg:order-2">
        <div className="frame-gold relative overflow-hidden rounded-md jewel-panel">
          <div ref={strip} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide">
            {list.map((src, i) => (
              <div key={src + i} className="relative aspect-[4/5] w-full flex-shrink-0 snap-center sm:aspect-square lg:aspect-[4/5]"
                onPointerMove={(e) => {
                  if (i !== active || e.pointerType !== 'mouse') return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setLens({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                }}
                onPointerLeave={() => setLens(null)}>
                <button type="button" onClick={() => setViewer(i)} className="absolute inset-0 cursor-zoom-in" aria-label={`Open photo ${i + 1} to zoom`}>
                  <img src={src} alt={`${title}, photo ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} draggable={false} className="h-full w-full object-cover" />
                </button>
                {lens && i === active && (
                  <div aria-hidden className="pointer-events-none absolute hidden border border-white/80 bg-white/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] lg:block"
                    style={{ width: `${LENS}%`, height: `${LENS}%`, left: `${lensPos(lens.x)}%`, top: `${lensPos(lens.y)}%` }} />
                )}
              </div>
            ))}
          </div>
          <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white"><Maximize2 className="h-3.5 w-3.5" aria-hidden />Tap to zoom</span>
          {list.length > 1 && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs text-white">{active + 1} / {list.length}</span>}
        </div>
        {lens && (
          <div aria-hidden className="frame-gold pointer-events-none absolute left-full top-0 z-40 ml-5 hidden aspect-[4/5] w-full overflow-hidden rounded-md bg-no-repeat shadow-medium lg:block"
            style={{ backgroundImage: `url("${list[active]}")`, backgroundSize: `${ZOOM}%`, backgroundPosition: `${lensPos(lens.x) / (100 - LENS) * 100}% ${lensPos(lens.y) / (100 - LENS) * 100}%` }} />
        )}
        {list.length > 1 && (
          <div className="mt-3 flex justify-center gap-2.5 lg:hidden" aria-hidden>
            {list.map((_, i) => <span key={i} className={`h-2 w-2 rotate-45 border border-gold-500 ${i === active ? 'bg-gold-500' : ''}`} />)}
          </div>
        )}
      </div>
      {viewer !== null && <ZoomViewer images={list} start={viewer} title={title} onClose={() => setViewer(null)} />}
    </div>
  );
}
