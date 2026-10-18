
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Package,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string;
  unit_price: number | string;
  quantity: number;
}

export interface Order {
  id: string;
  user_id: string | null;
  total_amount: number | string;
  status: string | null;
  payment_method: string | null;
  payment_status: string;
  delivery_status: string;
  delivered_at: string | null;
  created_at: string | null;
  items: OrderItem[];
  // === THIS NEW PROPERTY PREVENTS TYPESCRIPT BUILD ERRORS ===
  return_request?: {
    id: string;
    order_id: string;
    status: string;
    reason: string;
    description: string;
    refund_amount: number | null;
    photo_paths: string[];
  } | null;
}


interface MyOrdersProps {
  onBack: () => void;
  onRequestReturn: (order: Order, item: OrderItem) => void;
}

const money = (amount: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);

const label = (value: string | null | undefined) =>
  (value || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function StatusPill({
  value,
}: {
  value: string | null | undefined;
}) {
  return (
    <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700">
      {label(value)}
    </span>
  );
}

export function MyOrders({
  onBack,
  onRequestReturn,
}: MyOrdersProps) {
  const { user, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, user_id, total_amount, status, payment_method, payment_status, delivery_status, delivered_at, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (orderError) {
      setError('We could not load your orders. Please try again.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const fetchedOrders = (orderData || []) as Omit<Order, 'items'>[];

    if (fetchedOrders.length === 0) {
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const orderIds = fetchedOrders.map((order) => order.id);

    // 1. Fetch order items cleanly
    const { data: itemData, error: itemError } = await supabase
      .from('order_items')
      .select(
        'id, order_id, product_id, product_title, unit_price, quantity',
      )
      .in('order_id', orderIds);

    if (itemError) {
      setError('Your orders loaded, but their items could not be loaded.');
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // 2. Fetch return requests using verified columns
    const { data: returnData, error: returnError } = await supabase
      .from('return_requests')
      .select('id, order_id, status, reason, description, refund_amount, photo_paths')
      .in('order_id', orderIds);

    if (returnError) {
      console.error("Supabase Return Request Query Error:", returnError.message);
    }

    const items = (itemData || []) as OrderItem[];

    // 3. Merge both datasets into your React state array immutably
    setOrders(
      fetchedOrders.map((order) => {
        const matchingReturn = (returnData || []).find((ret) => ret.order_id === order.id);
        return {
          ...order,
          items: items.filter((item) => item.order_id === order.id),
          return_request: matchingReturn || null // Injects tracking record object straight into rows
        };
      }),
    );

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadOrders();
  }, [authLoading, loadOrders]);

  const refresh = async () => {
    setRefreshing(true);
    await loadOrders();
  };

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-cream-100 px-4 py-20 text-center">
        <RefreshCw
          className="mx-auto mb-4 animate-spin"
          size={28}
        />
        <p className="text-stone-600">Loading your orders...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-cream-100 px-4 py-20 text-center">
        <Package className="mx-auto mb-4" size={40} />
        <h1 className="text-2xl font-semibold text-stone-900">
          Sign in to view your orders
        </h1>
        <p className="mt-2 text-stone-600">
          Your orders are available after you sign in.
        </p>
        <button
          onClick={onBack}
          className="mt-6 rounded-lg bg-stone-900 px-5 py-3 text-white"
        >
          Back to Store
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream-100 px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft size={16} />
              Back to Store
            </button>

            <h1 className="text-3xl font-semibold text-stone-900">
              My Orders
            </h1>

            <p className="mt-2 text-sm text-stone-600">
              View your purchases, payment details, and delivery progress.
            </p>
          </div>

          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
            <button
              onClick={refresh}
              className="ml-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {!error && orders.length === 0 ? (
          <section className="rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center">
            <ShoppingBag
              className="mx-auto mb-4 text-stone-400"
              size={48}
            />
            <h2 className="text-xl font-semibold text-stone-900">
              No orders yet
            </h2>
            <p className="mt-2 text-stone-600">
              Your purchases will appear here after you place an order.
            </p>
            <button
              onClick={onBack}
              className="mt-6 rounded-lg bg-stone-900 px-5 py-3 text-white"
            >
              Explore Jewellery
            </button>
          </section>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const deliveredAt = order.delivered_at
                ? new Date(order.delivered_at).getTime()
                : NaN;

              const now = Date.now();

              const withinReturnWindow =
                Number.isFinite(deliveredAt) &&
                deliveredAt <= now &&
                now - deliveredAt <= 7 * 24 * 60 * 60 * 1000;

              // Razorpay verification stores successful payments as "captured".
              
            const isPaymentSuccessful = ['captured', 'paid'].includes(
             (order.payment_status ?? '').toLowerCase()
            );


              // This is a display check only. The backend must
              // independently validate every return request.
              const canRequestReturn =
                isPaymentSuccessful &&
                order.delivery_status === 'delivered' &&
                withinReturnWindow;

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-100 bg-stone-50/70 p-5">
                    <div>
                      <p className="text-xs text-stone-500">Order ID</p>
                      <p className="mt-1 break-all font-mono text-sm text-stone-800">
                        {order.id}
                      </p>
                      <p className="mt-2 text-xs text-stone-500">
                        Placed{" "}
                        {order.created_at
                          ? new Date(order.created_at).toLocaleDateString(
                              "en-IN",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : "Date unavailable"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusPill value={order.payment_status} />
                      <StatusPill value={order.delivery_status} />
                    </div>
                  </div>

                  <div className="divide-y divide-stone-100 px-5">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-4 py-5"
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-stone-900">
                            {item.product_title}
                          </h3>

                          <p className="mt-1 text-sm text-stone-500">
                            {money(item.unit_price)} × {item.quantity}
                          </p>

                          <p className="mt-1 text-sm font-medium text-stone-800">
                            Subtotal:{" "}
                            {money(Number(item.unit_price) * item.quantity)}
                          </p>
                        </div>

                        {order.return_request ? (
                          // If a return request data row exists, hide the request button and render this tracking status badge
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left shadow-sm mt-2 max-w-sm animate-fadeIn">
                            <div className="flex justify-between items-center mb-1.5 border-b border-amber-100 pb-1">
                              <span className="font-semibold text-amber-900 text-xs">
                                Return Status:
                              </span>
                              <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-amber-200 text-amber-950 uppercase tracking-wider">
                                {order.return_request.status.replace("_", " ")}
                              </span>
                            </div>

                            <p className="text-gray-600 text-xs leading-relaxed font-normal">
                              {order.return_request.status === "requested" &&
                                "Under review. Our admin team is verifying your submission notes."}
                              {order.return_request.status === "approved" &&
                                "Approved! Preparing reverse courier pickup labels."}
                              {order.return_request.status ===
                                "pickup_scheduled" &&
                                "Logistics configured. A courier agent will collect the package from your doorstep."}
                              {order.return_request.status === "received" &&
                                "Package received at our warehouse. Undergoing quality verification check."}
                              {order.return_request.status ===
                                "inspection_passed" &&
                                "Product inspection passed successfully. Preparing transaction refund ledger."}
                              {order.return_request.status ===
                                "refund_pending" &&
                                "Refund Authorized: Processing payment routing sequences back to your account."}
                              {order.return_request.status === "completed" &&
                                "Refund Disbursed: The full order amount has credited back to your payment method."}
                              {order.return_request.status ===
                                "inspection_failed" &&
                                "Return Declined: The package contents did not satisfy our jewelry verification standards."}
                              {order.return_request.status === "rejected" &&
                                "Return Request Rejected: Your return files were denied due to store parameter rules."}
                              {order.return_request.status === "cancelled" &&
                                "This return transaction request was cancelled."}
                            </p>
                          </div>
                        ) : (
                          // If there is no active return request for this order, display your original button layout cleanly
                          canRequestReturn && (
                            <button
                              onClick={() => onRequestReturn(order, item)}
                              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-stone-50"
                            >
                              Request Return
                            </button>
                          )
                        )}
                      </div>
                    ))}

                    {order.items.length === 0 && (
                      <p className="py-5 text-sm text-stone-500">
                        No order items were found.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 p-5">
                    <div>
                      <p className="text-xs text-stone-500">Payment method</p>
                      <p className="mt-1 text-sm text-stone-800">
                        {label(order.payment_method)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-stone-500">Order total</p>
                      <p className="mt-1 text-xl font-semibold text-stone-900">
                        {money(order.total_amount)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
