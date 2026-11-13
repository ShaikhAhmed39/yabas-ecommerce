import type { Product } from '@/types';
import { useStoreConfig } from '@/lib/storeConfig';
import { breadcrumbSchema, productSchema, productSpecs } from '@/lib/schema';
import { collectionHref, productHref } from '@/lib/router';
import { productImages } from '@/utils/images';
import { useSeo } from '@/lib/seo';

/** Puts everything Google and AI assistants read about one product into the page head:
 *  title, description, canonical address, Product + Offer + return policy + shipping + BreadcrumbList.
 *  Renders nothing visible. Built only from the product's own data. */
export function ProductSchema({ product }: { product: Product }) {
  const { config } = useStoreConfig();
  const specs = productSpecs(product).slice(0, 2).map(([, v]) => v).join(', ');
  const description = (product.description?.trim() || `${product.title} (${[product.category, product.sub_category].filter(Boolean).join(', ')}). ${specs}`).replace(/\s+/g, ' ').slice(0, 155);
  useSeo({
    title: `${product.title} | Buy ${product.category || 'Jewellery'} Online`,
    description,
    path: productHref(product),
    image: productImages(product)[0],
    type: 'product',
    jsonLd: [
      productSchema(product, config),
      breadcrumbSchema([{ name: 'Home', path: '/' }, { name: product.category || 'Shop', path: product.category ? collectionHref(product.category) : '/shop' }, { name: product.title, path: productHref(product) }]),
    ],
  });
  return null;
}
