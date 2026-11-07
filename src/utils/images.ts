import type { Product } from '@/types';

export const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'><rect width='400' height='500' fill='#0A3A38'/><text x='200' y='260' font-family='serif' font-size='44' fill='#E2B04F' text-anchor='middle'>Yaba's</text></svg>",
);

/** All photos of a piece in order: main photo first, then the other angles. */
export function productImages(p: Pick<Product, 'image_url' | 'gallery_urls'>): string[] {
  const all = [p.image_url, ...(p.gallery_urls ?? [])].filter((u): u is string => typeof u === 'string' && u.length > 0);
  return [...new Set(all)];
}
