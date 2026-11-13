import { useEffect } from 'react';
import { SITE_URL, BRAND, type Json } from '@/lib/schema';

export interface Seo {
  title: string;
  description?: string;
  /** path such as /products/kundan-choker (canonical address) */
  path?: string;
  image?: string;
  /** keep this page out of Google (cart, checkout, account, search results) */
  noindex?: boolean;
  type?: 'website' | 'product';
  jsonLd?: Json[];
}

export const seoTitle = (title: string) => (title.includes('Yaba') ? title : `${title} | ${BRAND}`);
export const seoRobots = (noindex?: boolean) => (noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large');

function meta(attr: 'name' | 'property', key: string, value: string | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) { el?.remove(); return; }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', value);
}

/** Sets the title, description, canonical address, social preview and JSON-LD for the current page. */
export function useSeo(seo: Seo | null) {
  const key = seo ? JSON.stringify(seo) : '';
  useEffect(() => {
    if (!seo) return;
    const full = seoTitle(seo.title);
    document.title = full;
    meta('name', 'description', seo.description);
    meta('name', 'robots', seoRobots(seo.noindex));
    const url = seo.path ? `${SITE_URL}${seo.path}` : undefined;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) link?.remove();
    else { if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); } link.href = url; }
    meta('property', 'og:title', full); meta('property', 'og:description', seo.description); meta('property', 'og:url', url);
    meta('property', 'og:type', seo.type ?? 'website'); meta('property', 'og:site_name', BRAND);
    meta('property', 'og:image', seo.image ?? `${SITE_URL}/yabas_logo.png`);
    meta('name', 'twitter:title', full); meta('name', 'twitter:description', seo.description); meta('name', 'twitter:image', seo.image ?? `${SITE_URL}/yabas_logo.png`);

    document.head.querySelectorAll('script[data-seo]').forEach((n) => n.remove());
    for (const obj of seo.jsonLd ?? []) {
      const s = document.createElement('script');
      s.type = 'application/ld+json'; s.dataset.seo = '1'; s.text = JSON.stringify(obj);
      document.head.appendChild(s);
    }
    return () => { document.head.querySelectorAll('script[data-seo]').forEach((n) => n.remove()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
