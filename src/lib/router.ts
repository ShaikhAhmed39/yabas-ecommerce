import { useEffect, useState } from 'react';
import type { Product } from '@/types';

/** Clean-URL router (History API). Real paths like /products/kundan-choker and /collections/necklace,
 *  so Google can index every page. Old #/ links still work: they are converted on first load. */
export type Route =
  | { name: 'home' }
  | { name: 'shop'; category: string; q: string }
  | { name: 'product'; id: string }
  | { name: 'checkout' }
  | { name: 'track'; order?: string }
  | { name: 'wishlist' }
  | { name: 'orders' }
  | { name: 'return' }
  | { name: 'admin' };

/** "Gold Plated Necklaces" -> "gold-plated-necklaces" */
export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** The address of a product page. Falls back to the id until the product has a slug. */
export const productHref = (p: Pick<Product, 'id'> & { slug?: string | null }) => `/products/${encodeURIComponent(p.slug || p.id)}`;
export const collectionHref = (category: string) => `/collections/${slugify(category)}`;
export const shopHref = (category = 'All', q = '') => {
  const base = category === 'All' ? '/shop' : collectionHref(category);
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
};

/** Paths the single-page app handles itself. Anything else (policy pages, files) is a normal page load. */
const APP_PATH = /^\/($|shop|collections\/|products\/|checkout|track|wishlist|orders|my-orders|return|return-request|admin)/;
export const isAppPath = (pathname: string) => APP_PATH.test(pathname);

export function parsePath(pathname: string, search: string): Route {
  const params = new URLSearchParams(search);
  const seg = pathname.split('/').filter(Boolean);
  switch (seg[0]) {
    case 'shop': return { name: 'shop', category: params.get('cat') ?? 'All', q: params.get('q') ?? '' };
    case 'collections': return { name: 'shop', category: seg[1] ? decodeURIComponent(seg[1]) : 'All', q: params.get('q') ?? '' };
    case 'products': case 'product': return seg[1] ? { name: 'product', id: decodeURIComponent(seg[1]) } : { name: 'home' };
    case 'checkout': return { name: 'checkout' };
    case 'track': return { name: 'track', order: params.get('order') ?? undefined };
    case 'wishlist': return { name: 'wishlist' };
    case 'orders': case 'my-orders': return { name: 'orders' };
    case 'return': case 'return-request': return { name: 'return' };
    case 'admin': return { name: 'admin' };
    default: return { name: 'home' };
  }
}

/** Old links like #/product/<id> or #/shop?cat=Necklace -> new address (done once, without adding a history entry). */
function upgradeOldHashLink() {
  const h = window.location.hash;
  if (!h.startsWith('#/')) return;
  const [path, query = ''] = h.slice(1).split('?');
  const params = new URLSearchParams(query);
  let next = path;
  if (path === '/shop' && params.get('cat')) { next = collectionHref(params.get('cat') ?? ''); params.delete('cat'); }
  if (path.startsWith('/product/')) next = path.replace('/product/', '/products/');
  const rest = params.toString();
  window.history.replaceState(null, '', `${next}${rest ? `?${rest}` : ''}`);
}
if (typeof window !== 'undefined') upgradeOldHashLink();

const EVENT = 'yabas:navigate';
const notify = () => window.dispatchEvent(new Event(EVENT));

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname, window.location.search));
  useEffect(() => {
    const on = () => setRoute(parsePath(window.location.pathname, window.location.search));
    window.addEventListener('popstate', on);
    window.addEventListener(EVENT, on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener(EVENT, on); };
  }, []);
  return route;
}

/** Go to a page without reloading. Accepts "/shop", "shop" or the old "#/shop" style. */
export function go(path: string, opts: { replace?: boolean } = {}) {
  const clean = path.replace(/^#/, '');
  const target = clean.startsWith('/') ? clean : `/${clean}`;
  if (`${window.location.pathname}${window.location.search}` === target) { window.scrollTo({ top: 0 }); return; }
  if (opts.replace) window.history.replaceState(null, '', target); else window.history.pushState(null, '', target);
  notify();
}

/** Makes every normal <a href="/..."> link switch pages without a reload (real links stay real for Google). */
export function installLinkHandler() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    const url = new URL(href, window.location.origin);
    if (!isAppPath(url.pathname)) return;
    e.preventDefault();
    go(`${url.pathname}${url.search}`);
  });
}
