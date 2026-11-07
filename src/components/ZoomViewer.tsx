import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';

interface Props { images: string[]; start: number; title: string; onClose: () => void }

const MAX = 5;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Full-screen photo viewer: pinch / wheel / double-tap zoom anchored at the finger or cursor,
 * drag to pan when zoomed, swipe or arrows to change photo, thumbnail strip, keyboard support.
 */
export function ZoomViewer({ images, start, title, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: number } | null>(null);
  const lastTap = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const bounds = useCallback((s: number) => {
    const r = box.current?.getBoundingClientRect();
    const w = r?.width ?? 0; const h = r?.height ?? 0;
    return { mx: (w * (s - 1)) / 2, my: (h * (s - 1)) / 2 };
  }, []);

  const apply = useCallback((s: number, x: number, y: number) => {
    const ns = clamp(s, 1, MAX);
    const b = bounds(ns);
    setView({ s: ns, x: ns === 1 ? 0 : clamp(x, -b.mx, b.mx), y: ns === 1 ? 0 : clamp(y, -b.my, b.my) });
  }, [bounds]);

  /** zoom to newS keeping the point (cx, cy), measured from the box centre, fixed on screen */
  const zoomAt = useCallback((newS: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const ns = clamp(newS, 1, MAX);
    const k = ns / v.s;
    apply(ns, cx - (cx - v.x) * k, cy - (cy - v.y) * k);
  }, [apply]);

  const centre = () => {
    const r = box.current?.getBoundingClientRect();
    return { r, cx: r ? r.left + r.width / 2 : 0, cy: r ? r.top + r.height / 2 : 0 };
  };

  const go = useCallback((d: number) => {
    setIndex((i) => (i + d + images.length) % images.length);
    setView({ s: 1, x: 0, y: 0 });
  }, [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && images.length > 1) go(1);
      else if (e.key === 'ArrowLeft' && images.length > 1) go(-1);
      else if (e.key === '+' || e.key === '=') zoomAt(viewRef.current.s * 1.4, 0, 0);
      else if (e.key === '-') zoomAt(viewRef.current.s / 1.4, 0, 0);
      else if (e.key === '0') apply(1, 0, 0);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [go, onClose, zoomAt, apply, images.length]);

  // wheel must be non-passive to stop the page scrolling behind
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { cx, cy } = centre();
      zoomAt(viewRef.current.s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX - cx, e.clientY - cy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: viewRef.current.s };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: 0 };
      setDragging(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { cx, cy } = centre();
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(pinch.current.s * (d / pinch.current.d), (a.x + b.x) / 2 - cx, (a.y + b.y) / 2 - cy);
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y;
      drag.current.moved = Math.max(drag.current.moved, Math.hypot(dx, dy));
      if (viewRef.current.s > 1) apply(viewRef.current.s, drag.current.vx + dx, drag.current.vy + dy);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinch = pointers.current.size === 2;
    pointers.current.delete(e.pointerId);
    if (wasPinch) { pinch.current = null; drag.current = null; return; }
    setDragging(false);
    const d = drag.current; drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (viewRef.current.s === 1 && Math.abs(dx) > 60 && Math.abs(e.clientY - d.y) < 80 && images.length > 1) { go(dx < 0 ? 1 : -1); return; }
    if (d.moved < 8) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        const { cx, cy } = centre();
        if (viewRef.current.s > 1) apply(1, 0, 0); else zoomAt(2.6, e.clientX - cx, e.clientY - cy);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };

  const btn = 'grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-30';

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#05201F]" role="dialog" aria-modal="true" aria-label={`${title} photos`}>
      <div className="flex items-center justify-between px-3 py-2 text-cream-100">
        <p className="px-2 text-sm" aria-live="polite">{index + 1} / {images.length}<span className="ml-3 hidden text-cream-200/70 sm:inline">Scroll, pinch or double-tap to zoom</span></p>
        <button onClick={onClose} className={btn} aria-label="Close viewer"><X className="h-5 w-5" /></button>
      </div>

      <div
        ref={box}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className="pinch-zoom-container relative min-h-0 flex-1 overflow-hidden"
        style={{ cursor: view.s > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          src={images[index]} alt={`${title}, photo ${index + 1}`} draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: dragging || pointers.current.size ? 'none' : 'transform .18s ease-out' }}
        />
        {images.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); go(-1); }} onPointerDown={(e) => e.stopPropagation()} className={`${btn} absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid`} aria-label="Previous photo"><ChevronLeft className="h-6 w-6" /></button>
            <button onClick={(e) => { e.stopPropagation(); go(1); }} onPointerDown={(e) => e.stopPropagation()} className={`${btn} absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid`} aria-label="Next photo"><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => zoomAt(view.s / 1.5, 0, 0)} disabled={view.s <= 1} className={btn} aria-label="Zoom out"><Minus className="h-5 w-5" /></button>
          <span className="min-w-[3.5rem] rounded-full bg-black/40 px-3 py-2 text-center text-xs text-white">{Math.round(view.s * 100)}%</span>
          <button onClick={() => zoomAt(view.s * 1.5, 0, 0)} disabled={view.s >= MAX} className={btn} aria-label="Zoom in"><Plus className="h-5 w-5" /></button>
          <button onClick={() => apply(1, 0, 0)} disabled={view.s === 1} className={btn} aria-label="Reset zoom"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-3 py-3 scrollbar-hide">
          {images.map((src, i) => (
            <button key={src + i} onClick={() => { setIndex(i); setView({ s: 1, x: 0, y: 0 }); }} aria-label={`Show photo ${i + 1}`} aria-current={i === index}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded border-2 ${i === index ? 'border-gold-400' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
