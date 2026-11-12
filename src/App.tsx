import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider, useCart } from '@/context/CartContext';
import { ProductsProvider } from '@/context/ProductsContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { StoreConfigProvider } from '@/lib/storeConfig';
import { GoldTicker } from '@/components/GoldTicker';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BottomNav } from '@/components/BottomNav';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CartDrawer } from '@/components/CartDrawer';
import { AuthModal } from '@/components/AuthModal';
import { ReturnRequestForm } from '@/components/ReturnRequestForm';
import { HomePage } from '@/pages/HomePage';
import { ShopPage } from '@/pages/ShopPage';
import { ProductPage } from '@/pages/ProductPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { TrackOrderPage } from '@/pages/TrackOrderPage';
import { WishlistPage } from '@/pages/WishlistPage';
import { AdminPage } from '@/pages/AdminPage';
import { MyOrders } from '@/pages/MyOrders';
import { PolicyPage, isPolicyPath } from '@/pages/PolicyPage';
import { callFunction } from '@/lib/api';
import { go, useRoute } from '@/lib/router';
import { uploadReturnPhoto } from '@/utils/returnPhotoUpload';

type SelectedReturn = { orderId: string; orderItemId: string; productTitle: string };

function Shell() {
  const route = useRoute();
  const { user, isAdmin, loading } = useAuth();
  const isGuest = false;
  const { setCartOpen } = useCart();
  const [authOpen, setAuthOpen] = useState(false);
  const [authTitle, setAuthTitle] = useState('Welcome Back');
  const [wantsCheckout, setWantsCheckout] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SelectedReturn | null>(null);

  const signIn = (title = 'Welcome Back') => { setAuthTitle(title); setAuthOpen(true); };

  // finish the checkout the customer started before signing in
  useEffect(() => { if (wantsCheckout && user) { setWantsCheckout(false); setAuthOpen(false); go('/checkout'); } }, [wantsCheckout, user]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [route.name, route.name === 'product' ? route.id : '']); // eslint-disable-line react-hooks/exhaustive-deps

  if (route.name === 'admin') {
    if (loading) return <div className="grid min-h-screen place-items-center text-onyx-300">Loading…</div>;
    if (isAdmin) return <AdminPage onNavigate={() => go('/')} />;
    // not an admin: fall through to a friendly page instead of a blank screen
    return (
      <div className="grid min-h-screen place-items-center bg-cream-100 px-6 text-center">
        <div><h1 className="font-display text-2xl text-onyx-300">Admin sign-in required</h1>
          <p className="mt-2 text-ink/70">{user && !isGuest ? 'This account does not have admin access.' : 'Please sign in with the owner account.'}</p>
          <div className="mt-6 flex justify-center gap-3">
            {(!user || isGuest) && <button onClick={() => signIn('Admin sign in')} className="min-h-11 rounded bg-onyx-300 px-6 font-display text-xs tracking-[0.12em] text-gold-200">SIGN IN</button>}
            <a href="#/" className="inline-flex min-h-11 items-center rounded border-2 border-onyx-300 px-6 font-display text-xs tracking-[0.12em] text-onyx-300">BACK TO STORE</a></div></div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} title={authTitle} />
      </div>
    );
  }

  if (route.name === 'checkout') {
    return (<><CheckoutPage onSignIn={() => signIn('Sign in to your account')} /><AuthModal open={authOpen} onClose={() => setAuthOpen(false)} title={authTitle} /></>);
  }

  const signedIn = Boolean(user);
  let page: React.ReactNode;
  switch (route.name) {
    case 'shop': page = <ShopPage category={route.category} q={route.q} />; break;
    case 'product': page = <ProductPage id={route.id} />; break;
    case 'track': page = <TrackOrderPage initialOrder={route.order} />; break;
    case 'wishlist': page = <WishlistPage />; break;
    case 'orders':
      page = loading ? null : signedIn ? (
        <MyOrders onBack={() => go('/')} onRequestReturn={(order, item) => {
          setSelectedReturn({ orderId: order.id, orderItemId: item.id ?? '', productTitle: item.product_title });
          go('/return');
        }} />
      ) : (
        <div className="mx-auto max-w-md px-6 py-20 text-center"><h1 className="font-display text-2xl text-onyx-300">Your orders</h1>
          <p className="mt-2 text-ink/70">Sign in to see your orders, start a return and follow every parcel.</p>
          <button onClick={() => signIn('Sign in to view your orders')} className="mt-6 min-h-12 rounded bg-onyx-300 px-8 font-display text-sm tracking-[0.12em] text-gold-200">SIGN IN</button>
          <p className="mt-4 text-sm text-ink/70">Ordered as a guest? <a href="#/track" className="text-onyx-300 underline underline-offset-4">Track it with your order number</a>.</p></div>
      );
      break;
    case 'return':
      if (!user) page = <div className="px-6 py-20 text-center"><button onClick={() => signIn('Sign in to continue')} className="min-h-12 rounded bg-onyx-300 px-8 font-display text-sm text-gold-200">SIGN IN</button></div>;
      else if (!selectedReturn) { go('/orders'); page = null; }
      else page = (
        <ReturnRequestForm
          orderId={selectedReturn.orderId} orderItemId={selectedReturn.orderItemId} productTitle={selectedReturn.productTitle}
          onCancel={() => go('/orders')}
          onSubmit={async ({ reason, description, photos }) => {
            const created = await callFunction<{ return_request?: { id?: string } }>('submit-return-request', {
              order_id: selectedReturn.orderId, order_item_id: selectedReturn.orderItemId, reason, description,
            });
            const returnRequestId = created.return_request?.id;
            if (!returnRequestId) throw new Error('The server did not confirm a saved return request. Please check My Orders before trying again.');
            try {
              const uploadedPaths: string[] = [];
              for (const photo of photos) uploadedPaths.push(await uploadReturnPhoto({ file: photo, userId: user.id, returnRequestId }));
              if (uploadedPaths.length > 0) {
                const attached = await callFunction<{ success?: boolean; return_request_id?: string }>('attach-return-photos', { return_request_id: returnRequestId, photo_paths: uploadedPaths });
                if (!attached.success || attached.return_request_id !== returnRequestId) throw new Error('The server did not confirm the photo attachment.');
              }
            } catch (photoError) {
              console.error('Return photo processing failed:', photoError);
              throw new Error(`Your return request was received (see it in My Orders), but the photos could not be attached: ${photoError instanceof Error ? photoError.message : 'unknown error'} Please contact us and we will add them for you. Do not submit another request.`);
            }
          }}
        />
      );
      break;
    default: page = <HomePage />;
  }

  return (
    <div className="min-h-screen bg-cream-100 pb-16 lg:pb-0">
      <GoldTicker />
      <Header route={route} onSignIn={() => signIn()} />
      <main id="main" key={route.name === 'product' ? `product-${route.id}` : route.name} className="animate-drop-in">{page}</main>
      <Footer />
      <BottomNav route={route} />
      {route.name !== 'product' && <WhatsAppButton />}
      <CartDrawer onCheckout={() => { setCartOpen(false); if (user) go('/checkout'); else { setWantsCheckout(true); signIn('Sign in to check out'); } }} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} title={authTitle} />
    </div>
  );
}

function AppContent() {
  if (isPolicyPath(window.location.pathname)) return <PolicyPage />;
  return <CartProvider><Shell /></CartProvider>;
}

export default function App() {
  return (
    <AuthProvider>
      <StoreConfigProvider>
        <ProductsProvider>
          <WishlistProvider>
            <AppContent />
          </WishlistProvider>
        </ProductsProvider>
      </StoreConfigProvider>
    </AuthProvider>
  );
}
