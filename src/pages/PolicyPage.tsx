import { useStoreConfig } from '@/lib/storeConfig';
import { useAuth } from '@/context/AuthContext';
import { fillPolicyTokens, hasUnfilledTokens } from '@/lib/policies';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const policies = {
  '/privacy-policy': {
    title: 'Privacy Policy', eyebrow: 'Your privacy matters', updated: '[EFFECTIVE DATE]', sections: [
      ['1. Who we are', "This website is operated under the Yaba's Jewelry brand. The legal seller name, full business address and privacy contact must be completed before publication: [LEGAL BUSINESS NAME], [BUSINESS ADDRESS], [SUPPORT EMAIL] and [SUPPORT PHONE]."],
      ['2. Information we may process', 'Depending on how you use the store, information may include account details, contact details, delivery address, order history, payment status and transaction references, support messages, and photos you voluntarily provide for a return request. Technical information may also be processed by hosting and security services. Confirm the actual data flows before publishing.'],
      ['3. How we use information', 'We use relevant information to manage accounts, process and fulfil orders, verify payment status, arrange delivery, handle returns and customer support, prevent fraud, keep required business records, and comply with applicable law. Marketing communications, if used, should follow applicable requirements and provide an appropriate opt-out.'],
      ['4. Service providers and sharing', 'Information may be shared as necessary with the actual payment provider, database/authentication provider, website host, courier partners, professional advisers, or authorities where legally required. Update this description to match the services actually used.'],
      ['5. Payments and sensitive credentials', 'Payments are processed through the payment provider shown at checkout. Do not send us OTPs, UPI PINs, passwords or full payment credentials. The business must verify its payment integration before making specific claims about what payment data it receives or stores.'],
      ['6. Retention and security', 'We retain information for as long as reasonably necessary for order fulfilment, support, legal and accounting obligations, and dispute handling. We use reasonable safeguards appropriate to the services, but no online system can be guaranteed completely secure. Specific security claims must be verified before publication.'],
      ['7. Your requests', 'You may contact us to request access to, correction of, or deletion of personal information, subject to identity verification and applicable legal retention requirements. We will handle requests under applicable law.'],
      ['8. Cookies, storage and third-party services', 'The website and its service providers may use browser storage or similar technologies for essential functions. Confirm the actual cookies, analytics and third-party embeds before describing them as absent or disabled. External websites have their own policies.'],
      ['9. Changes and contact', 'We may update this policy when our practices or legal obligations change. For privacy questions, contact [SUPPORT EMAIL] or [SUPPORT PHONE].']
    ]
  },
  '/terms-and-conditions': {
    title: 'Terms & Conditions', eyebrow: 'Using our store', updated: '[EFFECTIVE DATE]', sections: [
      ['1. About these terms', "These terms apply to use of the Yaba's Jewelry website and orders placed through it. The legal seller name and business address must be added before launch: [LEGAL BUSINESS NAME], [BUSINESS ADDRESS]."],
      ['2. Product descriptions', 'Read each product listing carefully, including material, finish, dimensions, colour, and care information. Product photos may show minor differences due to lighting or display settings. We will not describe imitation jewellery as solid gold or silver, or make claims such as waterproof, hypoallergenic or anti-tarnish, unless verified for the specific product.'],
      ['3. Prices and availability', 'Prices, applicable taxes, delivery charges and any other mandatory charges should be displayed clearly before checkout. Product availability may change. If an order cannot be fulfilled or a material pricing error is identified, we will contact the customer and arrange any refund due under applicable law.'],
      ['4. Orders and payments', 'An order is subject to stock and payment verification. The payment method available to you will be shown at checkout. Cash on Delivery is currently intended to be unavailable; confirm this before publication. Never share an OTP, UPI PIN or banking password with customer support.'],
      ['5. Accounts', 'You are responsible for keeping your login credentials confidential and notifying us if you suspect unauthorised access. We may take reasonable steps to protect accounts and investigate suspected fraud.'],
      ['6. Cancellations, returns and refunds', 'Cancellation, return and refund requests are handled under the separate policies linked on this website. Nothing in these terms removes rights that cannot lawfully be excluded.'],
      ['7. Website use', 'Do not misuse the website, interfere with its security, submit unlawful content, or attempt unauthorised access to another account or system.'],
      ['8. Governing law and contact', 'These terms are governed by applicable laws of India. Any jurisdiction statement must be reviewed for the seller and transaction. Contact: [SUPPORT EMAIL], [SUPPORT PHONE].']
    ]
  },
  '/return-refund-policy': {
    title: 'Return & Refund Policy', eyebrow: 'Shopping with confidence', updated: '[EFFECTIVE DATE]', sections: [
      ['1. Return request window', 'Proposed policy: request a return within 7 calendar days after delivery. Confirm that this window is operationally supported and consistent with applicable consumer law before publishing.'],
      ['2. Eligible requests', 'Returns may be considered for items that are unused and in their original packaging, and for items that arrive damaged, defective, incorrect or materially different from their listing. Eligibility is assessed against the product, evidence, and applicable law.'],
      ['3. Report damaged or incorrect items', 'Please contact [SUPPORT EMAIL] or [SUPPORT PHONE] promptly after delivery, include your order number, and provide clear photos of the item and packaging where possible. Any short reporting target must not be used to remove rights provided by law.'],
      ['4. Condition and packaging', 'Keep the item, tags, box and included accessories together until the request is reviewed. Do not send an item back before receiving return instructions.'],
      ['5. Return shipping', 'Return shipping responsibility depends on the reason for return and applicable law. Confirm the final arrangement here before launch: [RETURN SHIPPING RULE].'],
      ['6. Refund process', 'After a return or cancellation is approved, the refund will be initiated to the original payment method where supported. Proposed processing target: within 3–5 working days after approval. The bank or payment provider may take additional time to credit the funds. Confirm this timeline against the actual process before publishing.'],
      ['7. Non-returnable situations', 'A request may be declined where the item shows use or damage caused after delivery, or where required components are missing, subject always to applicable consumer rights. No exclusion applies where the law requires a remedy.'],
      ['8. Start a request', 'Use the return option in My Orders if available, or contact [SUPPORT EMAIL] / [SUPPORT PHONE] with your order number. Never send payment PINs or passwords.']
    ]
  },
  '/shipping-policy': {
    title: 'Shipping & Delivery', eyebrow: 'Delivery information', updated: '[EFFECTIVE DATE]', sections: [
      ['1. Service area', 'Orders are intended to ship to serviceable addresses within India. Availability depends on the delivery location and courier coverage.'],
      ['2. Processing and delivery estimates', 'Order processing estimate: [PROCESSING TIME]. Estimated transit time: [DELIVERY ESTIMATE] working days after dispatch, depending on destination and courier service. Replace these placeholders with realistic, verified estimates before accepting public orders.'],
      ['3. Shipping charges', 'Any shipping fee or other mandatory charge will be shown before you confirm payment. Do not assume delivery is free unless the checkout clearly states so.'],
      ['4. Tracking and delivery', 'Where tracking is provided, use the tracking information shared for your order. Please ensure the delivery address and phone number are accurate. Courier delays, weather, service disruptions or incorrect address details may affect estimates.'],
      ['5. Damaged, missing or delayed orders', 'If a parcel appears damaged or an order has not arrived within the stated estimate, contact [SUPPORT EMAIL] or [SUPPORT PHONE] with your order number and available photos or tracking details. We will review the issue and coordinate with the courier as appropriate.'],
      ['6. Contact', 'For delivery support, contact [SUPPORT EMAIL] / [SUPPORT PHONE].']
    ]
  },
  '/cancellation-policy': {
    title: 'Cancellation Policy', eyebrow: 'Changes to your order', updated: '[EFFECTIVE DATE]', sections: [
      ['1. Customer cancellation', 'Contact [SUPPORT EMAIL] or [SUPPORT PHONE] with your order number as soon as possible. Cancellation may be possible before packing or dispatch begins; it cannot be guaranteed once the parcel has been handed to the courier.'],
      ['2. After dispatch', 'If the order has already been dispatched, contact support for guidance. This does not remove any legal rights you may have regarding defective, incorrect or misdescribed goods.'],
      ['3. Cancellation by the seller', 'An order may need to be cancelled because of stock unavailability, a delivery restriction, a verified pricing/system error, or suspected fraud. We will inform the customer and initiate any refund due for a prepaid order.'],
      ['4. Failed or pending payments', 'A payment marked pending or failed is not treated as successfully paid until verified. If money appears debited but you do not receive confirmation, contact support with the payment reference. Never share OTPs, PINs or passwords.'],
      ['5. Refund timeline', 'Proposed target: initiate approved cancellation refunds within 3–5 working days. Bank/payment-provider processing can take additional time. Confirm this timeline before launch.']
    ]
  },
  '/jewellery-care': {
    title: 'Jewellery Product Disclosure & Care', eyebrow: 'Know your jewellery', updated: '[EFFECTIVE DATE]', sections: [
      ['1. Product disclosure', 'Products should be described according to supplier-verified information for each item. Add the actual base material, plating/finish, stones or beads, dimensions/weight, country of origin and any legally required manufacturer/packer/importer details to the relevant listing.'],
      ['2. Imitation jewellery', 'Unless a listing accurately states otherwise, items are fashion/imitation jewellery and are not solid gold or solid silver. Explain “1-gram gold plated” precisely for the specific product. Do not imply BIS hallmarking, precious-metal purity, or gold/silver content unless accurate and legally supported.'],
      ['3. Care guidance', 'Store jewellery in a dry place, away from moisture and direct sunlight. Avoid perfumes, cosmetics, detergents, chlorine and other chemicals. Remove jewellery before bathing, swimming or exercising unless the supplier gives different care instructions. Wipe gently with a soft, dry cloth and store pieces separately.'],
      ['4. Colour and finish', 'Lighting and display settings can cause small differences between product photographs and the item received. Do not make waterproof, hypoallergenic, nickel-free or anti-tarnish claims unless they are substantiated for that product.'],
      ['5. Product questions', 'For details about a particular item, contact [SUPPORT EMAIL] or [SUPPORT PHONE] before ordering.']
    ]
  },
  '/contact-grievance': {
    title: 'Contact & Grievance', eyebrow: 'We are here to help', updated: '[EFFECTIVE DATE]', sections: [
      ['1. Seller details', "Brand: Yaba's Jewelry. Legal seller name: [LEGAL BUSINESS NAME]. Business address: [FULL BUSINESS ADDRESS]. Website: [WEBSITE URL]. GSTIN, if applicable and required: [GSTIN]. Complete and verify these details before launch."],
      ['2. Customer support', 'Email: [SUPPORT EMAIL]. Phone: [SUPPORT PHONE]. Support hours: [DAYS AND HOURS]. These must be real, monitored contact channels.'],
      ['3. Grievance contact', 'Designated grievance officer/contact, where required: [FULL NAME AND DESIGNATION]. Email: [GRIEVANCE EMAIL]. Phone: [GRIEVANCE PHONE]. Postal address: [ADDRESS]. Appoint and verify the appropriate person and legally required disclosures before publishing.'],
      ['4. Making a complaint', 'Please include your order number, a clear description of the issue, and relevant supporting details. Do not include passwords, OTPs, UPI PINs or other authentication secrets. We will acknowledge and address complaints within the timelines applicable to the business under law.'],
      ['5. Other questions', 'For orders, delivery, returns, refunds, product information or privacy requests, contact the customer support channels listed above.']
    ]
  }
};

