
import { ShoppingBag, User, Menu, X, Package } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

const LOGO_PATH = '/yabas_logo.png';

type Page = 'storefront' | 'admin' | 'my-orders';

interface HeaderProps {
  onNavigate: (page: Page) => void;
  currentPage: string;
  onSignIn: () => void;
}

export function Header({
  onNavigate,
  currentPage,
  onSignIn,
}: HeaderProps) {
  const { totalItems, setCartOpen } = useCart();
  const { user, isAdmin, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', href: '#home' },
    { label: 'Collections', href: '#collections' },
    { label: 'Our story', href: '#about' },
    { label: 'Contact', href: '#contact' },
  ];

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);

    if (href === '#home') {
      onNavigate('storefront');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openMyOrders = () => {
    onNavigate('my-orders');
    setMobileMenuOpen(false);
  };

  const linkClass =
    'text-[15px] text-cream-200 hover:text-gold-300 transition-colors duration-200 whitespace-nowrap';
  const iconBtn =
    'p-2.5 rounded-full text-cream-200 hover:text-gold-300 hover:bg-white/5 transition-colors';

  return (
    <header className="sticky top-0 z-40 bg-onyx-300 border-b border-gold-400/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[72px]">
          {/* Brand */}
          <button
            onClick={() => onNavigate('storefront')}
            className="flex items-center gap-3 flex-shrink-0 text-left"
            aria-label="Yaba's Imitation & Jewellery, home"
          >
            <img
              src={LOGO_PATH}
              alt=""
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-1 ring-gold-400/60"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="leading-tight">
              <span className="block font-display text-xl sm:text-2xl text-gold-200">Yaba&apos;s</span>
              <span className="block text-[11px] sm:text-xs text-cream-300/80 tracking-wide">
                Imitation &amp; Jewellery
              </span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8 lg:gap-10" aria-label="Main">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={(e) => handleNavClick(e, link.href)} className={linkClass}>
                {link.label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={() => onNavigate('admin')}
                className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
                  currentPage === 'admin' ? 'text-gold-300' : 'text-cream-200 hover:text-gold-300'
                }`}
              >
                <User className="h-[18px] w-[18px]" />
                Admin
              </button>
            )}

            {!user && (
              <button onClick={onSignIn} className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-2 text-sm text-cream-200 hover:text-gold-300 transition-colors`}>
                <User className="h-[18px] w-[18px]" />
                Sign in
              </button>
            )}

            {user && (
              <button
                onClick={openMyOrders}
                className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
                  currentPage === 'my-orders' ? 'text-gold-300' : 'text-cream-200 hover:text-gold-300'
                }`}
              >
                <Package className="h-[18px] w-[18px]" />
                My orders
              </button>
            )}

            <button onClick={() => setCartOpen(true)} className={`relative ${iconBtn}`} aria-label={`Shopping bag, ${totalItems} item${totalItems === 1 ? '' : 's'}`}>
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute top-0 right-0 bg-gold-300 text-onyx-400 text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>

            {user && (
              <button onClick={signOut} className="hidden sm:block text-sm text-cream-300/80 hover:text-gold-300 transition-colors whitespace-nowrap px-2">
                Sign out
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`md:hidden ${iconBtn}`}
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-3 border-t border-gold-400/20 animate-fade-in" aria-label="Mobile">
            <div className="flex flex-col">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} onClick={(e) => handleNavClick(e, link.href)} className="py-3 text-base text-cream-100 hover:text-gold-300 transition-colors">
                  {link.label}
                </a>
              ))}
              {user && (
                <button onClick={openMyOrders} className="flex items-center gap-2 py-3 text-base text-cream-100 hover:text-gold-300 text-left">
                  <Package size={18} /> My orders
                </button>
              )}
              {isAdmin && (
                <button onClick={() => { onNavigate('admin'); setMobileMenuOpen(false); }} className="py-3 text-base text-cream-100 hover:text-gold-300 text-left">
                  Admin
                </button>
              )}
              {user ? (
                <button onClick={() => { void signOut(); setMobileMenuOpen(false); }} className="py-3 text-base text-cream-100 hover:text-gold-300 text-left">
                  Sign out
                </button>
              ) : (
                <button onClick={() => { onSignIn(); setMobileMenuOpen(false); }} className="py-3 text-base text-cream-100 hover:text-gold-300 text-left">
                  Sign in
                </button>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
