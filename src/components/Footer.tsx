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
      xmlns="http://w3.org"
    >
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.006 5.256 5.262.001 11.72.001c3.13.001 6.073 1.219 8.283 3.43 2.21 2.211 3.427 5.155 3.425 8.287-.006 6.464-5.262 11.718-11.72 11.718-2.002-.001-3.972-.515-5.717-1.498L0 24zM6.42 19.914c1.614.957 3.2 1.436 4.935 1.438 5.305 0 9.622-4.316 9.625-9.623.001-2.572-1.002-4.99-2.825-6.812-1.821-1.822-4.24-2.826-6.814-2.827-5.31 0-9.625 4.315-9.628 9.623-.001 1.83.488 3.619 1.416 5.21l-.995 3.636 3.738-.981zm12.35-6.05c-.27-.135-1.597-.788-1.845-.878-.248-.09-.43-.135-.61.135-.18.27-.698.878-.856 1.058-.158.18-.316.202-.586.067-.27-.135-1.14-.42-2.172-1.34-1.03-1.03-1.425-2.008-1.587-2.278-.162-.27-.017-.417.118-.552.122-.122.27-.315.405-.473.135-.158.18-.27.27-.45.09-.18.045-.338-.022-.473-.068-.135-.61-1.468-.836-2.012-.22-.527-.44-.456-.61-.464-.158-.007-.338-.008-.518-.008-.18 0-.473.068-.72.338-.248.27-.946.923-.946 2.25 0 1.328.966 2.61 1.101 2.79.135.18 1.9 2.901 4.603 4.07 2.703 1.17 2.703.78 3.198.735.495-.045 1.597-.653 1.822-1.283.225-.63.225-1.17.157-1.283-.068-.113-.248-.203-.518-.338z"/>
    </svg>
  );
}

export function Footer() {
  const { isAdmin } = useAuth(); 

  return (
    <footer id="contact" className="bg-onyx-300 text-cream-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img
                src={LOGO_PATH}
                alt="Yaba's"
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <h3 className="font-display text-lg font-bold text-cream-100">Yaba's</h3>
                <p className="text-[10px] text-gold-300 tracking-widest uppercase">Imitation & Jewellery</p>
              </div>
            </div>
            <p className="text-sm text-cream-300 max-w-md leading-relaxed">
              Premium imitation jewellery from the heart of Mumbai. Handcrafted gold-plated
              pieces that bring timeless elegance to every occasion.
            </p>
            <div className="flex gap-3 mt-5">
              <a href="#" className="w-9 h-9 rounded-full bg-cream-100/10 hover:bg-gold-400 flex items-center justify-center transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-cream-100/10 hover:bg-gold-400 flex items-center justify-center transition-colors">
                <Facebook className="h-4 w-4" />
              </a>
              {/* WhatsApp Redirection Link using the custom WhatsApp icon */}
              <a 
                href="https://wa.me" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="w-9 h-9 rounded-full bg-cream-100/10 hover:bg-emerald-600 flex items-center justify-center transition-all hover:scale-105"
                title="Chat with Aaqil on WhatsApp"
              >
                <WhatsAppIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-serif text-sm font-semibold text-cream-100 mb-4 uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#collections" className="text-cream-300 hover:text-gold-300 transition-colors">Collections</a></li>
              <li><a href="#about" className="text-cream-300 hover:text-gold-300 transition-colors">About Us</a></li>
              <li><a href="#contact" className="text-cream-300 hover:text-gold-300 transition-colors">Contact Us</a></li>
            </ul>
          </div>


          {/* Policies & Customer Care */}
          <div>
            <h4 className="font-serif text-sm font-semibold text-cream-100 mb-4 uppercase tracking-wider">Policies &amp; Care</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/privacy-policy" className="text-cream-300 hover:text-gold-300 transition-colors">Privacy Policy</a></li>
              <li><a href="/terms-and-conditions" className="text-cream-300 hover:text-gold-300 transition-colors">Terms &amp; Conditions</a></li>
              <li><a href="/return-refund-policy" className="text-cream-300 hover:text-gold-300 transition-colors">Return &amp; Refund</a></li>
              <li><a href="/shipping-policy" className="text-cream-300 hover:text-gold-300 transition-colors">Shipping &amp; Delivery</a></li>
              <li><a href="/cancellation-policy" className="text-cream-300 hover:text-gold-300 transition-colors">Cancellation Policy</a></li>
              <li><a href="/jewellery-care" className="text-cream-300 hover:text-gold-300 transition-colors">Jewellery Care</a></li>
              <li><a href="/contact-grievance" className="text-cream-300 hover:text-gold-300 transition-colors">Contact &amp; Grievance</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-serif text-sm font-semibold text-cream-100 mb-4 uppercase tracking-wider">Contact Us</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2 text-cream-300">
                <MapPin className="h-4 w-4 mt-0.5 text-gold-300 flex-shrink-0" />
                <span>Mira Bazaar, Opp. Mohammadi Masjid,<br />Lodha Road, Naya Nagar,<br />Mira Road (E)</span>
              </li>
              <li className="flex items-center gap-2 text-cream-300">
                <Phone className="h-4 w-4 text-gold-300 flex-shrink-0" />
                <span>Aaqil: 9867505450</span>
              </li>
              <li className="flex items-center gap-2 text-cream-300">
                <Phone className="h-4 w-4 text-gold-300 flex-shrink-0" />
                <span>Yusuf: 9867701349</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom Metadata Bar */}
        <div className="mt-10 pt-6 border-t border-cream-100/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <p className="text-xs text-cream-400">
            © {new Date().getFullYear()} Yaba's Imitation & Jewellery. Crafted with love in Mumbai.
          </p>

          {/* Conditional Admin Control Portal Entry */}
          {isAdmin && (
            <a 
              href="#admin" 
              className="text-xs font-semibold px-3 py-1.5 bg-cream-100/5 text-gold-300 rounded-lg border border-gold-400/20 hover:text-gold-400 hover:bg-cream-100/10 transition-all tracking-wide"
            >
              ⚙️ System Dashboard
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
