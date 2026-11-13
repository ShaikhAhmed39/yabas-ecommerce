import type { Product } from '@/types';
import type { StoreConfig } from '@/lib/storeConfig';
import { SHOP_DEFAULTS } from '@/lib/policies';
import { RETURN_WINDOW_DAYS } from '@/lib/orders';
import { productHref, collectionHref } from '@/lib/router';
import { productImages } from '@/utils/images';

/** Structured data (JSON-LD) for Google, Google Shopping and AI answer engines.
 *  Rule: only facts that are TRUE and present in the shop's data. A field the owner left empty is left out;
 *  there are no invented ratings, hallmarks or guarantees. */
export const SITE_URL = 'https://yabasjewellers.com';
export const BRAND = "Yaba's Imitation & Jewellery";
const CTX = 'https://schema.org';
export type Json = Record<string, unknown>;

const abs = (path: string) => (path.startsWith('http') ? path : `${SITE_URL}${path}`);
const clean = <T extends Json>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as T;

/** "3-5" / "3 to 5" / "4" -> { min, max }. Anything else -> null (then we say nothing rather than guess). */
export function parseDays(text: string | undefined): { min: number; max: number } | null {
  if (!text) return null;
  const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const one = text.match(/(\d+)/);
  return one ? { min: Number(one[1]), max: Number(one[1]) } : null;
}

export const organizationRef = { '@type': 'Organization', name: BRAND, url: SITE_URL };

/** The details a customer can see on the product page, as name/value pairs (also used for the specifications table). */
export function productSpecs(p: Product): [string, string][] {
  const rows: [string, string | undefined | null][] = [
    ['Material', p.material_type], ['Finish', p.polish_finish], ['Purity / plating', [p.purity, p.plating].filter(Boolean).join(', ')],
    ['Stone', p.stone_type], ['Size / dimensions', p.dimensions], ['Occasion', p.occasion_wear],
    ['Type', p.sub_category || p.category], ['Style', (p.style_tags ?? []).join(', ')], ['Certification', p.certification],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1] && String(r[1]).trim()));
}

export function productSchema(p: Product, cfg: StoreConfig): Json {
  const url = abs(productHref(p));
  const transit = parseDays(cfg.delivery_estimate);
  const handling = parseDays(cfg.processing_time);
  const fee = cfg.shipping_fee !== undefined && cfg.shipping_fee !== '' && Number.isFinite(Number(cfg.shipping_fee)) ? Number(cfg.shipping_fee) : undefined;
  const shipping = clean({
    '@type': 'OfferShippingDetails',
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
    shippingRate: fee === undefined ? undefined : { '@type': 'MonetaryAmount', value: fee, currency: 'INR' },
    deliveryTime: transit || handling ? clean({
      '@type': 'ShippingDeliveryTime',
      handlingTime: handling ? { '@type': 'QuantitativeValue', minValue: handling.min, maxValue: handling.max, unitCode: 'DAY' } : undefined,
      transitTime: transit ? { '@type': 'QuantitativeValue', minValue: transit.min, maxValue: transit.max, unitCode: 'DAY' } : undefined,
    }) : undefined,
  });
  // The owner's "Material" box may just say "Gold"; the plain-words type below stops that being read as solid gold.
  const props = [...productSpecs(p), ['Product type', 'Imitation jewellery, gold plated (not solid gold)']].map(([name, value]) => ({ '@type': 'PropertyValue', name, value }));
  return clean({
    '@context': CTX, '@type': 'Product', '@id': `${url}#product`, url,
    name: p.title,
    description: (p.description || `${p.title}: ${p.material_type || 'gold-plated imitation jewellery'} from ${BRAND}, Mumbai.`).slice(0, 5000),
    image: productImages(p),
    sku: p.slug || p.id,
    brand: { '@type': 'Brand', name: "Yaba's" },
    category: [p.category, p.sub_category].filter(Boolean).join(' > '),
    additionalProperty: props,
    offers: clean({
      '@type': 'Offer', url, priceCurrency: 'INR', price: Number(p.selling_price).toFixed(2),
      availability: p.stock > 0 ? `${CTX}/InStock` : `${CTX}/OutOfStock`,
      itemCondition: `${CTX}/NewCondition`,
      seller: organizationRef,
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy', applicableCountry: 'IN',
        returnPolicyCategory: `${CTX}/MerchantReturnFiniteReturnWindow`,
        merchantReturnDays: RETURN_WINDOW_DAYS,
        merchantReturnLink: abs('/return-refund-policy'),
      },
      shippingDetails: shipping,
    }),
    // aggregateRating is intentionally absent: it is added only when real customer reviews exist.
  });
}

