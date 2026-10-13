import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ShoppingBag, ChevronLeft, ChevronRight, ZoomIn, RotateCcw } from 'lucide-react';
import type { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { formatINR, calculateDiscount } from '@/utils/format';

interface LightboxState {
  product: Product;
  scale: number;
  rotation: number;
  translateX: number;
  translateY: number;
}

export function Lightbox() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const { addToCart, setCartOpen } = useCart();
  const containerRef = useRef<HTMLDivElement>(null);

  // Gesture refs
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const startDistanceRef = useRef<number>(0);
  const startScaleRef = useRef<number>(1);
  const startTranslateRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetTransforms = useCallback(() => {
    setScale(1);
    setRotation(0);
    setTranslateX(0);
    setTranslateY(0);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Product;
      const all = window.__allProducts__ ?? [detail];
      setProducts(all);
      const idx = all.findIndex((p) => p.id === detail.id);
      setIndex(idx >= 0 ? idx : 0);
      resetTransforms();
      setOpen(true);
    };
    window.addEventListener('open-lightbox', handler);
    return () => window.removeEventListener('open-lightbox', handler);
  }, [resetTransforms]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const current = products[index];

  const navigate = (dir: number) => {
    setIndex((prev) => (prev + dir + products.length) % products.length);
    resetTransforms();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  };

  // Pinch-to-zoom and pan handlers
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPanRef.current = { x: e.clientX, y: e.clientY };
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      startDistanceRef.current = dist;
      startScaleRef.current = scale;
      startTranslateRef.current = { x: translateX, y: translateY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // Pinch zoom
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (startDistanceRef.current > 0) {
        const newScale = Math.max(1, Math.min(5, startScaleRef.current * (dist / startDistanceRef.current)));
        setScale(newScale);
      }
    } else if (pointersRef.current.size === 1 && scale > 1) {
      // Pan
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      setTranslateX((prev) => prev + dx);
      setTranslateY((prev) => prev + dy);
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      startDistanceRef.current = 0;
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((prev) => Math.max(1, Math.min(5, prev + delta)));
  };

  const handleAddToCart = () => {
    if (!current || current.stock <= 0) return;
    addToCart(current);
    setOpen(false);
    setCartOpen(true);
  };

  if (!open || !current) return null;

  const discount = current.discount_percent || calculateDiscount(current.original_price, current.selling_price);

  return (
    <div
      className="fixed inset-0 z-[100] bg-onyx-500/95 animate-fade-in"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-4">
        <button
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 text-cream-100 hover:text-gold-300 transition-colors"
        >
          <X className="h-6 w-6" />
          <span className="text-sm font-medium hidden sm:inline">Close</span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={resetTransforms}
            className="text-cream-100 hover:text-gold-300 transition-colors p-2"
            title="Reset zoom"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <span className="text-cream-100 text-sm font-medium">
            {index + 1} / {products.length}
          </span>
        </div>
      </div>

      {/* Navigation arrows */}
      {products.length > 1 && (
        <>
          <button
            onClick={() => navigate(-1)}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 bg-cream-100/10 hover:bg-cream-100/20 text-cream-100 rounded-full p-2 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() => navigate(1)}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 bg-cream-100/10 hover:bg-cream-100/20 text-cream-100 rounded-full p-2 transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Image area */}
      <div
        ref={containerRef}
        className="pinch-zoom-container absolute inset-0 flex items-center justify-center overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => setScale((prev) => (prev > 1 ? 1 : 2.5))}
      >
        <img
          src={current.image_url}
          alt={current.title}
          className="max-w-full max-h-full object-contain transition-transform duration-100 ease-out select-none pointer-events-none"
          style={{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          draggable={false}
        />
      </div>

      {/* Info panel */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-onyx-500 via-onyx-500/90 to-transparent pt-12 pb-6 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs text-gold-300 font-medium uppercase tracking-wider mb-2">
            {current.category}
          </p>
          <h2 className="font-display text-xl sm:text-3xl font-bold text-cream-100 mb-3">
            {current.title}
          </h2>
          <p className="text-sm text-cream-300 mb-4 line-clamp-2">
            {current.description}
          </p>

          {/* Specs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {current.material_type && (
              <span className="text-xs text-cream-200 bg-cream-100/10 px-3 py-1 rounded-full">
                Material: {current.material_type}
              </span>
            )}
            {current.polish_finish && (
              <span className="text-xs text-cream-200 bg-cream-100/10 px-3 py-1 rounded-full">
                Finish: {current.polish_finish}
              </span>
            )}
            {current.dimensions && (
              <span className="text-xs text-cream-200 bg-cream-100/10 px-3 py-1 rounded-full">
                Size: {current.dimensions}
              </span>
            )}
          </div>

          {/* Price + add */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl sm:text-3xl font-bold text-gold-300">
                {formatINR(current.selling_price)}
              </span>
              {current.original_price > current.selling_price && (
                <>
                  <span className="text-base text-cream-300 line-through">
                    {formatINR(current.original_price)}
                  </span>
                  {discount > 0 && (
                    <span className="bg-gold-400 text-cream-100 text-xs font-bold px-2 py-1 rounded-full">
                      {discount}% OFF
                    </span>
                  )}
                </>
              )}
            </div>

            <button
              onClick={handleAddToCart}
              disabled={current.stock <= 0}
              className="flex items-center gap-2 px-6 py-3 gold-gradient text-cream-100 font-medium rounded-full shadow-gold hover:scale-[1.02] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingBag className="h-4 w-4" />
              {current.stock > 0 ? 'Add to Bag' : 'Out of Stock'}
            </button>
          </div>

          {/* Zoom hint */}
          <div className="mt-4 flex items-center gap-2 text-xs text-cream-400">
            <ZoomIn className="h-3.5 w-3.5" />
            <span>Pinch to zoom · Double-tap to zoom · Scroll to zoom</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Augment window for product gallery reference
declare global {
  interface Window {
    __allProducts__?: Product[];
  }
}
