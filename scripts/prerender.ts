/* Runs after `vite build` (see package.json). Reads the live catalogue and writes, into dist/:
 *   - a real HTML page for the home page, /shop, every collection and every product
 *     (title, description, canonical, JSON-LD and the readable text, so Google and AI crawlers see everything WITHOUT running JavaScript)
 *   - sitemap.xml, llms.txt, llms-full.txt
 * and (production only) tells IndexNow-enabled search engines that the pages changed.
 * The shop itself still runs as the normal React app: it replaces this text the moment it loads.
 * If anything here fails, the build still succeeds and the site simply works as before. */
import fs from 'node:fs';
import path from 'node:path';
import type { Product } from '../src/types';
import type { StoreConfig } from '../src/lib/storeConfig';
import {
  SITE_URL, BRAND, breadcrumbSchema, collectionFaqs, collectionSchema, faqSchema, organizationSchema,
  productSchema, productSpecs, productSummary, type Json,
} from '../src/lib/schema';
import { collectionHref, productHref } from '../src/lib/router';
import { productImages } from '../src/utils/images';
import { seoRobots, seoTitle } from '../src/lib/seo';
import { POLICY_LINKS } from '../src/lib/policies';

const DIST = path.resolve('dist');
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const INDEXNOW_KEY = 'f3a9c1d27e8b4a6f90d1b5c3e7a2486d';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const abs = (p: string) => `${SITE_URL}${p}`;

async function sb<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, { ...init, headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Supabase ${pathAndQuery} -> ${res.status}`);
  return (await res.json()) as T;
}

interface Page { urlPath: string; title: string; description: string; image?: string; type?: 'website' | 'product'; jsonLd: Json[]; body: string; noindex?: boolean }

function headFor(p: Page): string {
  const t = seoTitle(p.title);
  const img = p.image ?? `${SITE_URL}/yabas_logo.png`;
  return [
    `<title>${esc(t)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<meta name="robots" content="${seoRobots(p.noindex)}" />`,
    `<link rel="canonical" href="${abs(p.urlPath)}" />`,
    `<meta property="og:title" content="${esc(t)}" />`, `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${abs(p.urlPath)}" />`, `<meta property="og:type" content="${p.type ?? 'website'}" />`,
    `<meta property="og:site_name" content="${esc(BRAND)}" />`, `<meta property="og:image" content="${esc(img)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`, `<meta name="twitter:title" content="${esc(t)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`, `<meta name="twitter:image" content="${esc(img)}" />`,
    ...p.jsonLd.map((o) => `<script type="application/ld+json" data-seo="1">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`),
  ].join('\n    ');
}

function render(template: string, p: Page): string {
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta (?:name="description"|property="og:[a-z:_]+"|name="twitter:[a-z:_]+")[^>]*>\s*/g, '')
    .replace('</head>', `    ${headFor(p)}\n  </head>`);
  if (!html.includes('<div id="root"></div>')) throw new Error('index.html root not found');
  html = html.replace('<div id="root"></div>', `<div id="root">${p.body}</div>`);
  return html;
}

const nav = (extra = '') => `<header><p><a href="/">${esc(BRAND)}</a></p><nav aria-label="Main"><a href="/shop">Shop all</a> <a href="${POLICY_LINKS.shipping.href}">Delivery</a> <a href="${POLICY_LINKS.returns.href}">Returns</a> <a href="${POLICY_LINKS.care.href}">Jewellery care</a> <a href="${POLICY_LINKS.contact.href}">Contact</a></nav>${extra}</header>`;
const crumbs = (items: { name: string; path?: string }[]) => `<nav aria-label="Breadcrumb">${items.map((i) => (i.path ? `<a href="${i.path}">${esc(i.name)}</a>` : esc(i.name))).join(' &rsaquo; ')}</nav>`;
const productList = (list: Product[]) => `<ul>${list.map((p) => `<li><a href="${productHref(p)}">${esc(p.title)}</a> &ndash; ${inr(p.selling_price)}${p.stock > 0 ? '' : ' (sold out)'}</li>`).join('')}</ul>`;
const footer = (cats: string[]) => `<footer><p>${esc(BRAND)}, Mira Road, Mumbai. Imitation (gold-plated) jewellery, delivered across India.</p><p>${cats.map((c) => `<a href="${collectionHref(c)}">${esc(c)}</a>`).join(' | ')}</p></footer>`;

