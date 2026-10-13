
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
    { label: 'About Us', href: '#about' },
    { label: 'Contact Us', href: '#contact' },
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

  return (
    <header className="sticky top-0 z-40 bg-cream-100/95 backdrop-blur-md border-b border-gold-200/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <button
            onClick={() => onNavigate('storefront')}
            className="flex items-center gap-2 group flex-shrink-0"
          >
            <img
              src={LOGO_PATH}
              alt="Yaba's Imitation & Jewellery"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover shadow-gold"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />

            <div className="text-left">
              <h1 className="font-display text-lg sm:text-xl font-bold text-onyx-300 leading-none tracking-wide">
                Yaba's
              </h1>
              <p className="text-[10px] sm:text-xs text-gold-500 font-medium tracking-widest uppercase leading-none mt-0.5">
                Imitation & Jewellery
              </p>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors duration-200 relative group whitespace-nowrap"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 gold-gradient transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Admin Dashboard */}
            {isAdmin && (
              <button
                onClick={() => onNavigate('admin')}
                className={`hidden sm:flex p-2 rounded-full hover:bg-cream-200 transition-colors ${
                  currentPage === 'admin'
                    ? 'text-gold-500'
                    : 'text-onyx-300'
                }`}
                aria-label="Admin"
                title="Admin Dashboard"
              >
                <User className="h-5 w-5" />
              </button>
            )}

            {/* Logged-out: Sign In */}
            {!user && (
              <button
                onClick={onSignIn}
                className="hidden sm:flex p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300"
                aria-label="Sign In"
                title="Sign In"
              >
                <User className="h-5 w-5" />
              </button>
            )}

            {/* My Orders */}
            {user && (
              <button
                onClick={openMyOrders}
                className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors ${
                  currentPage === 'my-orders'
                    ? 'bg-cream-200 text-gold-600'
                    : 'text-onyx-300 hover:bg-cream-200 hover:text-gold-500'
                }`}
                aria-label="My Orders"
                title="My Orders"
              >
                <Package className="h-5 w-5" />
                <span>My Orders</span>
              </button>
            )}

            {/* Shopping Bag */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300"
              aria-label="Shopping bag"
            >
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-gold-400 text-cream-100 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-scale-in">
                  {totalItems}
                </span>
              )}
            </button>

            {/* Sign Out */}
            {user && (
              <button
                onClick={signOut}
                className="hidden sm:block text-xs font-medium text-onyx-300 hover:text-gold-500 transition-colors whitespace-nowrap"
              >
                Sign Out
              </button>
            )}

            {/* Mobile Menu */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gold-200/30 animate-slide-up">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors py-1"
                >
                  {link.label}
                </a>
              ))}

              {user && (
                <button
                  onClick={openMyOrders}
                  className="flex items-center gap-2 text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors py-1 text-left"
                >
                  <Package size={17} />
                  My Orders
                </button>
              )}

              {/* Mobile Admin */}
              {isAdmin && (
                <button
                  onClick={() => {
                    onNavigate('admin');
                    setMobileMenuOpen(false);
                  }}
                  className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors py-1 text-left"
                >
                  Admin Dashboard
                </button>
              )}

              {/* Mobile Authentication */}
              {user ? (
                <button
                  onClick={() => {
                    void signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors py-1 text-left"
                >
                  Sign Out
                </button>
              ) : (
                <button
                  onClick={() => {
                    onSignIn();
                    setMobileMenuOpen(false);
                  }}
                  className="text-sm font-medium text-onyx-300 hover:text-gold-500 transition-colors py-1 text-left"
                >
                  Sign In
                </button>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