/** A 40-60 word direct answer: what it is, who it suits, price and availability. Shown on the page, in the static HTML and in llms.txt. */
export function productSummary(p: Product, cfg: StoreConfig): string {
  const kind = (p.sub_category || p.category || 'jewellery').toLowerCase();
  const look = [p.material_type, p.polish_finish].filter((v) => v && v.trim()).join(', ');
  const occasion = p.occasion_wear ? ` suited to ${p.occasion_wear.toLowerCase()} wear` : '';
  const off = p.original_price && p.original_price > p.selling_price ? `, ${Math.round(100 - (p.selling_price / p.original_price) * 100)}% below the ₹${Math.round(p.original_price).toLocaleString('en-IN')} list price` : '';
  const stock = p.stock > 0 ? 'In stock' : 'Currently sold out; use Notify me to hear when it returns';
  const delivery = cfg.delivery_estimate ? ` Delivered across India in ${cfg.delivery_estimate} working days.` : ' Delivered across India.';
  return `${p.title} is a ${kind}${look ? ` (${look})` : ''}${occasion}. It is imitation jewellery with a gold-plated finish, not solid gold. Price ₹${Math.round(p.selling_price).toLocaleString('en-IN')}${off}. ${stock}.${delivery} ${RETURN_WINDOW_DAYS}-day returns.`;
}

export function breadcrumbSchema(items: { name: string; path: string }[]): Json {
  return {
    '@context': CTX, '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export interface Faq { q: string; a: string }
export function faqSchema(faqs: Faq[]): Json {
  return { '@context': CTX, '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

export function collectionSchema(name: string, path: string, description: string, products: Product[]): Json {
  return {
    '@context': CTX, '@type': 'CollectionPage', name, description, url: abs(path),
    mainEntity: { '@type': 'ItemList', numberOfItems: products.length, itemListElement: products.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(productHref(p)), name: p.title })) },
  };
}

export function organizationSchema(cfg: StoreConfig): Json[] {
  const phone = (cfg.support_phone || SHOP_DEFAULTS.support_phone).replace(/\D/g, '');
  return [
    clean({
      '@context': CTX, '@type': 'JewelryStore', '@id': `${SITE_URL}/#store`, name: cfg.legal_name || BRAND, url: SITE_URL,
      logo: abs('/yabas_logo.png'), image: abs('/yabas_logo.png'),
      telephone: phone.length === 10 ? `+91${phone}` : undefined, email: cfg.support_email,
      address: { '@type': 'PostalAddress', streetAddress: cfg.address || SHOP_DEFAULTS.address, addressLocality: 'Mira Road, Mumbai', addressRegion: 'Maharashtra', addressCountry: 'IN' },
      areaServed: { '@type': 'Country', name: 'India' },
      sameAs: [cfg.instagram_url, cfg.facebook_url].filter(Boolean),
    }),
    { '@context': CTX, '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: BRAND, url: SITE_URL, inLanguage: 'en-IN' },
  ];
}

/** Honest, factual answers for category pages (what buyers ask, and what AI assistants quote). Uses the owner's settings where they exist. */
export function collectionFaqs(category: string, cfg: StoreConfig): Faq[] {
  const name = category === 'All' ? 'jewellery' : category.toLowerCase();
  const delivery = cfg.delivery_estimate ? `Delivery usually takes ${cfg.delivery_estimate} working days after dispatch. ` : '';
  const sizeTip = /bangle|kada|bracelet/i.test(category)
    ? 'To choose a bangle size, measure the widest part of your hand (across the knuckles) and compare it with the inner diameter on the product page. '
    : /necklace|chain|haar|mangalsutra/i.test(category)
      ? 'For necklaces, the length or drop is listed on the product page; compare it with a necklace you already wear. '
      : '';
  return [
    { q: `Is Yaba's ${name} real gold?`, a: `No. Our pieces are imitation jewellery with a thin gold-plated finish over a base metal. They are not solid gold and they are not hallmarked. Each product page states the material and finish used.` },
    { q: `How do I stop gold-plated ${name} from tarnishing?`, a: 'Gold plating wears down slowly with use, so we do not promise a fixed lifespan. To keep it looking good: keep it dry, put it on after perfume and cosmetics, wipe it with a soft cloth after wearing, and store it in a pouch away from other pieces.' },
    { q: `How do I choose the right size for ${name}?`, a: `${sizeTip}Every product page lists the size or dimensions in its Specifications table. If a size is missing or you are unsure, message us on WhatsApp before ordering.` },
    { q: `Do you deliver ${name} across India?`, a: `Yes, we ship across India wherever our courier delivers. ${delivery}Delivery charges, if any, are shown at checkout before you pay, and you can check your PIN code on any product page.` },
    { q: 'Can I return a piece if I do not like it?', a: `You can request a return within ${RETURN_WINDOW_DAYS} days of delivery from My orders, and approved refunds go back to the original payment method. The full conditions are in our Return & Refund Policy.` },
  ];
}

export { collectionHref };
