
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider, useCart } from '@/context/CartContext';
import { GoldTicker } from '@/components/GoldTicker';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { ProductGrid } from '@/components/ProductGrid';
import { About } from '@/components/About';
import { Footer } from '@/components/Footer';
import { CartDrawer } from '@/components/CartDrawer';
import { AuthModal } from '@/components/AuthModal';
import { CheckoutModal } from '@/components/CheckoutModal';
import { Lightbox } from '@/components/Lightbox';
import { AdminPage } from '@/pages/AdminPage';
import { MyOrders } from '@/pages/MyOrders';
import { ReturnRequestForm } from '@/components/ReturnRequestForm';
import { callFunction } from '@/lib/api';
import { ProductsProvider } from '@/context/ProductsContext';
import { uploadReturnPhoto } from '@/utils/returnPhotoUpload';
import { PolicyPage, isPolicyPath } from '@/pages/PolicyPage';

type Page = 'storefront' | 'admin' | 'my-orders' | 'return-request';

type SelectedReturn = {
  orderId: string;
  orderItemId: string;
  productTitle: string;
};

function Storefront({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user } = useAuth();
  const { setCartOpen } = useCart();
  const [authOpen, setAuthOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleCheckout = () => {
    setCartOpen(false);
    if (!user) setAuthOpen(true);
    else setCheckoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <GoldTicker />
      <Header
        onNavigate={onNavigate}
        currentPage="storefront"
        onSignIn={() => setAuthOpen(true)}
      />
      <main>
        <Hero />
        <ProductGrid />
        <About />
      </main>
      <Footer />
      <CartDrawer onCheckout={handleCheckout} />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Sign In to Checkout"
      />
      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onRequireAuth={() => {
          setCheckoutOpen(false);
          setAuthOpen(true);
        }}
      />
      <Lightbox />
    </div>
  );
}

function AppContent() {
  const [page, setPage] = useState<Page>('storefront');
  const [selectedReturn, setSelectedReturn] = useState<SelectedReturn | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const { user, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    const checkHash = () => {
      const hash = window.location.hash;

      if (hash === '#admin') {
        setPage(isAdmin ? 'admin' : 'storefront');
      } else if (hash === '#my-orders' || hash === '#return-request') {
        if (user) {
          setPage(hash === '#return-request' && selectedReturn
            ? 'return-request'
            : 'my-orders');
        } else {
          setPage('storefront');
          setAuthOpen(true);
        }
      } else {
        setPage('storefront');
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [user, isAdmin, loading, selectedReturn]);

  const navigate = (newPage: Page) => {
    if (newPage === 'admin' && !isAdmin) {
      newPage = 'storefront';
    }

    if (
      (newPage === 'my-orders' || newPage === 'return-request') &&
      !user
    ) {
      setAuthOpen(true);
      return;
    }

    if (newPage === 'return-request' && !selectedReturn) {
      newPage = 'my-orders';
    }

    setPage(newPage);

    window.location.hash =
      newPage === 'admin'
        ? 'admin'
        : newPage === 'my-orders'
          ? 'my-orders'
          : newPage === 'return-request'
            ? 'return-request'
            : '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openReturnForm = (
    order: { id: string },
    item: { id: string; product_title: string },
  ) => {
    setSelectedReturn({
      orderId: order.id,
      orderItemId: item.id,
      productTitle: item.product_title,
    });
    navigate('return-request');
  };

  const renderPage: Page =
    page === 'admin' && isAdmin
      ? 'admin'
      : page === 'return-request' && user && selectedReturn
        ? 'return-request'
        : page === 'my-orders' && user
          ? 'my-orders'
          : 'storefront';

  if (isPolicyPath(window.location.pathname)) {
    return <PolicyPage />;
  }

  return (
    <CartProvider>
      {renderPage === 'admin' ? (
        <AdminPage onNavigate={navigate} />
      ) : renderPage === 'my-orders' ? (
        <>
          <Header
            onNavigate={navigate}
            currentPage="my-orders"
            onSignIn={() => setAuthOpen(true)}
          />
          <MyOrders
            onBack={() => navigate('storefront')}
            onRequestReturn={openReturnForm}
          />
          <AuthModal
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            title="Sign In to View Your Orders"
          />
        </>
      ) : renderPage === 'return-request' && selectedReturn ? (
        <>
          <Header
            onNavigate={navigate}
            currentPage="my-orders"
            onSignIn={() => setAuthOpen(true)}
          />
          <ReturnRequestForm
            orderId={selectedReturn.orderId}
            orderItemId={selectedReturn.orderItemId}
            productTitle={selectedReturn.productTitle}
            onCancel={() => navigate('my-orders')}
            onSubmit={async ({ reason, description, photos }) => {
              if (!user) throw new Error('Please sign in before submitting a return request.');

              // 1) Create the request first: the server gives us its id (and enforces every rule).
              const created = await callFunction<{ return_request?: { id?: string } }>('submit-return-request', {
                order_id: selectedReturn.orderId,
                order_item_id: selectedReturn.orderItemId,
                reason,
                description,
              });
              const returnRequestId = created.return_request?.id;
              if (!returnRequestId) {
                throw new Error('The server did not confirm a saved return request. Please check My Orders before trying again.');
              }

              // 2) Upload photos to the private bucket, then 3) attach their paths to the request.
              try {
                const uploadedPaths: string[] = [];
                for (const photo of photos) {
                  uploadedPaths.push(await uploadReturnPhoto({ file: photo, userId: user.id, returnRequestId }));
                }
                if (uploadedPaths.length > 0) {
                  const attached = await callFunction<{ success?: boolean; return_request_id?: string }>(
                    'attach-return-photos',
                    { return_request_id: returnRequestId, photo_paths: uploadedPaths },
                  );
                  if (!attached.success || attached.return_request_id !== returnRequestId) {
                    throw new Error('The server did not confirm the photo attachment.');
                  }
                }
              } catch (photoError) {
                console.error('Return photo processing failed:', photoError);
                throw new Error(
                  `Your return request was received (see it in My Orders), but the photos could not be attached: ${
                    photoError instanceof Error ? photoError.message : 'unknown error'
                  } Please contact us and we will add them for you. Do not submit another request.`,
                );
              }
            }}
          />
          <AuthModal
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            title="Sign In to View Your Orders"
          />
        </>
      ) : (
        <Storefront onNavigate={navigate} />
      )}
    </CartProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ProductsProvider>
        <AppContent />
      </ProductsProvider>
    </AuthProvider>
  );
}

export default App;
