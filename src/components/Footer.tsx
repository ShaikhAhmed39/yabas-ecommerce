import { Facebook, Instagram, MapPin, Phone, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStoreConfig } from '@/lib/storeConfig';
import { POLICY_LINKS, SHOP_DEFAULTS } from '@/lib/policies';
import { WhatsAppIcon } from '@/components/icons';
import { shopHref } from '@/lib/router';

const LOGO_PATH = '/yabas_logo.png';
const link = 'text-cream-200/85 transition-colors hover:text-gold-300';
const iconLink = 'grid h-11 w-11 place-items-center rounded-full border border-gold-400/50 text-gold-200 transition-colors hover:bg-gold-300 hover:text-ink';

export function Footer() {
  const { isAdmin } = useAuth();
  const { config, whatsappLink } = useStoreConfig();
  const phone = config.support_phone || SHOP_DEFAULTS.support_phone;
  const wa = whatsappLink() ?? `https://wa.me/91${SHOP_DEFAULTS.whatsapp_number}`;

  return (
    <footer id="contact" className="mt-10 bg-onyx-400 text-cream-200 pb-20 lg:pb-0">
      <div className="scallop-ivory" aria-hidden="true" />
      <div className="jaali-teal">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:px-8">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <img src={LOGO_PATH} alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-gold-400/60" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div className="leading-tight">
                <p className="font-display text-2xl tracking-[0.12em] text-gold-200">YABA&apos;S</p>
                <p className="text-[10px] tracking-[0.25em] text-cream-100/80">IMITATION &amp; JEWELLERY</p>
              </div>
            </div>
            <p className="max-w-sm text-[15px] leading-7 text-cream-200/85">Gold-plated jewellery from Mira Road, Mumbai, for weddings, festivals and everyday wear.</p>
            <div className="mt-5 flex gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" className={iconLink}><WhatsAppIcon className="h-5 w-5" /></a>
              {config.instagram_url && <a href={config.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={iconLink}><Instagram className="h-5 w-5" /></a>}
              {config.facebook_url && <a href={config.facebook_url} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={iconLink}><Facebook className="h-5 w-5" /></a>}
            </div>
          </div>

          <nav aria-label="Shop">
            <h4 className="mb-4 font-display text-base tracking-[0.12em] text-gold-200">SHOP</h4>
            <ul className="space-y-1 text-[15px]">
              <li><a className={`${link} inline-block py-1.5`} href={shopHref()}>All jewellery</a></li>
              <li><a className={`${link} inline-block py-1.5`} href="#/track">Track an order</a></li>
              <li><a className={`${link} inline-block py-1.5`} href="#/orders">My orders &amp; returns</a></li>
              <li><a className={`${link} inline-block py-1.5`} href="#/wishlist">Wishlist</a></li>
              <li><a className={`${link} inline-block py-1.5`} href="#about">Our story</a></li>
            </ul>
          </nav>

          <nav aria-label="Policies">
            <h4 className="mb-4 font-display text-base tracking-[0.12em] text-gold-200">POLICIES</h4>
            <ul className="space-y-1 text-[15px]">
              {Object.values(POLICY_LINKS).map((l) => (
                <li key={l.href}><a className={`${link} inline-block py-1.5`} href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          </nav>

          <div>
            <h4 className="mb-4 font-display text-base tracking-[0.12em] text-gold-200">VISIT OR CALL</h4>
            <ul className="space-y-3 text-[15px]">
              <li className="flex items-start gap-3 text-cream-200/85"><MapPin className="mt-1 h-4 w-4 flex-shrink-0 text-gold-300" aria-hidden /><span>{config.address || SHOP_DEFAULTS.address}</span></li>
              <li><a href={`tel:+91${phone}`} className={`${link} flex min-h-9 items-center gap-3`}><Phone className="h-4 w-4 text-gold-300" aria-hidden />{phone}</a></li>
              {!config.support_phone && <li><a href={`tel:+91${SHOP_DEFAULTS.secondary_phone}`} className={`${link} flex min-h-9 items-center gap-3`}><Phone className="h-4 w-4 text-gold-300" aria-hidden />{SHOP_DEFAULTS.secondary_phone}</a></li>}
              {config.support_email && <li><a href={`mailto:${config.support_email}`} className={`${link} flex min-h-9 items-center gap-3 break-all`}><Mail className="h-4 w-4 text-gold-300" aria-hidden />{config.support_email}</a></li>}
              {config.support_hours && <li className="pl-7 text-sm text-cream-300/80">{config.support_hours}</li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-gold-400/25">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-5 text-center text-sm text-cream-300/80 sm:flex-row sm:px-6 sm:text-left lg:px-8">
            <p>© {new Date().getFullYear()} {config.legal_name || "Yaba's Imitation & Jewellery"}{config.gstin ? ` · GSTIN ${config.gstin}` : ''}</p>
            <div className="flex items-center gap-4">
              <span>Secured by Razorpay</span>
              {isAdmin && <a href="#/admin" className="rounded border border-gold-400/40 px-3 py-2 text-gold-300 hover:text-gold-100">Admin panel</a>}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