function buildPages(products: Product[], cfg: StoreConfig): Page[] {
  const pages: Page[] = [];
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const inStock = products.filter((p) => p.stock > 0);

  pages.push({
    urlPath: '/', title: "Yaba's Imitation & Jewellery | Gold-Plated Necklaces, Bangles & Bridal Sets, Mumbai",
    description: "Gold-plated (1 gram gold) necklaces, bangles, earrings and bridal sets from Mira Road, Mumbai. Imitation jewellery for weddings, festivals and daily wear, delivered across India.",
    jsonLd: organizationSchema(cfg),
    body: `${nav()}<main><h1>${esc(BRAND)}: gold-plated jewellery from Mumbai</h1><p>Necklaces, bangles, earrings and bridal sets in 1-gram gold-plated imitation jewellery, made for weddings, festivals and daily wear. Delivered across India with ${esc(cfg.delivery_estimate ? `${cfg.delivery_estimate}-day` : 'tracked')} shipping and 7-day returns.</p><h2>Shop by category</h2><ul>${cats.map((c) => `<li><a href="${collectionHref(c)}">${esc(c)}</a></li>`).join('')}</ul><h2>Available now</h2>${productList(inStock.slice(0, 12))}</main>${footer(cats)}`,
  });

  const shopIntro = `Shop ${products.length} pieces of gold-plated jewellery from Yaba's Imitation & Jewellery, Mira Road, Mumbai.`;
  pages.push({
    urlPath: '/shop', title: 'Gold-Plated Jewellery Online in India', description: `${shopIntro} Imitation jewellery with a 1-gram gold-plated finish, delivered across India.`.slice(0, 160),
    jsonLd: [collectionSchema('Gold-Plated Jewellery', '/shop', shopIntro, products), breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }]), faqSchema(collectionFaqs('All', cfg))],
    body: `${nav(crumbs([{ name: 'Home', path: '/' }, { name: 'Shop' }]))}<main><h1>The Collection</h1><p>${esc(shopIntro)}</p>${productList(products)}<section><h2>Questions buyers ask about our jewellery</h2>${collectionFaqs('All', cfg).map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section></main>${footer(cats)}`,
  });

  for (const cat of cats) {
    const list = products.filter((p) => p.category === cat);
    const cheapest = Math.min(...list.map((p) => p.selling_price));
    const intro = `Shop ${list.length} ${list.length === 1 ? 'piece' : 'pieces'} of gold-plated ${cat.toLowerCase()} from Yaba's Imitation & Jewellery, Mira Road, Mumbai, starting at ${inr(cheapest)}. Imitation jewellery with a 1-gram gold-plated finish, delivered across India.`;
    const faqs = collectionFaqs(cat, cfg);
    const urlPath = collectionHref(cat);
    pages.push({
      urlPath, title: `Gold-Plated ${cat} Online in India`, description: intro.slice(0, 160),
      jsonLd: [collectionSchema(`Gold-Plated ${cat}`, urlPath, intro, list), breadcrumbSchema([{ name: 'Home', path: '/' }, { name: cat, path: urlPath }]), faqSchema(faqs)],
      body: `${nav(crumbs([{ name: 'Home', path: '/' }, { name: cat }]))}<main><h1>Gold-Plated ${esc(cat)}</h1><p>${esc(intro)}</p>${productList(list)}<section><h2>Questions buyers ask about ${esc(cat.toLowerCase())}</h2>${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section></main>${footer(cats)}`,
    });
  }

  for (const p of products) {
    const specs = productSpecs(p);
    const related = [...products.filter((o) => o.id !== p.id && o.category === p.category && o.stock > 0), ...products.filter((o) => o.id !== p.id && o.category !== p.category && o.stock > 0)].slice(0, 4);
    const [img] = productImages(p);
    const desc = (p.description?.trim() || productSummary(p, cfg)).replace(/\s+/g, ' ').slice(0, 155);
    pages.push({
      urlPath: productHref(p), type: 'product', image: img, title: `${p.title} | Buy ${p.category || 'Jewellery'} Online`, description: desc,
      jsonLd: [productSchema(p, cfg), breadcrumbSchema([{ name: 'Home', path: '/' }, { name: p.category || 'Shop', path: p.category ? collectionHref(p.category) : '/shop' }, { name: p.title, path: productHref(p) }])],
      body: `${nav(crumbs([{ name: 'Home', path: '/' }, ...(p.category ? [{ name: p.category, path: collectionHref(p.category) }] : []), { name: p.title }]))}<main><article><h1>${esc(p.title)}</h1>${img ? `<img src="${esc(img)}" alt="${esc(p.title)}" width="800" height="1000" />` : ''}<p><strong>Quick summary:</strong> ${esc(productSummary(p, cfg))}</p><p>Price: ${inr(p.selling_price)}${p.original_price && p.original_price > p.selling_price ? ` (was ${inr(p.original_price)})` : ''}. ${p.stock > 0 ? 'In stock.' : 'Currently sold out.'}</p>${p.description ? `<h2>About this piece</h2><p>${esc(p.description)}</p>` : ''}<h2>Specifications &amp; Care</h2><table><tbody>${specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}<tr><th scope="row">Product type</th><td>Imitation jewellery, gold plated. Not solid gold.</td></tr><tr><th scope="row">Care</th><td>${esc(p.care_notes?.trim() || 'Keep dry, avoid perfume and water, store apart from other pieces.')}</td></tr></tbody></table><h2>Delivery and returns</h2><p>${esc(cfg.delivery_estimate ? `Delivered across India in ${cfg.delivery_estimate} working days after dispatch. ` : 'Delivered across India. ')}Return requests are accepted within 7 days of delivery. See the <a href="${POLICY_LINKS.returns.href}">Return &amp; Refund Policy</a>.</p></article><aside><h2>${p.stock > 0 ? 'You may also love' : 'Similar pieces available now'}</h2>${productList(related)}</aside></main>${footer(cats)}`,
    });
  }
  return pages;
}

