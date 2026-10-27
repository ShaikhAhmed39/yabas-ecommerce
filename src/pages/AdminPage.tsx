import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, X, Upload, Loader2, Package, ArrowLeft,
  ImageIcon, Save, AlertCircle, CheckCircle2, ClipboardList, RefreshCw, Eye, ChevronLeft, ChevronRight, ShoppingBag, Truck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { HeroMediaManager } from '@/components/admin/HeroMediaManager';
import { compressImageToWebP, formatFileSize } from '@/utils/imageCompress';
import { formatINR, calculateDiscount } from '@/utils/format';
import type { Product, ProductInput } from '@/types';

interface AdminPageProps {
  onNavigate: (page: 'storefront' | 'admin') => void;
}

const EMPTY_FORM: ProductInput = {
  title: '',
  description: '',
  original_price: 0,
  selling_price: 0,
  discount_percent: 0,
  stock: 0,
  image_url: '',
  material_type: '',
  polish_finish: '',
  dimensions: '',
  category: '',
  sub_category: '',
  occasion_wear: '',
  is_featured: false,
};

const CATEGORIES = ['Necklace', 'Earrings', 'Bangles', 'Rings', 'Bracelet', 'Bridal', 'Anklets'];

const SUB_CATEGORIES: Record<string, string[]> = {
  Necklace: ['Choker', 'Long', 'Rani Haar', 'Mangalsutra', 'Pendant'],
  Earrings: ['Studs', 'Jhumka', 'Chandbali', 'Hoop', 'Drop'],
  Bangles: ['Kada', 'Stack', 'Glass', 'Gold Plated'],
  Rings: ['Cocktail', 'Engagement', 'Daily Wear', 'Adjustable'],
  Bracelet: ['Chain', 'Cuff', 'Charm', 'Pearl'],
  Bridal: ['Full Set', 'Necklace Set', 'Maang Tikka', 'Nath', 'Kamarbandh'],
  Anklets: ['Chain', 'Beaded', 'Traditional', 'Modern'],
};

const OCCASIONS = ['Daily Wear', 'Wedding', 'Festive', 'Party', 'Traditional', 'Office', 'Casual'];


type ReturnPhoto = { path: string; signed_url: string };

type ReturnRequestRecord = {
  id: string;
  order_id: string;
  order_item_id: string;
  user_id: string;
  reason: string;
  description: string;
  status: string;
  admin_note: string | null;
  rejection_reason: string | null;
  pickup_scheduled_at: string | null;
  refund_amount: number | null;
  created_at: string;
  photo_count: number;
  order: {
    id: string;
    user_id: string;
    total_amount: number;
    payment_status: string | null;
    delivery_status: string | null;
    customer_name: string | null;
    shipping_address_line1: string | null;
    shipping_address_line2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    primary_phone: string | null;
    backup_phone: string | null;
    created_at: string;
  } | null;
  item: {
    id: string;
    product_title: string;
    unit_price: number;
    quantity: number;
  } | null;
};

