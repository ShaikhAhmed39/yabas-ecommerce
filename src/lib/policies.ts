import type { StoreConfig } from '@/lib/storeConfig';

/** Bump this when the Terms or Privacy Policy change in a way customers must re-accept. It is stored with every order. */
export const POLICY_VERSION = '2026-11';

export const POLICY_LINKS = {
  terms: { href: '/terms-and-conditions', label: 'Terms & Conditions' },
  privacy: { href: '/privacy-policy', label: 'Privacy Policy' },
  returns: { href: '/return-refund-policy', label: 'Return & Refund Policy' },
  shipping: { href: '/shipping-policy', label: 'Shipping & Delivery' },
  cancellation: { href: '/cancellation-policy', label: 'Cancellation Policy' },
  care: { href: '/jewellery-care', label: 'Jewellery Care' },
  contact: { href: '/contact-grievance', label: 'Contact & Grievance' },
} as const;

/** The shop's own details (from the existing footer). Store settings override them as soon as the owner fills them in. */
export const SHOP_DEFAULTS = {
  legal_name: "Yaba's Imitation & Jewellery",
  address: 'Mira Bazaar, Opp. Mohammadi Masjid, Lodha Road, Naya Nagar, Mira Road (E), Mumbai',
  support_phone: '9867505450',
  whatsapp_number: '9867505450',
  secondary_phone: '9867701349',
} as const;

/** Fills the [PLACEHOLDERS] in the policy text from Store settings. A placeholder with no value stays visible so it is not missed. */
export function fillPolicyTokens(text: string, c: StoreConfig): string {
  const map: Record<string, string | undefined> = {
    'LEGAL BUSINESS NAME': c.legal_name || SHOP_DEFAULTS.legal_name,
    'BUSINESS ADDRESS': c.address || SHOP_DEFAULTS.address,
    'FULL BUSINESS ADDRESS': c.address || SHOP_DEFAULTS.address,
    'ADDRESS': c.address || SHOP_DEFAULTS.address,
    'SUPPORT EMAIL': c.support_email,
    'SUPPORT PHONE': c.support_phone || SHOP_DEFAULTS.support_phone,
    'DAYS AND HOURS': c.support_hours,
    'WEBSITE URL': c.website_url,
    'GSTIN': c.gstin,
    'FULL NAME AND DESIGNATION': c.grievance_name,
    'GRIEVANCE EMAIL': c.grievance_email || c.support_email,
    'GRIEVANCE PHONE': c.grievance_phone || c.support_phone || SHOP_DEFAULTS.support_phone,
    'PROCESSING TIME': c.processing_time,
    'DELIVERY ESTIMATE': c.delivery_estimate,
    'RETURN SHIPPING RULE': c.return_shipping_rule,
    'EFFECTIVE DATE': c.policy_effective_date,
  };
  return text.replace(/\[([A-Z ]+)\]/g, (whole, key: string) => map[key] || whole);
}

export function hasUnfilledTokens(text: string): boolean {
  return /\[[A-Z ]{3,}\]/.test(text);
}