export function isPolicyPath(pathname: string) {
  return Object.prototype.hasOwnProperty.call(policies, pathname.replace(/\/$/, '') || '/');
}

export function PolicyPage() {
  const { config } = useStoreConfig();
  const { isAdmin } = useAuth();
  const fill = (t: string) => fillPolicyTokens(t, config);
  const path = window.location.pathname.replace(/\/$/, '') || '/privacy-policy';
  const policy = policies[path as keyof typeof policies] ?? policies['/privacy-policy'];
  return (
    <div className="min-h-screen bg-cream-100 text-onyx-300">
      <header className="border-b border-gold-400/25 bg-cream-100/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-3" aria-label="Back to Yaba's Jewelry home">
            <img src="/yabas_logo.png" alt="Yaba's Jewelry" className="h-10 w-10 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-display text-lg font-bold">Yaba's <span className="text-gold-400">Jewelry</span></span>
          </a>
          <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-onyx-300 transition hover:text-gold-400"><ArrowLeft size={16} /> Back to store</a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-8 rounded-2xl border border-gold-400/25 bg-white/70 p-6 sm:p-10">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-500"><ShieldCheck size={16} /> {policy.eyebrow}</div>
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-5xl">{policy.title}</h1>
          <p className="mt-4 text-sm text-onyx-300/65">Effective / last updated: {fill(policy.updated)}</p>
          {isAdmin && policy.sections.some(([h, b]) => hasUnfilledTokens(fill(h + b))) && <p className="mt-5 max-w-3xl rounded-md bg-gold-100 p-3 text-sm leading-6 text-onyx-300">Admin note: some [PLACEHOLDERS] below are not filled yet. Add them in Admin → Store settings; customers see this page exactly as shown here.</p>}
        </div>
        <article className="space-y-5">
          {policy.sections.map(([heading, body]) => (
            <section key={heading} className="rounded-xl border border-onyx-300/10 bg-white/65 p-5 sm:p-7">
              <h2 className="font-serif text-lg font-semibold sm:text-xl">{fill(heading)}</h2>
              <p className="mt-3 text-sm leading-7 text-onyx-300/80 sm:text-base">{fill(body)}</p>
            </section>
          ))}
        </article>
        <div className="mt-8 rounded-xl bg-onyx-300 p-5 text-sm leading-6 text-cream-100/80 sm:p-6">
          <strong className="text-cream-100">Need help?</strong> Contact {fillPolicyTokens('[SUPPORT EMAIL]', config) === '[SUPPORT EMAIL]' ? '' : fillPolicyTokens('[SUPPORT EMAIL]', config) + ' or '}{fillPolicyTokens('[SUPPORT PHONE]', config)}.
        </div>
        <nav aria-label="Other policies" className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm">
          {Object.entries(policies).filter(([url]) => url !== path).map(([url, item]) => <a key={url} href={url} className="text-onyx-300/70 underline decoration-gold-400/60 underline-offset-4 hover:text-gold-500">{item.title}</a>)}
        </nav>
      </main>
      <footer className="border-t border-gold-400/20 px-4 py-6 text-center text-xs text-onyx-300/60">© {new Date().getFullYear()} Yaba's Jewelry · Crafted with love in Mumbai</footer>
    </div>
  );
}
