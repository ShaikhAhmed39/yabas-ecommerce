import type { Product } from '@/types';

export const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'><rect width='400' height='500' fill='#ECE2CF'/><text x='200' y='260' font-family='serif' font-size='44' fill='#A98445' text-anchor='middle'>Yaba's</text></svg>",
);

/** All photos of a piece in order: main photo first, then the other angles. */
export function productImages(p: Pick<Product, 'image_url' | 'gallery_urls'>): string[] {
  const all = [p.image_url, ...(p.gallery_urls ?? [])].filter((u): u is string => typeof u === 'string' && u.length > 0);
  return [...new Set(all)];
}

const R2_PHOTO = /^(https:\/\/[^/]+\/p\/[a-z0-9]{6,32})\.webp$/;

/**
 * Smaller copy of a photo for thumbnails: 'sm' (480 px) for cards/cart, 'md' (900 px) for product pages.
 * Only photos stored on our R2 images host have these sizes; any other URL is returned unchanged.
 */
export function imgVariant(url: string | null | undefined, size: 'sm' | 'md'): string {
  if (!url) return PLACEHOLDER_IMG;
  const m = R2_PHOTO.exec(url);
  return m && !/supabase\.co|cloudinary\.com/.test(url) ? `${m[1]}-${size}.webp` : url;
}