function writeSitemap(products: Product[], cats: string[]) {
  const url = (loc: string, lastmod: string | null, extra = '') => `  <url><loc>${abs(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${extra}</url>`;
  const latest = products.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '').slice(0, 10) || null;
  const lines = [url('/', latest), url('/shop', latest), ...cats.map((c) => url(collectionHref(c), latest))];
  for (const p of products) {
    const imgs = productImages(p).slice(0, 5).map((i) => `<image:image><image:loc>${esc(i)}</image:loc><image:title>${esc(p.title)}</image:title></image:image>`).join('');
    lines.push(url(productHref(p), p.updated_at.slice(0, 10), imgs));
  }
  for (const k of ['shipping', 'returns', 'care', 'cancellation', 'contact', 'privacy', 'terms'] as const) lines.push(url(POLICY_LINKS[k].href, null)); // no date: we do not track when a policy text changes
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${lines.join('\n')}\n</urlset>\n`);
}

function writeLlms(products: Product[], cats: string[], cfg: StoreConfig) {
  const header = `# ${BRAND}\n\n> Gold-plated (1 gram gold) imitation jewellery from Mira Road, Mumbai, sold online across India at ${SITE_URL}. Necklaces, bangles, earrings and bridal sets for weddings, festivals and daily wear. The pieces are imitation jewellery with a gold-plated finish: not solid gold and not hallmarked.\n`;
  const policies = `## Policies\n${(['shipping', 'returns', 'cancellation', 'care', 'contact'] as const).map((k) => `- [${POLICY_LINKS[k].label}](${abs(POLICY_LINKS[k].href)})`).join('\n')}\n`;
  const collections = `## Collections\n${cats.map((c) => { const l = products.filter((p) => p.category === c); return `- [${c}](${abs(collectionHref(c))}): ${l.length} ${l.length === 1 ? 'piece' : 'pieces'} from ${inr(Math.min(...l.map((p) => p.selling_price)))}`; }).join('\n')}\n`;
  const short = `## Products\n${products.map((p) => `- [${p.title}](${abs(productHref(p))}): ${inr(p.selling_price)}, ${p.stock > 0 ? 'in stock' : 'sold out'}. ${[p.category, p.sub_category, p.occasion_wear].filter(Boolean).join(', ')}.`).join('\n')}\n`;
  fs.writeFileSync(path.join(DIST, 'llms.txt'), `${header}\n${collections}\n${short}\n${policies}`);
  const full = products.map((p) => `### ${p.title}\nURL: ${abs(productHref(p))}\n${productSummary(p, cfg)}\n${productSpecs(p).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`).join('\n');
  fs.writeFileSync(path.join(DIST, 'llms-full.txt'), `${header}\n${collections}\n## Product details\n\n${full}\n${policies}`);
}

/** Google's own product category names. Anything we cannot place falls back to plain Jewelry. */
function googleCategory(p: Product): string {
  const t = `${p.category} ${p.sub_category ?? ''}`.toLowerCase();
  const base = 'Apparel & Accessories > Jewelry';
  if (/necklace|haar|mangalsutra|chain|choker|pendant/.test(t)) return `${base} > Necklaces`;
  if (/bangle|kada|bracelet/.test(t)) return `${base} > Bracelets`;
  if (/earring|jhumka|stud|bali/.test(t)) return `${base} > Earrings`;
  if (/ring\b|finger/.test(t)) return `${base} > Rings`;
  if (/anklet|payal/.test(t)) return `${base} > Anklets`;
  if (/brooch|pin\b/.test(t)) return `${base} > Brooches & Lapel Pins`;
  return base;
}

