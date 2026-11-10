import { useEffect, useRef, useState } from 'react';
import { Heart, Menu, Package, Search, ShoppingBag, User, X, Truck, LogOut, LayoutDashboard, LogIn } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useWishlist } from '@/context/WishlistContext';
import { go, shopHref, type Route } from '@/lib/router';
import { useProducts } from '@/context/ProductsContext';

const LOGO_PATH = '/yabas_logo.png';
const NAV = [
  { label: 'Home', href: '#/' , match: 'home' },
  { label: 'Shop all', href: '#/shop', match: 'shop' },
  { label: 'Bridal', href: shopHref('Bridal'), match: '' },
  { label: 'Track order', href: '#/track', match: 'track' },
] as const;

export function Header({ route, onSignIn }: { route: Route; onSignIn: () => void }) {
  const { totalItems, setCartOpen } = useCart();
  const { user, isGuest, isAdmin, signOut } = useAuth();
  const wish = useWishlist();
  const { products } = useProducts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [q, setQ] = useState('');
  const acctRef = useRef<HTMLDivElement>(null);
  const signedIn = Boolean(user) && !isGuest;

  useEffect(() => {
    if (!acctOpen) return;
    const close = (e: MouseEvent) => { if (!acctRef.current?.contains(e.target as Node)) setAcctOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [acctOpen]);

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setAcctOpen(false); }, [route]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    go(shopHref('All', q.trim()).slice(1));
    setSearchOpen(false);
  };

  const suggestions = q.trim().length >= 2
    ? products.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5)
    : [];

  const iconBtn = 'relative grid h-11 w-11 place-items-center rounded-full text-ink transition-colors hover:bg-black/5';
  const badge = 'absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-onyx-300 px-1 text-[10px] font-semibold text-white';

  const searchBox = (
    <form onSubmit={submitSearch} role="search" className="relative w-full">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        aria-label="Search jewellery"
        placeholder="Search jhumka, haram, kada…"
        className="h-11 w-full rounded-sm border border-cream-400 bg-white pl-10 pr-3 text-[15px] text-ink placeholder:text-ink/45 focus:border-gold-400 focus:outline-none"
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-md border border-gold-400/40 bg-cream-50 shadow-medium">
          {suggestions.map((p) => (
            <li key={p.id}>
              <a href={`#/product/${p.id}`} onClick={() => setQ('')} className="flex items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-cream-200">
                <img src={p.image_url} alt="" className="h-9 w-9 rounded object-cover" />
                <span className="line-clamp-1">{p.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </form>
  );

  return (
    <header className="sticky top-0 z-40">
      <div className="border-b border-cream-400 bg-cream-100">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-2 sm:px-6 lg:h-[76px] lg:gap-6 lg:px-8">
          <button onClick={() => setMenuOpen(true)} className={`${iconBtn} lg:hidden`} aria-label="Open menu"><Menu className="h-6 w-6" /></button>

          <a href="#/" className="flex flex-1 items-center justify-center gap-3 lg:flex-none lg:justify-start" aria-label="Yaba's Imitation & Jewellery, home">
            <img src={LOGO_PATH} alt="" className="hidden h-11 w-11 rounded-full object-cover ring-1 ring-cream-400 sm:block" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="text-center leading-none lg:text-left">
              <span className="block font-display text-[28px] font-medium tracking-[0.14em] text-ink lg:text-[30px]">YABA&apos;S</span>
              <span className="mt-1 block font-sans text-[8.5px] tracking-[0.34em] text-gold-600 sm:text-[9.5px]">IMITATION &amp; JEWELLERY</span>
            </span>
          </a>

          <nav className="hidden flex-1 items-center justify-center gap-8 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.label} href={n.href}
                aria-current={n.match && route.name === n.match ? 'page' : undefined}
                className={`font-display text-[13px] tracking-[0.14em] transition-colors hover:text-gold-500 ${n.match && route.name === n.match ? 'border-b border-ink text-ink' : 'text-ink'}`}>
                {n.label.toUpperCase()}
              </a>
            ))}
          </nav>

          <div className="hidden w-64 xl:block">{searchBox}</div>

          <div className="flex items-center">
            <button onClick={() => setSearchOpen((v) => !v)} className={`${iconBtn} xl:hidden`} aria-label="Search" aria-expanded={searchOpen}><Search className="h-[22px] w-[22px]" /></button>
            <a href="#/wishlist" className={`${iconBtn} hidden sm:grid`} aria-label={`Wishlist, ${wish.ids.size} saved`}>
              <Heart className="h-[22px] w-[22px]" />
              {wish.ids.size > 0 && <span className={badge}>{wish.ids.size}</span>}
            </a>
            <div ref={acctRef} className="relative hidden lg:block">
              <button onClick={() => setAcctOpen((v) => !v)} className={iconBtn} aria-label="Account" aria-expanded={acctOpen}><User className="h-[22px] w-[22px]" /></button>
              {acctOpen && (
                <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-md border border-gold-400/50 bg-cream-50 py-1 text-sm text-ink shadow-medium">
                  {signedIn && <p className="truncate border-b border-gold-400/30 px-4 py-2 text-xs text-ink/60">{user?.email}</p>}
                  <a href="#/orders" className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-200"><Package className="h-4 w-4" />My orders</a>
                  <a href="#/track" className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-200"><Truck className="h-4 w-4" />Track an order</a>
                  <a href="#/wishlist" className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-200"><Heart className="h-4 w-4" />Wishlist</a>
                  {isAdmin && <a href="#/admin" className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-200"><LayoutDashboard className="h-4 w-4" />Admin panel</a>}
                  {signedIn
                    ? <button onClick={() => void signOut()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cream-200"><LogOut className="h-4 w-4" />Sign out</button>
                    : <button onClick={onSignIn} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cream-200"><LogIn className="h-4 w-4" />Sign in / Create account</button>}
                </div>
              )}
            </div>
            <button onClick={() => setCartOpen(true)} className={iconBtn} aria-label={`Shopping bag, ${totalItems} item${totalItems === 1 ? '' : 's'}`}>
              <ShoppingBag className="h-[22px] w-[22px]" />
              {totalItems > 0 && <span className={badge}>{totalItems}</span>}
            </button>
          </div>
        </div>
        {searchOpen && <div className="px-3 pb-3 xl:hidden">{searchBox}</div>}
      </div>
      
      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setMenuOpen(false)} />
          <aside className="jaali-teal absolute inset-y-0 left-0 flex w-[84%] max-w-[340px] flex-col text-cream-100 animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-gold-400/30 px-4 py-3">
              <span className="font-display text-xl tracking-[0.12em] text-gold-200">YABA&apos;S</span>
              <button onClick={() => setMenuOpen(false)} className={iconBtn} aria-label="Close menu"><X className="h-6 w-6" /></button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {[...NAV, { label: 'Wishlist', href: '#/wishlist', match: 'wishlist' }, { label: 'My orders', href: '#/orders', match: 'orders' }].map((n) => (
                <a key={n.label} href={n.href} className="block rounded px-4 py-3.5 font-display text-sm tracking-[0.12em] hover:bg-white/10">{n.label.toUpperCase()}</a>
              ))}
              {isAdmin && <a href="#/admin" className="block rounded px-4 py-3.5 font-display text-sm tracking-[0.12em] text-gold-200 hover:bg-white/10">ADMIN PANEL</a>}
            </nav>
            <div className="border-t border-gold-400/30 p-4">
              {signedIn
                ? <button onClick={() => { void signOut(); setMenuOpen(false); }} className="min-h-11 w-full rounded border border-gold-400/60 text-sm text-gold-200">Sign out</button>
                : <button onClick={() => { setMenuOpen(false); onSignIn(); }} className="min-h-11 w-full rounded bg-gold-400 text-sm font-medium text-ink">Sign in / Create account</button>}
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
