import { useEffect, useState } from 'react';
import { FileText, Gift, Image as ImageIcon, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingBag, Store, Tag, Undo2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { DashboardPanel } from '@/components/admin/DashboardPanel';
import { OrdersPanel } from '@/components/admin/OrdersPanel';
import { ReturnsPanel } from '@/components/admin/ReturnsPanel';
import { ProductsAdmin } from '@/components/admin/ProductsAdmin';
import { HeroMediaManager } from '@/components/admin/HeroMediaManager';
import { CouponsPanel } from '@/components/admin/CouponsPanel';
import { ScratchPanel } from '@/components/admin/ScratchPanel';
import { ReportsPanel } from '@/components/admin/ReportsPanel';
import { SettingsPanel } from '@/components/admin/SettingsPanel';

const SECTIONS = [
  { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, hint: 'Sales and what needs you today' },
  { id: 'orders', title: 'Orders & delivery', icon: ShoppingBag, hint: 'Track, ship, correct and cancel orders' },
  { id: 'returns', title: 'Returns & refunds', icon: Undo2, hint: 'Review requests, schedule pickups, refund' },
  { id: 'products', title: 'Products', icon: Package, hint: 'Photos, prices and stock' },
  { id: 'hero', title: 'Home banner', icon: ImageIcon, hint: 'Hero photos from Cloudinary' },
  { id: 'coupons', title: 'Coupons', icon: Tag, hint: 'Discount codes' },
  { id: 'scratch', title: 'Scratch cards', icon: Gift, hint: 'Rewards after purchase' },
  { id: 'reports', title: 'PDF reports', icon: FileText, hint: 'Everything in one PDF' },
  { id: 'settings', title: 'Store settings', icon: Settings, hint: 'Business details, charges, policies' },
] as const;
type Id = (typeof SECTIONS)[number]['id'];
const PRIMARY: Id[] = ['dashboard', 'orders', 'returns', 'products'];

function readTab(): Id {
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab');
  return (SECTIONS.find((s) => s.id === q)?.id ?? 'dashboard') as Id;
}

export function AdminPage({ onNavigate }: { onNavigate: (page: 'storefront') => void }) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Id>(readTab);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const open = (id: string) => { setMore(false); window.location.hash = `#/admin?tab=${id}`; window.scrollTo({ top: 0 }); };
  const current = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0];

  const navBtn = (s: (typeof SECTIONS)[number]) => (
    <button key={s.id} onClick={() => open(s.id)} aria-current={tab === s.id ? 'page' : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${tab === s.id ? 'bg-white/15 font-medium text-gold-200' : 'text-cream-100/85 hover:bg-white/10'}`}>
      <s.icon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden />{s.title}
    </button>
  );

  return (
    <div className="min-h-screen bg-cream-100 lg:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-onyx-300 lg:flex">
        <div className="border-b border-white/10 px-5 py-5"><p className="font-display text-xl tracking-[0.12em] text-gold-200">YABA&apos;S</p><p className="text-xs text-cream-200/70">Admin panel</p></div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin sections">{SECTIONS.map(navBtn)}</nav>
        <div className="space-y-1 border-t border-white/10 p-3">
          <button onClick={() => onNavigate('storefront')} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-cream-100/85 hover:bg-white/10"><Store className="h-[18px] w-[18px]" />View store</button>
          <button onClick={() => void signOut().then(() => onNavigate('storefront'))} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-cream-100/85 hover:bg-white/10"><LogOut className="h-[18px] w-[18px]" />Sign out</button>
          <p className="truncate px-3 pt-1 text-[11px] text-cream-200/55">{user?.email}</p>
        </div>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-cream-400 bg-cream-100/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="min-w-0"><h1 className="truncate font-display text-lg tracking-wide text-onyx-300">{current.title}</h1><p className="hidden truncate text-xs text-ink/60 sm:block">{current.hint}</p></div>
          <button onClick={() => onNavigate('storefront')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cream-400 bg-white px-3 text-sm text-onyx-300 lg:hidden"><Store className="h-4 w-4" />Store</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
        {tab === 'dashboard' && <DashboardPanel go={open} />}
        {tab === 'orders' && <OrdersPanel />}
        {tab === 'returns' && <ReturnsPanel />}
        {tab === 'products' && <ProductsAdmin />}
        {tab === 'hero' && <HeroMediaManager />}
        {tab === 'coupons' && <CouponsPanel />}
        {tab === 'scratch' && <ScratchPanel />}
        {tab === 'reports' && <ReportsPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </main>

      {/* mobile bottom tabs */}
      <nav aria-label="Admin sections" className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-gold-400/40 bg-onyx-300 lg:hidden">
        {PRIMARY.map((id) => { const s = SECTIONS.find((x) => x.id === id)!; return (
          <button key={id} onClick={() => open(id)} aria-current={tab === id ? 'page' : undefined} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] ${tab === id ? 'text-gold-200' : 'text-cream-200/75'}`}><s.icon className="h-5 w-5" />{s.title.split(' ')[0]}</button>); })}
        <button onClick={() => setMore(true)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] ${PRIMARY.includes(tab) ? 'text-cream-200/75' : 'text-gold-200'}`}><Menu className="h-5 w-5" />More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setMore(false)} />
          <div className="relative w-full rounded-t-2xl bg-cream-100 p-4 pb-8 animate-slide-up">
            <div className="mb-3 flex items-center justify-between"><p className="font-display text-lg text-onyx-300">All sections</p><button onClick={() => setMore(false)} aria-label="Close" className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" /></button></div>
            <div className="grid grid-cols-2 gap-3">
              {SECTIONS.filter((s) => !PRIMARY.includes(s.id)).map((s) => (
                <button key={s.id} onClick={() => open(s.id)} className="flex min-h-14 items-center gap-3 rounded-xl border border-cream-400 bg-white px-3 text-left text-sm text-onyx-300"><s.icon className="h-5 w-5 flex-shrink-0" />{s.title}</button>))}
              <button onClick={() => { setMore(false); void signOut().then(() => onNavigate('storefront')); }} className="flex min-h-14 items-center gap-3 rounded-xl border border-cream-400 bg-white px-3 text-left text-sm text-onyx-300"><LogOut className="h-5 w-5" />Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
