import { useEffect, useState } from 'react';

/** Hash router: works on any static host and keeps the existing /privacy-policy style paths untouched. */
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

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const seg = path.split('/').filter(Boolean);
  switch (seg[0]) {
    case 'shop': return { name: 'shop', category: params.get('cat') ?? 'All', q: params.get('q') ?? '' };
    case 'product': return seg[1] ? { name: 'product', id: decodeURIComponent(seg[1]) } : { name: 'home' };
    case 'checkout': return { name: 'checkout' };
    case 'track': return { name: 'track', order: params.get('order') ?? undefined };
    case 'wishlist': return { name: 'wishlist' };
    case 'orders': case 'my-orders': return { name: 'orders' };
    case 'return': case 'return-request': return { name: 'return' };
    case 'admin': return { name: 'admin' };
    default: return { name: 'home' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash === target) window.scrollTo({ top: 0 });
  else window.location.hash = target;
}

export const shopHref = (category = 'All', q = '') => {
  const p = new URLSearchParams();
  if (category !== 'All') p.set('cat', category);
  if (q) p.set('q', q);
  const s = p.toString();
  return `#/shop${s ? `?${s}` : ''}`;
};