/** Product feed for Google Merchant Center (free Shopping listings). Fetched daily from /feeds/google-products.xml */
function writeMerchantFeed(products: Product[], cfg: StoreConfig) {
  const tag = (name: string, value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '' : `<g:${name}>${esc(value)}</g:${name}>`);
  const items = products.map((p) => {
    const imgs = productImages(p);
    const onSale = p.original_price && p.original_price > p.selling_price;
    const list = (onSale ? p.original_price : p.selling_price) as number;
    // Google does not want prices, stock or offers inside the description: plain facts only
    const kind = (p.sub_category || p.category || 'jewellery').toLowerCase();
    const look = [p.material_type, p.polish_finish].filter((v) => v && v.trim()).join(', ');
    const text = `${p.description?.trim() ? `${p.description.trim()} ` : ''}${p.title} is a ${kind}${look ? ` (${look})` : ''}${p.occasion_wear ? `, suited to ${p.occasion_wear.toLowerCase()} wear` : ''}. It is imitation jewellery with a gold-plated finish, not solid gold.`;
    return `    <item>
      ${tag('id', p.slug)}
      <title>${esc(p.title.slice(0, 150))}</title>
      <description>${esc(text.slice(0, 4900))}</description>
      <link>${abs(productHref(p))}</link>
      ${tag('image_link', imgs[0])}
      ${imgs.slice(1, 10).map((i) => tag('additional_image_link', i)).join('')}
      ${tag('availability', p.stock > 0 ? 'in_stock' : 'out_of_stock')}
      ${tag('price', `${list.toFixed(2)} INR`)}
      ${onSale ? tag('sale_price', `${Number(p.selling_price).toFixed(2)} INR`) : ''}
      ${tag('condition', 'new')}
      ${tag('brand', "Yaba's")}
      ${tag('identifier_exists', 'no')}
      ${tag('google_product_category', googleCategory(p))}
      ${tag('product_type', [p.category, p.sub_category].filter(Boolean).join(' > '))}
      ${tag('material', p.material_type)}
      ${tag('shipping_weight', p.weight_grams ? `${p.weight_grams} g` : '')}
    </item>`.replace(/\n\s*\n/g, '\n');
  });
  fs.mkdirSync(path.join(DIST, 'feeds'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'feeds', 'google-products.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(BRAND)}</title>
    <link>${SITE_URL}</link>
    <description>Gold-plated imitation jewellery from Mira Road, Mumbai</description>
${items.join('\n')}
  </channel>
</rss>
`);
}

async function indexNow(urls: string[]) {
  if (process.env.CONTEXT !== 'production' && process.env.INDEXNOW !== '1') { console.log('[prerender] IndexNow skipped (not a production build)'); return; }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList: urls }),
  });
  console.log(`[prerender] IndexNow ping: ${res.status}`);
}

async function main() {
  if (!SB_URL || !SB_KEY) { console.warn('[prerender] Supabase env missing: skipping (site stays client-rendered)'); return; }
  const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const products = await sb<Product[]>('products?select=*&order=created_at.desc');
  let cfg: StoreConfig = {};
  try { cfg = await sb<StoreConfig>('rpc/get_store_config', { method: 'POST', body: '{}' }); } catch { /* settings are optional */ }
  if (!products.length) { console.warn('[prerender] no products: skipping'); return; }
  if (products.some((p) => !p.slug)) { console.warn('[prerender] products without slug: skipping (apply the slug migration first)'); return; }
  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const pages = buildPages(products, cfg);
  for (const page of pages) {
    const file = page.urlPath === '/' ? path.join(DIST, 'index.html') : path.join(DIST, page.urlPath, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, render(template, page));
  }
  writeSitemap(products, cats);
  // lets the 30-minute checker (GitHub Action) know which shop changes this build already contains
  fs.writeFileSync(path.join(DIST, 'build-info.json'), JSON.stringify({ built_at: new Date().toISOString(), latest_product_update: products.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), ''), products: products.length }));
  writeLlms(products, cats, cfg);
  writeMerchantFeed(products, cfg);
  console.log(`[prerender] wrote ${pages.length} pages, sitemap.xml, llms.txt, llms-full.txt, feeds/google-products.xml`);
  await indexNow(pages.map((p) => abs(p.urlPath)));
}

main().catch((e) => { console.warn('[prerender] skipped because of an error:', e instanceof Error ? e.message : e); });