function ReturnManagementPanel() {
  const [requests, setRequests] = useState<ReturnRequestRecord[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null);
  const [photosFor, setPhotosFor] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ReturnPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const pageSize = 20;

  const loadReturns = useCallback(async (targetPage = page) => {
    setLoadingReturns(true);
    setReturnError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'manage-return-request',
        { body: { action: 'list', page: targetPage, page_size: pageSize } },
      );
      if (invokeError) throw invokeError;
      if (!data || !Array.isArray(data.requests)) {
        throw new Error(data?.error || 'Unexpected response while loading return requests.');
      }
      setRequests(data.requests as ReturnRequestRecord[]);
      setTotal(Number(data.total) || 0);
      setPage(targetPage);
    } catch (err: any) {
      setReturnError(err?.message || 'Failed to load return requests.');
    } finally {
      setLoadingReturns(false);
    }
  }, [page]);

  useEffect(() => {
    void loadReturns(0);
  }, []);

  const performAction = async (
    request: ReturnRequestRecord,
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusyId(request.id);
    setReturnError(null);
    setReturnSuccess(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'manage-return-request',
        {
          body: {
            action,
            return_request_id: request.id,
            ...extra,
          },
        },
      );
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setReturnSuccess(data?.message || 'Return request updated.');
      await loadReturns(page);
    } catch (err: any) {
      setReturnError(err?.message || 'Could not update this return request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAction = async (request: ReturnRequestRecord, action: string) => {
    if (action === 'reject') {
      const reason = window.prompt('Enter the reason for rejecting this return (required):')?.trim();
      if (!reason) return;
      if (reason.length < 3) {
        setReturnError('Rejection reason must contain at least 3 characters.');
        return;
      }
      await performAction(request, action, { rejection_reason: reason });
      return;
    }

    if (action === 'schedule_pickup') {
      const localDefault = new Date(Date.now() + 24 * 60 * 60 * 1000);
      localDefault.setMinutes(localDefault.getMinutes() - localDefault.getTimezoneOffset());
      const value = window.prompt(
        'Enter pickup date and time in ISO format or local format (example: 2026-10-20T14:30:00+05:30):',
        localDefault.toISOString(),
      )?.trim();
      if (!value) return;
      const timestamp = Date.parse(value);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        setReturnError('Enter a valid future pickup date and time.');
        return;
      }
      await performAction(request, action, { pickup_scheduled_at: new Date(timestamp).toISOString() });
      return;
    }

    if (action === 'mark_refund_pending') {
      const maxAmount = Number(request.item?.unit_price ?? 0) * Number(request.item?.quantity ?? 0);
      const value = window.prompt(
        `Enter refund amount (maximum â‚¹${maxAmount.toFixed(2)}). This only records refund-pending status; it does not issue a refund.`,
        maxAmount.toFixed(2),
      );
      if (value === null || value.trim() === '') return;
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
        setReturnError(`Enter an amount greater than â‚¹0 and no more than â‚¹${maxAmount.toFixed(2)}.`);
        return;
      }
      await performAction(request, action, { refund_amount: Math.round(amount * 100) / 100 });
      return;
    }

    const confirmation: Record<string, string> = {
      approve: 'Approve this return request?',
      mark_received: 'Mark this returned item as received?',
      inspection_passed: 'Record that the inspection passed?',
      inspection_failed: 'Record that the inspection failed?',
      cancel: 'Cancel this return request?',
    };
    if (confirmation[action] && !window.confirm(confirmation[action])) return;
    await performAction(request, action);
  };

  const loadPhotos = async (request: ReturnRequestRecord) => {
    if (photosFor === request.id) {
      setPhotosFor(null);
      setPhotos([]);
      return;
    }
    setPhotosFor(request.id);
    setPhotos([]);
    setPhotoError(null);
    setPhotosLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'manage-return-request',
        { body: { action: 'get_photos', return_request_id: request.id } },
      );
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setPhotos(Array.isArray(data?.photos) ? data.photos : []);
    } catch (err: any) {
      setPhotoError(err?.message || 'Could not load return photos.');
    } finally {
      setPhotosLoading(false);
    }
  };

  const actionButtons = (request: ReturnRequestRecord) => {
    const actions: { action: string; label: string }[] = [];
    switch (request.status) {
      case 'requested':
        actions.push({ action: 'approve', label: 'Approve' }, { action: 'reject', label: 'Reject' }, { action: 'cancel', label: 'Cancel' });
        break;
      case 'approved':
        actions.push({ action: 'schedule_pickup', label: 'Schedule pickup' }, { action: 'mark_received', label: 'Mark received' }, { action: 'reject', label: 'Reject' }, { action: 'cancel', label: 'Cancel' });
        break;
      case 'pickup_scheduled':
        actions.push({ action: 'mark_received', label: 'Mark received' });
        break;
      case 'received':
        actions.push({ action: 'inspection_passed', label: 'Inspection passed' }, { action: 'inspection_failed', label: 'Inspection failed' });
        break;
      case 'inspection_passed':
        actions.push({ action: 'mark_refund_pending', label: 'Mark refund pending' });
        break;
    }
    return actions;
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-onyx-300">Return Management</h2>
          <p className="text-xs text-onyx-100 mt-1">Review customer requests and manage return status.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadReturns(page)}
          disabled={loadingReturns}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gold-200/40 bg-cream-50 text-onyx-300 text-sm hover:bg-gold-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loadingReturns ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {returnError && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{returnError}</span>
        </div>
      )}
      {returnSuccess && (
        <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{returnSuccess}</span>
        </div>
      )}

      {loadingReturns ? (
        <div className="flex items-center justify-center py-16 bg-cream-50 rounded-2xl shadow-soft">
          <Loader2 className="h-7 w-7 animate-spin text-gold-500" />
          <span className="ml-3 text-sm text-onyx-200">Loading return requestsâ€¦</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-cream-50 rounded-2xl shadow-soft border border-gold-200/20">
          <ClipboardList className="h-10 w-10 text-onyx-100/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-onyx-300">No return requests found.</p>
          <p className="text-xs text-onyx-100 mt-1">Requests will appear here when customers submit them.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const order = request.order;
            const item = request.item;
            const actions = actionButtons(request);
            const address = [
              order?.shipping_address_line1,
              order?.shipping_address_line2,
              order?.city,
              order?.state,
              order?.pincode,
            ].filter(Boolean).join(', ');

            return (
              <article key={request.id} className="bg-cream-50 rounded-2xl shadow-soft border border-gold-200/20 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs text-onyx-100">Return #{request.id.slice(0, 8)}</span>
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-gold-50 text-onyx-300 border border-gold-200/40">
                          {request.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h3 className="font-serif text-lg font-semibold text-onyx-300">
                        {item?.product_title || 'Product details unavailable'}
                      </h3>
                      <p className="text-xs text-onyx-100 mt-1">
                        Order: {request.order_id.slice(0, 8)} Â· Qty: {item?.quantity ?? 'â€”'} Â· Unit price: {item ? formatINR(Number(item.unit_price)) : 'â€”'}
                      </p>
                    </div>
                    <div className="text-left md:text-right flex-shrink-0">
                      <p className="text-xs text-onyx-100">Requested</p>
                      <p className="text-sm text-onyx-300">{new Date(request.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <div className="rounded-xl bg-cream-100 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-onyx-100 mb-1">Customer</p>
                      <p className="text-sm font-semibold text-onyx-300">{order?.customer_name || 'Name not provided'}</p>
                      <p className="text-xs text-onyx-200 mt-1">User ID: {request.user_id}</p>
                      {order?.primary_phone && <p className="text-xs text-onyx-200 mt-1">Phone: {order.primary_phone}</p>}
                      {order?.backup_phone && <p className="text-xs text-onyx-200 mt-1">Backup: {order.backup_phone}</p>}
                      {address && <p className="text-xs text-onyx-200 mt-1">{address}</p>}
                    </div>
                    <div className="rounded-xl bg-cream-100 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-onyx-100 mb-1">Return reason</p>
                      <p className="text-sm font-semibold text-onyx-300">{request.reason}</p>
                      <p className="text-sm text-onyx-200 mt-1 whitespace-pre-wrap break-words">{request.description}</p>
                      {request.rejection_reason && <p className="text-xs text-red-700 mt-2">Rejection reason: {request.rejection_reason}</p>}
                      {request.admin_note && <p className="text-xs text-onyx-200 mt-2">Admin note: {request.admin_note}</p>}
                      {request.pickup_scheduled_at && <p className="text-xs text-onyx-200 mt-2">Pickup: {new Date(request.pickup_scheduled_at).toLocaleString()}</p>}
                      {request.refund_amount !== null && <p className="text-xs text-onyx-200 mt-2">Refund amount recorded: {formatINR(Number(request.refund_amount))}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => void loadPhotos(request)}
                      disabled={photosLoading && photosFor === request.id}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gold-200/40 text-xs font-semibold text-onyx-300 hover:bg-gold-50 disabled:opacity-50"
                    >
                      {photosLoading && photosFor === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      {photosFor === request.id ? 'Hide photos' : `View photos (${request.photo_count})`}
                    </button>
                    {actions.map(({ action, label }) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void handleAction(request, action)}
                        disabled={busyId === request.id}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          action === 'reject' || action === 'cancel' || action === 'inspection_failed'
                            ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                            : 'gold-gradient text-cream-100 hover:opacity-90'
                        }`}
                      >
                        {busyId === request.id ? <Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1" /> : null}
                        {label}
                      </button>
                    ))}
                  </div>

                  {photosFor === request.id && (
                    <div className="mt-4 border-t border-gold-200/30 pt-4">
                      {photoError && <p className="text-sm text-red-700 mb-3">{photoError}</p>}
                      {photosLoading ? (
                        <p className="text-xs text-onyx-200">Generating secure photo linksâ€¦</p>
                      ) : photos.length === 0 ? (
                        <p className="text-xs text-onyx-100">No photos attached to this request.</p>
                      ) : (
                        <>
                          <p className="text-xs text-onyx-100 mb-3">Secure photo links expire after five minutes.</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                            {photos.map((photo) => (
                              <a
                                key={photo.path}
                                href={photo.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-xl overflow-hidden border border-gold-200/30 bg-cream-100 aspect-square"
                                title="Open return photo in a new tab"
                              >
                                <img src={photo.signed_url} alt="Customer return evidence" loading="lazy" className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2">
            <p className="text-xs text-onyx-100">
              Showing {page * pageSize + 1}â€“{Math.min((page + 1) * pageSize, total)} of {total} requests
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loadingReturns}
                onClick={() => void loadReturns(page - 1)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gold-200/40 text-xs text-onyx-300 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                type="button"
                disabled={(page + 1) * pageSize >= total || loadingReturns}
                onClick={() => void loadReturns(page + 1)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gold-200/40 text-xs text-onyx-300 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}


type AdminOrder = {
  id: string;
  user_id: string;
  total_amount: number;
  status: string | null;
  payment_method: string | null;
  customer_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  primary_phone: string | null;
  backup_phone: string | null;
  created_at: string;
  payment_status: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
};

const DELIVERY_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'delivery_failed', label: 'Delivery failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function OrderManagementPanel() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadOrders = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoadingOrders(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase.functions.invoke(
        'admin-list-orders',
        { body: {} },
      );
      if (queryError) throw queryError;
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.orders)) {
        throw new Error('The server returned an invalid order list.');
      }
      setOrders(data.orders as AdminOrder[]);
    } catch (err: any) {
      setError(err?.message || 'Could not load orders. Verify administrator access and the order-list function.');
    } finally {
      setLoadingOrders(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const updateDeliveryStatus = async (order: AdminOrder, nextStatus: string) => {
    if (nextStatus === (order.delivery_status || 'pending')) return;
    const label = DELIVERY_STATUSES.find((item) => item.value === nextStatus)?.label || nextStatus;
    if (!window.confirm(`Change delivery status for order ${order.id.slice(0, 8)} to â€œ${label}â€?`)) return;
    setBusyId(order.id);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: updateError } = await supabase.functions.invoke(
        'admin-update-delivery',
        {
          body: {
            order_id: order.id,
            delivery_status: nextStatus,
            expected_delivery_status: order.delivery_status || 'pending',
          },
        },
      );

      if (updateError) throw updateError;
      if (data?.error) throw new Error(data.error);

      const updatedOrder = data?.order;
      if (!updatedOrder) {
        throw new Error('The server did not return the updated order.');
      }

      setOrders((current) => current.map((item) => item.id === order.id
        ? {
            ...item,
            status: updatedOrder.status,
            delivery_status: updatedOrder.delivery_status,
            delivered_at: updatedOrder.delivered_at,
          }
        : item));
      setSuccess(`Order ${order.id.slice(0, 8)} delivery status updated to ${label}.`);
    } catch (err: any) {
      setError(err?.message || 'Could not update delivery status. Check your admin RLS policy.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-onyx-300">Order Management</h2>
          <p className="text-xs text-onyx-100 mt-1">Review customer orders and manage delivery progress.</p>
        </div>
        <button type="button" onClick={() => void loadOrders(true)} disabled={refreshing || loadingOrders} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gold-200/40 bg-cream-50 text-onyx-300 text-sm hover:bg-gold-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh orders
        </button>
      </div>
      {error && <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span></div>}
      {success && <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3"><CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{success}</span></div>}
      {loadingOrders ? (
        <div className="flex items-center justify-center py-16 bg-cream-50 rounded-2xl shadow-soft"><Loader2 className="h-7 w-7 animate-spin text-gold-500" /><span className="ml-3 text-sm text-onyx-200">Loading ordersâ€¦</span></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-cream-50 rounded-2xl shadow-soft border border-gold-200/20"><ShoppingBag className="h-10 w-10 text-onyx-100/40 mx-auto mb-3" /><p className="text-sm font-medium text-onyx-300">No orders found.</p><p className="text-xs text-onyx-100 mt-1">Orders will appear here after the checkout flow creates them.</p></div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const address = [order.shipping_address_line1, order.shipping_address_line2, order.city, order.state, order.pincode].filter(Boolean).join(', ');
            return <article key={order.id} className="bg-cream-50 rounded-2xl shadow-soft border border-gold-200/20 p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-onyx-100">Order #{order.id.slice(0, 8)} Â· {new Date(order.created_at).toLocaleString()}</p>
                  <h3 className="font-serif text-lg font-semibold text-onyx-300 mt-1">{order.customer_name || 'Customer name not provided'}</h3>
                  <p className="text-xs text-onyx-200 mt-1">{order.primary_phone || 'No phone'}{order.backup_phone ? ` Â· Backup: ${order.backup_phone}` : ''}</p>
                  {address && <p className="text-xs text-onyx-200 mt-1">{address}</p>}
                  <p className="text-[11px] text-onyx-100 mt-1 break-all">Customer ID: {order.user_id}</p>
                </div>
                <div className="md:text-right flex-shrink-0">
                  <p className="font-display text-xl font-bold text-onyx-300">{formatINR(Number(order.total_amount) || 0)}</p>
                  <p className="text-xs text-onyx-200 mt-1">Payment: {order.payment_method || 'â€”'} Â· {order.payment_status || 'Unspecified'}</p>
                  <p className="text-xs text-onyx-200 mt-1">Order status: {order.status || 'â€”'}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gold-200/30 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-onyx-300"><Truck className="h-4 w-4 text-gold-500" /><label htmlFor={`delivery-${order.id}`} className="font-medium">Delivery status</label></div>
                <select id={`delivery-${order.id}`} value={order.delivery_status || 'pending'} onChange={(event) => void updateDeliveryStatus(order, event.target.value)} disabled={busyId === order.id} className="w-full sm:w-auto min-w-48 px-3 py-2.5 bg-white border border-gold-200/50 rounded-lg text-sm text-onyx-300 disabled:opacity-50">
                  {DELIVERY_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  {order.delivery_status && !DELIVERY_STATUSES.some((status) => status.value === order.delivery_status) && <option value={order.delivery_status}>{order.delivery_status.replace(/_/g, ' ')}</option>}
                </select>
                {busyId === order.id && <Loader2 className="h-4 w-4 animate-spin text-gold-500" />}
                {order.delivered_at && <p className="text-xs text-onyx-100">Delivered: {new Date(order.delivered_at).toLocaleString()}</p>}
              </div>
            </article>;
          })}
          <p className="text-xs text-onyx-100">Showing up to 100 most recent orders.</p>
        </div>
      )}
    </section>
  );
}

export function AdminPage({ onNavigate }: AdminPageProps) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showReturns, setShowReturns] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showHeroMedia, setShowHeroMedia] = useState(false);

  // Compressed Image Asset Processing States
  const [, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<{ original: string; compressed: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setProducts(data ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve inventory listings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchProducts();
    }
  }, [user, isAdmin, fetchProducts]);

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      title: product.title,
      description: product.description || '',
      original_price: product.original_price,
      selling_price: product.selling_price,
      discount_percent: product.discount_percent,
      stock: product.stock,
      image_url: product.image_url,
      material_type: product.material_type || '',
      polish_finish: product.polish_finish || '',
      dimensions: product.dimensions || '',
      category: product.category,
      sub_category: product.sub_category || '',
      occasion_wear: product.occasion_wear || '',
      is_featured: product.is_featured,
    });
    setImagePreview(product.image_url);
    setUploadInfo(null);
    setUploadFile(null);
    setError(null);
    setSuccess(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImagePreview('');
    setUploadInfo(null);
    setUploadFile(null);
    setError(null);
    setSuccess(null);
    setShowForm(true);
  };
const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Maximum source file size: 100MB
  if (file.size > 100 * 1024 * 1024) {
    setError('File too large. Maximum 100MB.');
    return;
  }

  // Allow only supported product image formats
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    setError(
      'Invalid file type. Please upload JPG, JPEG, PNG, or WebP images only.'
    );
    return;
  }

  setUploadFile(file);
  setError(null);

  setUploadInfo({
    original: formatFileSize(file.size),
    compressed: 'Compressing...',
  });
  

    // Instantly display high performance local URL preview object
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      setUploading(true);
      const compressed = await compressImageToWebP(file);
      
      setUploadInfo({
        original: formatFileSize(file.size),
        compressed: formatFileSize(compressed.size),
      });

      const fileName = `product-${Date.now()}.webp`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, compressed, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setForm((prev) => ({ ...prev, image_url: urlData.publicUrl }));
      setImagePreview(urlData.publicUrl);
    } catch (err: any) {
      setError(err.message || 'Image asset processing failed.');
      setUploadInfo(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuth(true);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    // Compute automatic pricing fallback calculations
    const computedDiscount = form.discount_percent || calculateDiscount(Number(form.original_price), Number(form.selling_price));
    const payload = { ...form, discount_percent: computedDiscount };

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (updateError) throw updateError;
        setSuccess('Product details successfully updated.');
      } else {
        const { error: insertError } = await supabase
          .from('products')
          .insert(payload);
        if (insertError) throw insertError;
        setSuccess('New luxury product successfully created.');
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      setImagePreview('');
      setUploadFile(null);
      setUploadInfo(null);
      setEditingId(null);
      await fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to save catalogue data.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (!confirm('Delete this product? This cannot be undone.')) return;

    setError(null);
    setSuccess(null);
    try {
      const { error: delError } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (delError) throw delError;
      setSuccess('Item successfully deleted from database.');
      await fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Deletion operation aborted by server.');
    }
  };

  // Auth Loading Shield Wrapper
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-gold-500 animate-spin mx-auto mb-2" />
          <p className="text-sm text-onyx-200">Verifying administrative security credentials...</p>
        </div>
      </div>
    );
  }

  // Admin Security Door Clearance Check
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-cream-50 p-8 rounded-3xl shadow-soft text-center border border-gold-200/20">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Package className="h-8 w-8 text-gold-500" />
          </div>
          <h2 className="font-display text-2xl font-bold text-onyx-300 mb-2">Admin Access Required</h2>
          <p className="text-sm text-onyx-200 mb-6 leading-relaxed">
            {!user
              ? 'Please sign in with an administrator account to manage the catalogue.'
              : 'Your account does not have administrator privileges.'}
          </p>
          <div className="flex flex-col gap-3">
            {!user && (
              <button
                onClick={() => setShowAuth(true)}
                className="w-full py-3.5 gold-gradient text-cream-100 font-medium rounded-xl shadow-gold hover:scale-[1.01] transition-transform"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => onNavigate('storefront')}
              className="w-full py-3.5 bg-cream-200 text-onyx-300 font-medium rounded-xl hover:bg-cream-300 transition-colors text-sm"
            >
              Back to Store
            </button>
          </div>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} title="Admin Sign In" />
      </div>
    );
  }

 // Display Computed Automatic Discounts Inline Live
const calculatedLiveDiscount =
  Number(form.original_price) > 0 && Number(form.selling_price) > 0
    ? calculateDiscount(
        Number(form.original_price),
        Number(form.selling_price)
      )
    : 0;

return (
  <div className="min-h-screen bg-cream-100">
    {/* Admin header */}
    <div className="bg-onyx-300 text-cream-100 sticky top-0 z-30 shadow-medium">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate("storefront")}
            className="p-2 rounded-full hover:bg-cream-100/10 transition-colors flex-shrink-0"
            title="Return to store homepage"
            aria-label="Return to store homepage"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold truncate">
              Admin Dashboard
            </h1>
            <p className="text-xs text-cream-300 truncate">
              Yaba's Imitation & Jewellery
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowOrders((current) => !current);
              setShowReturns(false);
              setShowForm(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              showOrders
                ? "bg-cream-100 text-onyx-300"
                : "border border-gold-400/50 text-cream-100 hover:bg-cream-100/10"
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Orders</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowHeroMedia((current) => !current);
              setShowOrders(false);
              setShowReturns(false);
              setShowForm(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              showHeroMedia
                ? "bg-cream-100 text-onyx-300"
                : "border border-gold-400/50 text-cream-100 hover:bg-cream-100/10"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>Hero Media</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowReturns((current) => !current);
              setShowOrders(false);
              setShowForm(false);
              setError(null);
              setSuccess(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
              showReturns
                ? "bg-cream-100 text-onyx-300"
                : "border border-gold-400/50 text-cream-100 hover:bg-cream-100/10"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            <span>Returns</span>
          </button>
          {!showForm && !showReturns && !showOrders && (
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 gold-gradient rounded-full text-sm font-medium shadow-gold hover:scale-[1.02] transition-transform flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
          )}
        </div>
      </div>
    </div>

    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Real-time System Response Notifications */}
      {error && (
        <div className="mb-5 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-5 flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {showOrders ? (
        <OrderManagementPanel />
      ) : showReturns ? (
        <ReturnManagementPanel />
      ) : showHeroMedia ? (
        <HeroMediaManager />
      ) : (
        <>
          {/* Core Product Input Workspace Management Form */}
          {showForm && (
            <div className="mb-6 bg-cream-50 rounded-2xl shadow-soft p-5 sm:p-6 animate-slide-up border border-gold-200/20">
              <div className="flex items-center justify-between mb-5 gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-onyx-300">
                    {editingId
                      ? "Edit Catalogue Item"
                      : "Add New Inventory Piece"}
                  </h2>
                  <p className="text-xs text-onyx-100 mt-1">
                    Manage product details, pricing, inventory and imagery.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                    setImagePreview("");
                    setUploadInfo(null);
                  }}
                  className="p-2 rounded-full hover:bg-cream-200 transition-colors text-onyx-300 flex-shrink-0"
                  aria-label="Close product form"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-5">
                {/* IMAGE UPLOAD SECTION BLOCK */}
                <div>
                  <label className="block text-xs font-medium text-onyx-200 mb-2 uppercase tracking-wider">
                    Product Photograph *
                  </label>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full sm:w-44 h-44 rounded-xl bg-cream-200 overflow-hidden flex items-center justify-center border-2 border-dashed border-gold-200/50 flex-shrink-0">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Product preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-onyx-100/40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-cream-200/50 border border-gold-200/40 rounded-xl text-sm text-onyx-300 cursor-pointer hover:bg-gold-50 transition-colors">
                        <Upload className="h-4 w-4" />
                        {uploading
                          ? "Compressing & Uploading..."
                          : "Choose Product Image"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileSelect}
                          className="hidden"
                          disabled={uploading}
                        />
                      </label>

                      <p className="mt-2 text-xs text-onyx-100">
                        Accepted formats: JPG, JPEG, PNG, WebP. Maximum source
                        size: 100MB.
                      </p>

                      {uploadInfo && (
                        <div className="mt-3 rounded-xl bg-cream-100 border border-gold-200/20 px-3 py-2 text-xs text-onyx-100 space-y-1">
                          <p>
                            Raw Input Volume:{" "}
                            <span className="text-onyx-300 font-medium">
                              {uploadInfo.original}
                            </span>
                          </p>
                          <p>
                            Optimized WebP Footprint:{" "}
                            <span className="text-green-700 font-medium">
                              {uploadInfo.compressed}
                            </span>
                          </p>
                          <p className="text-gold-500">
                            Automatically compressed and scaled for fast
                            customer loading.
                          </p>
                        </div>
                      )}

                      {uploading && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-onyx-200">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing image scaling pipeline...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CORE BASIC TEXT CONTROLS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Item Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., Heritage Micro Plated Choker"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Core Collection Category *
                    </label>
                    <select
                      required
                      value={form.category}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          category: e.target.value,
                          sub_category: "",
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                    >
                      <option value="">Choose Category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ROUTED SUB-CATEGORICAL CLASSIFICATION MATRIX */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Sub-Category Dropdown
                    </label>
                    <select
                      value={form.sub_category}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sub_category: e.target.value,
                        })
                      }
                      disabled={!form.category}
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">Select Sub-Category</option>
                      {form.category &&
                        SUB_CATEGORIES[form.category]?.map((sc) => (
                          <option key={sc} value={sc}>
                            {sc}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Occasion Wear Segment
                    </label>
                    <select
                      value={form.occasion_wear}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          occasion_wear: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                    >
                      <option value="">Select Occasion</option>
                      {OCCASIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ITEM CHARACTERISTICS DESCRIPTION CONTAINER */}
                <div>
                  <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                    Detailed Catalogue Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all resize-none"
                    placeholder="Describe craftsmanship details, design accents, weight profile, or care requirements..."
                  />
                </div>

                {/* PRICING SCHEMA VALUATION BLOCK */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Retail MRP (â‚¹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.original_price || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          original_price: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Optional Max Price"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Selling Price (â‚¹) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={form.selling_price || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          selling_price: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Required Active Price"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Discount Ribbon %
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.discount_percent || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discount_percent: Math.min(
                            100,
                            Math.max(0, Number(e.target.value)),
                          ),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Auto Calculated"
                    />
                    {calculatedLiveDiscount > 0 && (
                      <div className="mt-1.5 text-[10px] text-gold-600 font-medium">
                        Auto-computed: {calculatedLiveDiscount}% Off
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Inventory Stock *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={form.stock || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          stock: Math.max(
                            0,
                            Math.floor(Number(e.target.value)),
                          ),
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="Available Units"
                    />
                  </div>
                </div>

                {/* MATERIAL TECHNICAL SPECIFICATIONS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Material Composition
                    </label>
                    <input
                      type="text"
                      value={form.material_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          material_type: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., Stainless Steel / Brass Core"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Polish / Plating Finish
                    </label>
                    <input
                      type="text"
                      value={form.polish_finish}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          polish_finish: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., 22k High Shine Gold Plated"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-onyx-200 mb-1.5 uppercase tracking-wider">
                      Sizing Dimensions
                    </label>
                    <input
                      type="text"
                      value={form.dimensions}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          dimensions: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-cream-50 border border-gold-200/30 rounded-xl text-sm text-onyx-300 focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-200/20 transition-all"
                      placeholder="E.g., Adjustable Fit / 2.4 Bangles"
                    />
                  </div>
                </div>

                {/* VISIBILITY HIGHLIGHT INTERACTIVE TOGGLE */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_featured}
                      onChange={(e) =>
                        setForm({ ...form, is_featured: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <span className="w-11 h-6 bg-cream-300 rounded-full peer peer-checked:bg-gold-500 transition-all relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-cream-100 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                  <span className="text-sm text-onyx-300">
                    Feature this product on homepage catalog grids
                  </span>
                </div>

                {/* FORM COMMIT SUBMISSION UTILITIES */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving || uploading}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 gold-gradient text-cream-100 font-semibold rounded-xl shadow-gold hover:scale-[1.01] transition-transform disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {editingId
                      ? "Update Product Record"
                      : "Publish Product to Store"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingId(null);
                      setForm(EMPTY_FORM);
                      setImagePreview("");
                      setUploadInfo(null);
                      setError(null);
                    }}
                    className="px-6 py-3.5 bg-cream-200 text-onyx-300 font-medium rounded-xl hover:bg-cream-300 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ACTIVE LIVE GRID CATALOG MONITOR LIST */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-onyx-300">
                  Currently Active Catalogue Listings
                </h2>
                <p className="text-xs text-onyx-100 mt-1">
                  Live inventory synchronized with Supabase.
                </p>
              </div>
              <Package className="h-5 w-5 text-gold-500" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 bg-cream-50 rounded-2xl shadow-soft">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 text-gold-500 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-onyx-200">
                    Syncing database data logs...
                  </p>
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20 bg-cream-50 rounded-2xl shadow-soft border border-gold-200/20">
                <Package className="h-12 w-12 text-onyx-100/40 mx-auto mb-4" />
                <p className="text-sm text-onyx-100">
                  No luxury inventory records active. Click "Add Product" to
                  populate.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-cream-50 rounded-2xl shadow-soft overflow-hidden flex flex-col border border-gold-200/20"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-cream-200">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-10 w-10 text-onyx-100/40" />
                        </div>
                      )}

                      {product.is_featured && (
                        <div className="absolute top-3 left-3 text-[10px] bg-gold-500 text-cream-100 px-2.5 py-1 rounded-full font-semibold shadow-gold">
                          Featured Spot
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-serif text-base font-semibold text-onyx-300 line-clamp-2 flex-1">
                          {product.title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-onyx-100 mb-3">
                        <span>{product.category}</span>
                        <span>Â·</span>
                        <span>Sub: {product.sub_category || "None"}</span>
                        <span>Â·</span>
                        <span
                          className={
                            product.stock === 0
                              ? "text-red-600 font-bold"
                              : "text-onyx-200"
                          }
                        >
                          Units: {product.stock}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <span className="font-display text-lg font-bold text-onyx-300">
                          {formatINR(product.selling_price)}
                        </span>

                        {Number(product.original_price) >
                          Number(product.selling_price) && (
                          <span className="text-xs text-onyx-100 line-through">
                            {formatINR(product.original_price)}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex gap-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-cream-200 text-onyx-300 text-xs font-semibold rounded-xl hover:bg-gold-50 border border-gold-200/30 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit Details
                        </button>

                        <button
                          onClick={() => handleDelete(product.id)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-50/60 text-red-600 text-xs rounded-xl hover:bg-red-100 border border-red-200/20 transition-all"
                          title="Permanently remove item from database"
                          aria-label={`Delete ${product.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  </div>
);
}
