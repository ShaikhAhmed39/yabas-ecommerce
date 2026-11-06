import { Instagram, Facebook, Phone, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const LOGO_PATH = '/yabas_logo.png';

// Custom inline SVG component rendering the real, official WhatsApp logo shape
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.006 5.256 5.262.001 11.72.001c3.13.001 6.073 1.219 8.283 3.43 2.21 2.211 3.427 5.155 3.425 8.287-.006 6.464-5.262 11.718-11.72 11.718-2.002-.001-3.972-.515-5.717-1.498L0 24zM6.42 19.914c1.614.957 3.2 1.436 4.935 1.438 5.305 0 9.622-4.316 9.625-9.623.001-2.572-1.002-4.99-2.825-6.812-1.821-1.822-4.24-2.826-6.814-2.827-5.31 0-9.625 4.315-9.628 9.623-.001 1.83.488 3.619 1.416 5.21l-.995 3.636 3.738-.981zm12.35-6.05c-.27-.135-1.597-.788-1.845-.878-.248-.09-.43-.135-.61.135-.18.27-.698.878-.856 1.058-.158.18-.316.202-.586.067-.27-.135-1.14-.42-2.172-1.34-1.03-1.03-1.425-2.008-1.587-2.278-.162-.27-.017-.417.118-.552.122-.122.27-.315.405-.473.135-.158.18-.27.27-.45.09-.18.045-.338-.022-.473-.068-.135-.61-1.468-.836-2.012-.22-.527-.44-.456-.61-.464-.158-.007-.338-.008-.518-.008-.18 0-.473.068-.72.338-.248.27-.946.923-.946 2.25 0 1.328.966 2.61 1.101 2.79.135.18 1.9 2.901 4.603 4.07 2.703 1.17 2.703.78 3.198.735.495-.045 1.597-.653 1.822-1.283.225-.63.225-1.17.157-1.283-.068-.113-.248-.203-.518-.338z"/>
    </svg>
  );
}

// Social links only appear once their real addresses are set (Vercel/Netlify env vars), so no dead links ship.
const INSTAGRAM_URL = import.meta.env.VITE_INSTAGRAM_URL as string | undefined;
const FACEBOOK_URL = import.meta.env.VITE_FACEBOOK_URL as string | undefined;
const WHATSAPP_URL = 'https://wa.me/919867505450';

const linkClass = 'text-cream-200/80 hover:text-gold-300 transition-colors';
const iconLink =
  'w-10 h-10 rounded-full border border-gold-400/40 text-gold-200 hover:bg-gold-300 hover:text-onyx-400 flex items-center justify-center transition-colors';

export function Footer() {
  const { isAdmin } = useAuth();

  return (
    <footer id="contact" className="bg-onyx-500 text-cream-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <img
                src={LOGO_PATH}
                alt=""
                className="w-11 h-11 rounded-full object-cover ring-1 ring-gold-400/60"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="leading-tight">
                <p className="font-display text-2xl text-gold-200">Yaba&apos;s</p>
                <p className="text-xs text-cream-300/80">Imitation &amp; Jewellery</p>
              </div>
            </div>
            <p className="max-w-sm text-[15px] leading-7 text-cream-200/80">
              Gold-plated jewellery from Mira Road, Mumbai, for weddings, festivals and everyday wear.
            </p>
            <div className="mt-6 flex gap-3">
              {INSTAGRAM_URL && (
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className={iconLink}>
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {FACEBOOK_URL && (
                <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className={iconLink}>
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" className={iconLink}>
                <WhatsAppIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          <nav aria-label="Shop">
            <h4 className="font-display text-lg text-gold-200 mb-4">Shop</h4>
            <ul className="space-y-2.5 text-[15px]">
              <li><a href="#collections" className={linkClass}>Collection</a></li>
              <li><a href="#about" className={linkClass}>Our story</a></li>
              <li><a href="/jewellery-care" className={linkClass}>Jewellery care</a></li>
              <li><a href="/contact-grievance" className={linkClass}>Contact &amp; grievance</a></li>
            </ul>
          </nav>

          <nav aria-label="Policies">
            <h4 className="font-display text-lg text-gold-200 mb-4">Policies</h4>
            <ul className="space-y-2.5 text-[15px]">
              <li><a href="/shipping-policy" className={linkClass}>Shipping &amp; delivery</a></li>
              <li><a href="/return-refund-policy" className={linkClass}>Returns &amp; refunds</a></li>
              <li><a href="/cancellation-policy" className={linkClass}>Cancellation</a></li>
              <li><a href="/privacy-policy" className={linkClass}>Privacy</a></li>
              <li><a href="/terms-and-conditions" className={linkClass}>Terms &amp; conditions</a></li>
            </ul>
          </nav>

          <div>
            <h4 className="font-display text-lg text-gold-200 mb-4">Visit or call</h4>
            <ul className="space-y-4 text-[15px]">
              <li className="flex items-start gap-3 text-cream-200/80">
                <MapPin className="h-4 w-4 mt-1 text-gold-300 flex-shrink-0" aria-hidden />
                <span>Mira Bazaar, Opp. Mohammadi Masjid,<br />Lodha Road, Naya Nagar,<br />Mira Road (E)</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gold-300 flex-shrink-0" aria-hidden />
                <a href="tel:+919867505450" className={linkClass}>Aaqil: 98675 05450</a>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gold-300 flex-shrink-0" aria-hidden />
                <a href="tel:+919867701349" className={linkClass}>Yusuf: 98677 01349</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gold-400/20 pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-sm text-cream-300/70">
            © {new Date().getFullYear()} Yaba&apos;s Imitation &amp; Jewellery
          </p>
          {isAdmin && (
            <a href="#admin" className="text-sm text-gold-300 hover:text-gold-100 transition-colors border border-gold-400/30 px-3 py-1.5">
              Admin dashboard
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
